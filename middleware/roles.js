import { forbidden } from "../utils/httpError.js";

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    next(forbidden(`${roles.join(" or ")} access required`));
    return;
  }

  next();
};

export const requireAdmin = requireRole("admin");
