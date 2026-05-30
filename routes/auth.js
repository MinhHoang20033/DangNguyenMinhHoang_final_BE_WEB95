import express from "express";

import asyncHandler from "../middleware/asyncHandler.js";
import {
  login,
  requestPasswordOtp,
  resetPasswordWithOtp,
  verifyPasswordOtp,
} from "../controllers/authController.js";

const router = express.Router();

router.post("/login", asyncHandler(login));
router.post("/request-password-otp", asyncHandler(requestPasswordOtp));
router.post("/verify-password-otp", asyncHandler(verifyPasswordOtp));
router.post("/reset-password-with-otp", asyncHandler(resetPasswordWithOtp));

export default router;
