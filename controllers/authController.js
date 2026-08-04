
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

const normalizeEmail = (email) => (email == null ? "" : String(email).trim().toLowerCase());

const findEmployeeByEmail = async (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }

  return Employee.findOne({
    email: { $regex: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  });
};

const findEmployeeAccountByEmail = async (email) => {
  const employee = await findEmployeeByEmail(email);
  if (!employee) {
    throw notFound("Email nhân viên không tồn tại");
  }

  const user = await User.findOne({
    employeeId: employee._id,
    role: { $in: ["employee", "PM"] },
  });

  return { employee, user };
};

const hashOtp = (otp) => crypto.createHash("sha256").update(String(otp).trim()).digest("hex");

export const login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    throw badRequest("Vui lòng nhập tên đăng nhập và mật khẩu");
  }

  const user = await User.findOne({ username });
  if (!user) {
    throw unauthorized("Tên đăng nhập hoặc mật khẩu không đúng");
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    throw unauthorized("Tên đăng nhập hoặc mật khẩu không đúng");
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
    throw badRequest("Vui lòng nhập email");
  }

  const { employee, user } = await findEmployeeAccountByEmail(email);
  const recipientEmail = normalizeEmail(email);

  const now = new Date();
  const otp = String(Math.floor(100000 + Math.random() * 900000));

  user.passwordResetOtpHash = hashOtp(otp);
  user.passwordResetOtpExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  await user.save();

  await sendOtpEmail({
    to: recipientEmail,
    otp,
    employeeName: employee.name,
  });

  res.json({ email: recipientEmail });
};

export const verifyPasswordOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    throw badRequest("Vui lòng nhập email và mã OTP");
  }

  const { user } = await findEmployeeAccountByEmail(email);
  if (!user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
    throw badRequest("Chưa có mã OTP. Vui lòng gửi lại OTP");
  }

  if (new Date(user.passwordResetOtpExpiresAt).getTime() < Date.now()) {
    throw badRequest("Mã OTP đã hết hạn. Vui lòng gửi lại OTP");
  }

  if (hashOtp(otp) !== user.passwordResetOtpHash) {
    throw badRequest("Mã OTP không đúng");
  }

  const resetToken = jwt.sign(
    {
      userId: user._id.toString(),
      purpose: "password-reset",
    },
    process.env.JWT_SECRET,
    { expiresIn: "10m" },
  );

  res.json({ resetToken });
};

export const resetPasswordWithOtp = async (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) {
    throw badRequest("Thiếu thông tin đổi mật khẩu");
  }

  if (String(newPassword).length < 6) {
    throw badRequest("Mật khẩu mới phải có ít nhất 6 ký tự");
  }

  let payload;
  try {
    payload = jwt.verify(resetToken, process.env.JWT_SECRET);
  } catch {
    throw badRequest("Phiên đổi mật khẩu đã hết hạn. Vui lòng gửi lại OTP");
  }

  if (payload.purpose !== "password-reset" || !payload.userId) {
    throw badRequest("Phiên đổi mật khẩu không hợp lệ");
  }

  const user = await User.findById(payload.userId);
  if (!user) {
    throw notFound("Tài khoản không tồn tại");
  }

  if (!user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
    throw badRequest("Phiên xác thực OTP không còn hiệu lực. Vui lòng gửi lại OTP");
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.passwordResetOtpHash = "";
  user.passwordResetOtpExpiresAt = null;
  await user.save();

  res.json({ ok: true });
};
