import express from "express";

import {
  createEmployee,
  deleteEmployee,
  getEmployee,
  getEmployees,
  updateEmployee,
} from "../controllers/employeeController.js";
import auth from "../middleware/auth.js";
import asyncHandler from "../middleware/asyncHandler.js";
import upload from "../middleware/upload.js";
import { requireAdmin } from "../middleware/roles.js";

const router = express.Router();

router.use(auth);

router.get("/", asyncHandler(getEmployees));
router.get("/:id", requireAdmin, asyncHandler(getEmployee));
router.post("/", requireAdmin, upload.single("avatar"), asyncHandler(createEmployee));
router.put("/:id", requireAdmin, upload.single("avatar"), asyncHandler(updateEmployee));
router.delete("/:id", requireAdmin, asyncHandler(deleteEmployee));

export default router;
