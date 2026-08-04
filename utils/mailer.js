import nodemailer from "nodemailer";

import { badRequest } from "./httpError.js";

const buildTransporter = () => {
  const service = process.env.SMTP_SERVICE;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass || (!service && !host)) {
    return null;
  }

  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;

  return nodemailer.createTransport({
    ...(service ? { service } : { host }),
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
};

export const sendOtpEmail = async ({ to, otp, employeeName }) => {
  const transporter = buildTransporter();
  const recipientName = employeeName || "bạn";

  if (!transporter) {
    throw badRequest("Dịch vụ email chưa được cấu hình. Vui lòng liên hệ quản trị viên.");
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  try {
    await transporter.sendMail({
      from,
      to,
      subject: "Mã OTP đổi mật khẩu",
      text: `Xin chào ${recipientName}, mã OTP đổi mật khẩu của bạn là ${otp}. Mã có hiệu lực trong 10 phút.`,
      html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Mã OTP đổi mật khẩu</h2>
        <p>Xin chào ${recipientName},</p>
        <p>Mã OTP đổi mật khẩu của bạn là:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${otp}</p>
        <p>Mã có hiệu lực trong 10 phút.</p>
      </div>
    `,
    });
  } catch (error) {
    console.error("[SMTP] Gửi OTP thất bại:", error.message);
    throw badRequest("Không gửi được email OTP. Vui lòng thử lại sau hoặc liên hệ quản trị viên.");
  }
};
