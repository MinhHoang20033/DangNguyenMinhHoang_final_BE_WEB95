import Project from "../models/Project.js";
import { badRequest, forbidden, notFound } from "../utils/httpError.js";
import {
  buildProjectQuery,
  buildProjectUpdatePayload,
  buildUploadedFileRecords,
  collectTaskFileUrls,
  createActivityLogEntry,
  deleteFilesByUrls,
  deleteProjectUploadDirectory,
  ensureProjectUploadDirectory,
  EXCEL_EXTENSIONS,
  getActorName,
  getProjectUploadSubdir,
  canManageProjectOperations,
  canDeleteTaskAttachmentFile,
  canDeleteTaskSubmissionFile,
  canInteractWithTaskFiles,
  canUploadTaskSubmissionFiles,
  isAdmin,
  sanitizeProjectTasksForViewer,
  TASK_SECTION_LABEL,
} from "../services/projectService.js";

export const getProjects = async (req, res) => {
  const projects = await Project.find(buildProjectQuery(req));
  res.json(projects.map((project) => sanitizeProjectTasksForViewer(project, req)));
};

export const getProject = async (req, res) => {
  const project = await Project.findOne({
    _id: req.params.id,
    ...buildProjectQuery(req),
  });

  if (!project) {
    throw notFound("Project not found");
  }

  res.json(sanitizeProjectTasksForViewer(project, req));
};

export const createProject = async (req, res) => {
  if (!isAdmin(req)) {
    throw forbidden("Admin access required");
  }

  const project = new Project(req.body);
  await project.save();
  ensureProjectUploadDirectory(project);

  res.json(project);
};

export const loadProjectForUpload = async (req, res, next) => {
  const project = await Project.findOne({
    _id: req.params.id,
    ...buildProjectQuery(req),
  });

  if (!project) {
    throw notFound("Project not found");
  }

  req.project = project;
  req.uploadSubdir = getProjectUploadSubdir(project);
  next();
};

export const uploadProjectFiles = async (req, res) => {
  if (!canManageProjectOperations(req, req.project)) {
    throw forbidden("Chỉ quản lý dự án và admin mới được tải tệp liên quan dự án");
  }

  const uploadedFiles = buildUploadedFileRecords(req.files, req.uploadSubdir);
  if (!uploadedFiles.length) {
    throw badRequest("No files uploaded");
  }

  req.project.relatedFiles = [...(req.project.relatedFiles ?? []), ...uploadedFiles];

  const actorName = await getActorName(req);
  req.project.activityLogs = [
    ...(req.project.activityLogs ?? []),
    createActivityLogEntry({
      actorName,
      sectionKey: "relatedFiles",
      sectionLabel: "Tệp liên quan dự án",
      text: `${actorName} đã tải lên ${uploadedFiles.length} tệp liên quan dự án`,
    }),
  ];

  await req.project.save();

  res.json(req.project);
};

const findTask = (project, taskId) => {
  const task = (project.tasks ?? []).find((item) => item.id === taskId);
  if (!task) {
    throw notFound("Task not found");
  }
  return task;
};

const appendTaskFiles = async ({
  req,
  res,
  scope,
  noFilesMessage,
  activityText,
  requireManager = false,
  trackUploader = false,
}) => {
  if (requireManager && !canManageProjectOperations(req, req.project)) {
    throw forbidden("Chỉ quản lý dự án và admin mới được tải tệp cho task");
  }

  const task = findTask(req.project, req.params.taskId);

  if (trackUploader && !canUploadTaskSubmissionFiles(req, req.project, task)) {
    throw forbidden("Chỉ người được giao task mới được gửi file hoàn thành");
  }

  const uploaderId = trackUploader ? String(req.user?.employeeId ?? "") : "";
  if (trackUploader && !canManageProjectOperations(req, req.project) && !uploaderId) {
    throw forbidden("Tài khoản không liên kết nhân viên");
  }

  const uploadedFiles = buildUploadedFileRecords(req.files, req.uploadSubdir, EXCEL_EXTENSIONS, {
    uploadedBy: trackUploader ? uploaderId : "",
  });

  if (!uploadedFiles.length) {
    throw badRequest(noFilesMessage);
  }

  task[scope] = [...(task[scope] ?? []), ...uploadedFiles];
  task.updatedAt = new Date();

  const actorName = await getActorName(req);
  req.project.activityLogs = [
    ...(req.project.activityLogs ?? []),
    createActivityLogEntry({
      actorName,
      sectionKey: "tasks",
      sectionLabel: TASK_SECTION_LABEL,
      text: activityText(actorName, task),
    }),
  ];

  await req.project.save();
  res.json(sanitizeProjectTasksForViewer(req.project, req));
};

export const uploadTaskFiles = async (req, res) =>
  appendTaskFiles({
    req,
    res,
    scope: "files",
    requireManager: true,
    noFilesMessage: "No Excel files uploaded",
    activityText: (actorName, task) =>
      `${actorName} đã tải lên tệp Excel cho task ${task.title || "công việc"}`,
  });

export const uploadTaskSubmissionFiles = async (req, res) =>
  appendTaskFiles({
    req,
    res,
    scope: "submissionFiles",
    trackUploader: true,
    noFilesMessage: "No Excel files uploaded",
    activityText: (actorName, task) =>
      `${actorName} đã gửi lại tệp hoàn thành cho task ${task.title || "công việc"}`,
  });

export const deleteTaskFile = async (req, res) => {
  const project = await Project.findOne({
    _id: req.params.id,
    ...buildProjectQuery(req),
  });
  if (!project) {
    throw notFound("Project not found");
  }

  const task = findTask(project, req.params.taskId);
  const scope = req.query.scope === "submissionFiles" ? "submissionFiles" : "files";
  const targetFile = (task[scope] ?? []).find((file) => file.id === req.params.fileId);
  if (!targetFile) {
    throw notFound("File not found");
  }

  if (!canInteractWithTaskFiles(req, project, task)) {
    throw forbidden("Chỉ người được giao task mới được thao tác với file của task này");
  }

  if (scope === "submissionFiles") {
    if (!canDeleteTaskSubmissionFile(req, project, task, targetFile)) {
      throw forbidden("Bạn chỉ có thể xóa file gửi lại do chính mình tải lên");
    }
  } else if (!canDeleteTaskAttachmentFile(req, project)) {
    throw forbidden("Chỉ quản lý dự án và admin mới được xóa tệp đính kèm task");
  }

  task[scope] = (task[scope] ?? []).filter((file) => file.id !== req.params.fileId);
  task.updatedAt = new Date();

  const actorName = await getActorName(req);
  project.activityLogs = [
    ...(project.activityLogs ?? []),
    createActivityLogEntry({
      actorName,
      sectionKey: "tasks",
      sectionLabel: TASK_SECTION_LABEL,
      text:
        scope === "submissionFiles"
          ? `${actorName} đã xóa tệp gửi lại của task ${task.title || "công việc"}`
          : `${actorName} đã xóa tệp đính kèm của task ${task.title || "công việc"}`,
    }),
  ];

  await project.save();
  await deleteFilesByUrls([targetFile.url].filter(Boolean));

  res.json(sanitizeProjectTasksForViewer(project, req));
};

export const deleteProjectFile = async (req, res) => {
  if (!isAdmin(req)) {
    throw forbidden("Admin access required");
  }

  const project = await Project.findById(req.params.id);
  if (!project) {
    throw notFound("Project not found");
  }

  const targetFile = (project.relatedFiles ?? []).find((file) => file.id === req.params.fileId);
  if (!targetFile) {
    throw notFound("File not found");
  }

  project.relatedFiles = (project.relatedFiles ?? []).filter((file) => file.id !== req.params.fileId);

  const actorName = await getActorName(req);
  project.activityLogs = [
    ...(project.activityLogs ?? []),
    createActivityLogEntry({
      actorName,
      sectionKey: "relatedFiles",
      sectionLabel: "Tệp liên quan dự án",
      text: `${actorName} đã xóa tệp liên quan «${targetFile.name || targetFile.originalName || "tệp"}»`,
    }),
  ];

  await project.save();
  await deleteFilesByUrls([targetFile.url].filter(Boolean));

  res.json(project);
};

export const deleteProject = async (req, res) => {
  if (!isAdmin(req)) {
    throw forbidden("Admin access required");
  }

  const project = await Project.findById(req.params.id);
  if (!project) {
    throw notFound("Project not found");
  }

  const relatedFileUrls = (project.relatedFiles ?? []).map((file) => file.url).filter(Boolean);
  const taskFileUrls = (project.tasks ?? []).flatMap((task) => collectTaskFileUrls(task));

  await Project.findByIdAndDelete(req.params.id);
  await deleteFilesByUrls([...relatedFileUrls, ...taskFileUrls]);
  await deleteProjectUploadDirectory(project);

  res.json({ message: "Deleted" });
};

export const updateProject = async (req, res) => {
  const existing = await Project.findOne({
    _id: req.params.id,
    ...buildProjectQuery(req),
  });

  if (!existing) {
    throw notFound("Project not found");
  }

  const { removedTaskFileUrls, updatePayload, unsetDeprecatedFields } = await buildProjectUpdatePayload({
    req,
    existing,
  });
  const editableKeys = Object.keys(updatePayload).filter((key) => key !== "activityLogs");
  if (!isAdmin(req) && editableKeys.length === 0) {
    throw forbidden("You can only update project progress data");
  }

  const mongoUpdate = {
    ...updatePayload,
    ...(unsetDeprecatedFields?.length && {
      $unset: Object.fromEntries(unsetDeprecatedFields.map((field) => [field, ""])),
    }),
  };

  const updated = await Project.findByIdAndUpdate(req.params.id, mongoUpdate, {
    new: true,
    runValidators: true,
  });

  if (removedTaskFileUrls.length) {
    await deleteFilesByUrls(removedTaskFileUrls);
  }

  res.json(sanitizeProjectTasksForViewer(updated, req));
};
