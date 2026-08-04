import express from "express";

import {
  authorizeProjectFileUpload,
  authorizeTaskFileUpload,
  authorizeTaskSubmissionUpload,
  createProject,
  deleteProject,
  deleteProjectFile,
  deleteTaskFile,
  getProject,
  getProjectChatMessages,
  getProjects,
  loadProjectForUpload,
  updateProject,
  uploadProjectFiles,
  uploadTaskFiles,
  uploadTaskSubmissionFiles,
} from "../controllers/projectController.js";
import auth from "../middleware/auth.js";
import asyncHandler from "../middleware/asyncHandler.js";
import upload from "../middleware/upload.js";

const router = express.Router();

router.use(auth);

router.get("/", asyncHandler(getProjects));
router.get("/:id/chat-messages", asyncHandler(getProjectChatMessages));
router.get("/:id", asyncHandler(getProject));
router.post("/", asyncHandler(createProject));
router.put("/:id", asyncHandler(updateProject));
router.delete("/:id", asyncHandler(deleteProject));

router.post(
  "/:id/files",
  asyncHandler(loadProjectForUpload),
  asyncHandler(authorizeProjectFileUpload),
  upload.array("files", 10),
  asyncHandler(uploadProjectFiles),
);

router.delete("/:id/files/:fileId", asyncHandler(deleteProjectFile));

router.post(
  "/:id/tasks/:taskId/files",
  asyncHandler(loadProjectForUpload),
  asyncHandler(authorizeTaskFileUpload),
  upload.array("files", 10),
  asyncHandler(uploadTaskFiles),
);

router.post(
  "/:id/tasks/:taskId/submission-files",
  asyncHandler(loadProjectForUpload),
  asyncHandler(authorizeTaskSubmissionUpload),
  upload.array("files", 10),
  asyncHandler(uploadTaskSubmissionFiles),
);

router.delete("/:id/tasks/:taskId/files/:fileId", asyncHandler(deleteTaskFile));

export default router;
