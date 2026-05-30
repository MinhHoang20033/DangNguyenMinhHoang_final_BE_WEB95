/* global process */
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";

import Employee from "../models/Employee.js";
import User from "../models/User.js";
import { sendOtpEmail } from "../utils/mailer.js";
import { badRequest, notFound, unauthorized } from "../utils/httpError.js";

const signAuthToken = (user) =>
  jwt.sign(
    {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
      employeeId: user.employeeId?.toString() ?? null,
    },
    process.env.JWT_SECRET,
    { expiresIn: "2h" },
  );

const findEmployeeAccountByEmail = async (email) => {
  const employee = await Employee.findOne({ email: String(email).trim() });
  if (!employee) {
    throw notFound("Employee email not found");
  }

  const user = await User.findOne({
    employeeId: employee._id,
    role: { $in: ["employee", "PM"] },
  });
  if (!user) {
    throw notFound("Employee account not found");
  }

  return { employee, user };
};

const hashOtp = (otp) => crypto.createHash("sha256").update(String(otp).trim()).digest("hex");

export const login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    throw badRequest("Username and password are required");
  }

  const user = await User.findOne({ username });
  if (!user) {
    throw unauthorized("Invalid credentials");
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    throw unauthorized("Invalid credentials");
  }

  res.json({
    token: signAuthToken(user),
    user: {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      employeeId: user.employeeId?.toString() ?? null,
    },
  });
};

export const requestPasswordOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw badRequest("Email is required");
  }

  const { employee, user } = await findEmployeeAccountByEmail(email);
  const now = new Date();
  const otp = String(Math.floor(100000 + Math.random() * 900000));

  user.passwordResetOtpHash = hashOtp(otp);
  user.passwordResetOtpExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  user.passwordResetOtpRequestedAt = now;
  await user.save();

  const mailResult = await sendOtpEmail({
    to: employee.email,
    otp,
    employeeName: employee.name,
  });

  res.json({
    message: mailResult.previewMode ? "OTP generated in preview mode" : "OTP sent successfully",
    previewMode: mailResult.previewMode,
    previewOtp: mailResult.previewOtp,
  });
};

export const verifyPasswordOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    throw badRequest("Email and OTP are required");
  }

  const { employee, user } = await findEmployeeAccountByEmail(email);
  if (!user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
    throw badRequest("OTP has not been requested");
  }

  if (new Date(user.passwordResetOtpExpiresAt).getTime() < Date.now()) {
    throw badRequest("OTP has expired");
  }

  if (hashOtp(otp) !== user.passwordResetOtpHash) {
    throw badRequest("OTP is invalid");
  }

  const resetToken = jwt.sign(
    {
      userId: user._id.toString(),
      email: employee.email,
      purpose: "password-reset",
    },
    process.env.JWT_SECRET,
    { expiresIn: "10m" },
  );

  res.json({
    message: "OTP verified successfully",
    resetToken,
  });
};

export const resetPasswordWithOtp = async (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) {
    throw badRequest("Reset token and new password are required");
  }

  if (String(newPassword).length < 6) {
    throw badRequest("New password must be at least 6 characters");
  }

  let payload;
  try {
    payload = jwt.verify(resetToken, process.env.JWT_SECRET);
  } catch {
    throw badRequest("Reset token is invalid or expired");
  }

  if (payload.purpose !== "password-reset" || !payload.userId) {
    throw badRequest("Reset token is invalid");
  }

  const user = await User.findById(payload.userId);
  if (!user) {
    throw notFound("Account not found");
  }

  if (!user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
    throw badRequest("OTP verification session is not available");
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.passwordResetOtpHash = "";
  user.passwordResetOtpExpiresAt = null;
  user.passwordResetOtpRequestedAt = null;
  await user.save();

  res.json({ message: "Password updated successfully" });
};
