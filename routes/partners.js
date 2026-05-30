import express from "express";

import {
  createPartner,
  deletePartner,
  getPartners,
  updatePartner,
} from "../controllers/partnerController.js";
import auth from "../middleware/auth.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { requireAdmin } from "../middleware/roles.js";

const router = express.Router();

router.use(auth);
router.use(requireAdmin);

router.get("/", asyncHandler(getPartners));
router.post("/", asyncHandler(createPartner));
router.put("/:id", asyncHandler(updatePartner));
router.delete("/:id", asyncHandler(deletePartner));

export default router;
