import { isHttpError } from "../utils/httpError.js";

export const notFoundHandler = (req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
};

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const statusCode = isHttpError(error)
    ? error.statusCode
    : error.type === "entity.too.large"
      ? 413
      : 500;
  const message =
    error.type === "entity.too.large"
      ? "Dữ liệu gửi lên quá lớn. Vui lòng thử lại hoặc liên hệ quản trị viên."
      : error.message || "Internal server error";

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({ error: message });
};
