
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

import Employee from "../models/Employee.js";
import { uploadProjectFileBuffer, isSupabaseConfigured } from "../config/supabase.js";
import {
  createUniqueFilename,
  deleteUploadByUrl,
  ensureUploadDirectory,
  getUploadRoot,
  sanitizeUploadFolderName,
} from "../middleware/upload.js";
import { forbidden } from "../utils/httpError.js";

export const MEMBER_EDITABLE_FIELDS = ["chatMessages", "tasks"];

const getNonAdminEditableFields = (canManageProjectOps) =>
  canManageProjectOps
    ? [...MEMBER_EDITABLE_FIELDS, PROGRESS_SECTION_KEY]
    : MEMBER_EDITABLE_FIELDS;

export const PROGRESS_SECTION_KEY = "progressChecks";
export const PROGRESS_SECTION_LABEL = "Tiến độ dự án";

export const FORBIDDEN_PM_OR_ADMIN_TASKS =
  "Chỉ PM (thành viên dự án) và admin mới được thêm hoặc xóa task";
export const FORBIDDEN_PM_OR_ADMIN_TASK_FILES =
  "Chỉ PM (thành viên dự án) và admin mới được tải tệp đính kèm task";
export const FORBIDDEN_PM_OR_ADMIN_PROJECT_FILES =
  "Chỉ PM (thành viên dự án) và admin mới được tải tệp liên quan dự án";
export const FORBIDDEN_PM_OR_ADMIN_PROGRESS =
  "Chỉ PM (thành viên dự án) và admin mới được chỉnh sửa tiến độ dự án";

const isProjectMember = (project, employeeId) => {
  const id = employeeId == null ? "" : String(employeeId);
  if (!id) {
    return false;
  }
  return (project?.members ?? []).some(
    (member) => String(member.employeeId) === id,
  );
};

export const canManageProjectOperations = (req, project) =>
  isAdmin(req) ||
  (req.user?.role === "PM" &&
    req.user?.employeeId &&
    isProjectMember(project, req.user.employeeId));

export const isTaskAssignee = (task, employeeId) => {
  const id = employeeId == null ? "" : String(employeeId);
  if (!id) {
    return false;
  }
  return (task?.assigneeIds ?? []).map(String).includes(id);
};

export const canInteractWithTaskFiles = (req, project, task) =>
  canManageProjectOperations(req, project) || isTaskAssignee(task, req.user?.employeeId);

export const canDeleteTaskSubmissionFile = (req, project, task, file) => {
  if (canManageProjectOperations(req, project)) {
    return true;
  }
  const employeeId = req.user?.employeeId;
  if (!employeeId || !isTaskAssignee(task, employeeId)) {
    return false;
  }
  const uploadedBy = file?.uploadedBy;
  if (!uploadedBy) {
    return false;
  }
  return String(uploadedBy) === String(employeeId);
};

export const canDeleteTaskAttachmentFile = (req, project) =>
  canManageProjectOperations(req, project);

const normalizeTaskId = (id) => (id == null ? "" : String(id));

const toPlainTask = (task) => {
  if (!task) return task;
  if (typeof task.toObject === "function") {
    return task.toObject();
  }
  return task;
};

export const sanitizeProjectTasksForViewer = (project, req) => {
  const plain = project?.toObject ? project.toObject() : { ...project };
  if (canManageProjectOperations(req, plain)) {
    return plain;
  }
  const employeeId = req.user?.employeeId;
  const visibleTasks = (plain.tasks ?? []).filter((task) => isTaskAssignee(task, employeeId));
  return {
    ...plain,
    tasks: visibleTasks.map((task) => toPlainTask(task)),
  };
};

const toPlainTasks = (tasks = []) => (tasks ?? []).map(toPlainTask);

const mergeTaskProgressOnly = (existingTasks = [], nextTasks = [], employeeId = null) => {
  const nextMap = new Map(
    (nextTasks ?? []).map((task) => [normalizeTaskId(task.id), task]),
  );

  return toPlainTasks(existingTasks).map((task) => {
    const incoming = nextMap.get(normalizeTaskId(task.id));
    if (!incoming) {
      return task;
    }

    if (employeeId && !isTaskAssignee(task, employeeId)) {
      return task;
    }

    const incomingSubtasks = new Map(
      (incoming.subtasks ?? []).map((subtask) => [normalizeTaskId(subtask.id), subtask]),
    );

    return {
      ...task,
      completed: Boolean(incoming.completed),
      subtasks: (task.subtasks ?? []).map((subtask) => {
        const incomingSubtask = incomingSubtasks.get(normalizeTaskId(subtask.id));
        if (!incomingSubtask) {
          return subtask;
        }

        return {
          ...subtask,
          completed: Boolean(incomingSubtask.completed),
        };
      }),
    };
  });
};

const buildSubtaskProgressLogs = (existingTask, incomingTask, actorName, taskLabel) => {
  const logs = [];
  const incomingSubtasks = new Map(
    (incomingTask?.subtasks ?? []).map((subtask) => [normalizeTaskId(subtask.id), subtask]),
  );

  (existingTask?.subtasks ?? []).forEach((subtask) => {
    const incomingSubtask = incomingSubtasks.get(normalizeTaskId(subtask.id));
    if (!incomingSubtask) {
      return;
    }

    const subtaskLabel = subtask.title || "task con";
    if (Boolean(subtask.completed) === Boolean(incomingSubtask.completed)) {
      return;
    }

    logs.push(
      createActivityLogEntry({
        actorName,
        sectionKey: "tasks",
        sectionLabel: TASK_SECTION_LABEL,
        text: incomingSubtask.completed
          ? `${actorName} đã hoàn thành task con «${subtaskLabel}» trong task ${taskLabel}`
          : `${actorName} đã chuyển task con «${subtaskLabel}» về chưa hoàn thành trong task ${taskLabel}`,
      }),
    );
  });

  return logs;
};

export const buildEmployeeTaskProgressLogs = (
  existingTasks = [],
  incomingTasks = [],
  actorName,
  employeeId = null,
) => {
  const incomingMap = new Map(
    (incomingTasks ?? []).map((task) => [normalizeTaskId(task.id), task]),
  );
  const logs = [];

  toPlainTasks(existingTasks).forEach((existingTask) => {
    if (employeeId && !isTaskAssignee(existingTask, employeeId)) {
      return;
    }

    const incoming = incomingMap.get(normalizeTaskId(existingTask.id));
    if (!incoming) {
      return;
    }

    const taskLabel = existingTask.title || "công việc";

    if (Boolean(existingTask.completed) !== Boolean(incoming.completed)) {
      logs.push(
        createActivityLogEntry({
          actorName,
          sectionKey: "tasks",
          sectionLabel: TASK_SECTION_LABEL,
          text: incoming.completed
            ? `${actorName} đã hoàn thành task ${taskLabel}`
            : `${actorName} đã chuyển task ${taskLabel} về chưa hoàn thành`,
        }),
      );
    }

    logs.push(...buildSubtaskProgressLogs(existingTask, incoming, actorName, taskLabel));
  });

  return logs;
};

export const TASK_SECTION_LABEL = "Công việc dự án";
export const OVERVIEW_SECTION_KEY = "overview";
export const OVERVIEW_SECTION_LABEL = "Thông tin dự án";
export const MEMBERS_SECTION_KEY = "members";
export const MEMBERS_SECTION_LABEL = "Phân công nhân sự";

const OVERVIEW_TRACKED_FIELDS = [
  { key: "name", label: "tên dự án" },
  { key: "status", label: "trạng thái" },
  { key: "deadline", label: "hạn dự án" },
  { key: "managerName", label: "người quản lý" },
  { key: "siteName", label: "công trường" },
  { key: "code", label: "mã dự án" },
  { key: "desc", label: "mô tả" },
];

const normalizeComparableValue = (value) => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value);
};

const buildOverviewActivityLogs = (existing, bodyForUpdate, actorName) => {
  const changedLabels = OVERVIEW_TRACKED_FIELDS.filter(({ key }) => {
    if (!(key in bodyForUpdate)) {
      return false;
    }
    return normalizeComparableValue(existing[key]) !== normalizeComparableValue(bodyForUpdate[key]);
  }).map(({ label }) => label);

  if (!changedLabels.length) {
    return [];
  }

  const detail =
    changedLabels.length <= 3
      ? changedLabels.join(", ")
      : `${changedLabels.slice(0, 3).join(", ")} và ${changedLabels.length - 3} mục khác`;

  return [
    createActivityLogEntry({
      actorName,
      sectionKey: OVERVIEW_SECTION_KEY,
      sectionLabel: OVERVIEW_SECTION_LABEL,
      text: `${actorName} đã cập nhật thông tin dự án (${detail})`,
    }),
  ];
};

const buildMembersActivityLogs = (existing, bodyForUpdate, actorName) => {
  if (!("members" in bodyForUpdate)) {
    return [];
  }

  const previousIds = new Set(
    (existing.members ?? []).map((member) => String(member.employeeId)).filter(Boolean),
  );
  const nextIds = new Set(
    (bodyForUpdate.members ?? []).map((member) => String(member.employeeId)).filter(Boolean),
  );

  const addedCount = [...nextIds].filter((id) => !previousIds.has(id)).length;
  const removedCount = [...previousIds].filter((id) => !nextIds.has(id)).length;

  if (!addedCount && !removedCount) {
    return [];
  }

  const parts = [];
  if (addedCount) {
    parts.push(`thêm ${addedCount} thành viên`);
  }
  if (removedCount) {
    parts.push(`xóa ${removedCount} thành viên`);
  }

  return [
    createActivityLogEntry({
      actorName,
      sectionKey: MEMBERS_SECTION_KEY,
      sectionLabel: MEMBERS_SECTION_LABEL,
      text: `${actorName} đã ${parts.join(" và ")}`,
    }),
  ];
};
export const EXCEL_EXTENSIONS = [".xls", ".xlsx", ".csv"];

export const isAdmin = (req) => req.user?.role === "admin";

export const getProjectUploadSubdir = (project) =>
  sanitizeUploadFolderName(project?._id?.toString?.() || project?.id || "project");

export const ensureProjectUploadDirectory = (project) =>
  ensureUploadDirectory(getProjectUploadSubdir(project));

export const buildProjectQuery = (req) => {
  if (isAdmin(req)) {
    return {};
  }

  if (!req.user?.employeeId) {
    return { _id: null };
  }

  return { "members.employeeId": req.user.employeeId };
};

export const createActivityLogEntry = ({ actorName, sectionKey, sectionLabel, text }) => ({
  id: `${Date.now()}-${sectionKey}-${Math.random().toString(36).slice(2, 8)}`,
  actorName,
  sectionKey,
  sectionLabel,
  text,
  createdAt: new Date(),
});

export const getActorName = async (req) => {
  const employee = req.user?.employeeId ? await Employee.findById(req.user.employeeId).lean() : null;
  return employee?.name || req.user?.username || (isAdmin(req) ? "Admin" : "Nhân viên");
};

export const collectTaskFileUrls = (task = {}) => [
  ...((task.files ?? []).map((file) => file.url).filter(Boolean)),
  ...((task.submissionFiles ?? []).map((file) => file.url).filter(Boolean)),
];

export const deleteFilesByUrls = async (urls = []) => {
  await Promise.all(urls.filter(Boolean).map((url) => deleteUploadByUrl(url)));
};

export const deleteProjectUploadDirectory = async (project) => {
  if (isSupabaseConfigured()) {
    return;
  }

  const folderPath = path.join(getUploadRoot(), getProjectUploadSubdir(project));
  await fs.rm(folderPath, { recursive: true, force: true }).catch(() => {});
};

export const buildUploadedFileRecords = async (
  files = [],
  uploadSubdir,
  allowedExtensions = null,
  { uploadedBy = "" } = {},
) => {
  const accepted = files.filter((file) => {
    if (!allowedExtensions) {
      return true;
    }
    return allowedExtensions.includes(path.extname(file.originalname).toLowerCase());
  });

  return Promise.all(
    accepted.map(async (file) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const filename = createUniqueFilename(file.originalname);
      const objectPath = `${uploadSubdir}/${filename}`;

      let url;
      if (isSupabaseConfigured()) {
        url = await uploadProjectFileBuffer(file.buffer, objectPath, file.mimetype);
      } else {
        const targetDir = ensureUploadDirectory(uploadSubdir);
        await fs.writeFile(path.join(targetDir, filename), file.buffer);
        url = `/uploads/${objectPath}`;
      }

      return {
        id: `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
        name: file.originalname,
        originalName: file.originalname,
        url,
        mimeType: file.mimetype,
        extension,
        size: file.size,
        uploadedAt: new Date(),
        uploadedBy: uploadedBy ? String(uploadedBy) : "",
      };
    }),
  );
};

const normalizeAssigneeIds = (assigneeIds = []) =>
  [...assigneeIds].map(String).sort().join(",");

const buildSubtaskActivityLogs = (previousTask, task, actorName, taskLabel) => {
  const logs = [];
  const previousSubtasks = new Map(
    (previousTask?.subtasks ?? []).map((subtask) => [normalizeTaskId(subtask.id), subtask]),
  );
  const incomingSubtasks = new Map(
    (task?.subtasks ?? []).map((subtask) => [normalizeTaskId(subtask.id), subtask]),
  );

  (task?.subtasks ?? []).forEach((subtask) => {
    const previousSubtask = previousSubtasks.get(normalizeTaskId(subtask.id));
    const subtaskLabel = subtask.title || "task con";

    if (!previousSubtask) {
      logs.push(
        createActivityLogEntry({
          actorName,
          sectionKey: "tasks",
          sectionLabel: TASK_SECTION_LABEL,
          text: `${actorName} đã thêm task con «${subtaskLabel}» trong task ${taskLabel}`,
        }),
      );
      return;
    }

    if (previousSubtask.completed !== subtask.completed) {
      logs.push(
        createActivityLogEntry({
          actorName,
          sectionKey: "tasks",
          sectionLabel: TASK_SECTION_LABEL,
          text: subtask.completed
            ? `${actorName} đã hoàn thành task con «${subtaskLabel}» trong task ${taskLabel}`
            : `${actorName} đã chuyển task con «${subtaskLabel}» về chưa hoàn thành trong task ${taskLabel}`,
        }),
      );
      return;
    }

    if (
      previousSubtask.title !== subtask.title ||
      previousSubtask.description !== subtask.description
    ) {
      logs.push(
        createActivityLogEntry({
          actorName,
          sectionKey: "tasks",
          sectionLabel: TASK_SECTION_LABEL,
          text: `${actorName} đã cập nhật task con «${subtaskLabel}» trong task ${taskLabel}`,
        }),
      );
    }
  });

  (previousTask?.subtasks ?? []).forEach((subtask) => {
    if (incomingSubtasks.has(normalizeTaskId(subtask.id))) {
      return;
    }

    const subtaskLabel = subtask.title || "task con";
    logs.push(
      createActivityLogEntry({
        actorName,
        sectionKey: "tasks",
        sectionLabel: TASK_SECTION_LABEL,
        text: `${actorName} đã xóa task con «${subtaskLabel}» trong task ${taskLabel}`,
      }),
    );
  });

  return logs;
};

export const buildTaskActivityLogs = (existingTasks = [], nextTasks = [], actorName) => {
  const previousTasks = new Map(
    toPlainTasks(existingTasks).map((task) => [normalizeTaskId(task.id), task]),
  );
  const incomingTasks = new Map(
    toPlainTasks(nextTasks).map((task) => [normalizeTaskId(task.id), task]),
  );
  const logs = [];

  toPlainTasks(nextTasks).forEach((task) => {
    const previousTask = previousTasks.get(normalizeTaskId(task.id));
    const taskLabel = task.title || "công việc";

    if (!previousTask) {
      logs.push(
        createActivityLogEntry({
          actorName,
          sectionKey: "tasks",
          sectionLabel: TASK_SECTION_LABEL,
          text: `${actorName} đã thêm task ${taskLabel}`,
        }),
      );
      return;
    }

    if (previousTask.completed !== task.completed) {
      logs.push(
        createActivityLogEntry({
          actorName,
          sectionKey: "tasks",
          sectionLabel: TASK_SECTION_LABEL,
          text: task.completed
            ? `${actorName} đã hoàn thành task ${taskLabel}`
            : `${actorName} đã chuyển task ${taskLabel} về chưa hoàn thành`,
        }),
      );
    } else if (
      previousTask.title !== task.title ||
      previousTask.description !== task.description ||
      (previousTask.deadline ?? "") !== (task.deadline ?? "")
    ) {
      logs.push(
        createActivityLogEntry({
          actorName,
          sectionKey: "tasks",
          sectionLabel: TASK_SECTION_LABEL,
          text: `${actorName} đã cập nhật task ${taskLabel}`,
        }),
      );
    }

    if (normalizeAssigneeIds(previousTask.assigneeIds) !== normalizeAssigneeIds(task.assigneeIds)) {
      logs.push(
        createActivityLogEntry({
          actorName,
          sectionKey: "tasks",
          sectionLabel: TASK_SECTION_LABEL,
          text: `${actorName} đã cập nhật người phụ trách task ${taskLabel}`,
        }),
      );
    }

    logs.push(...buildSubtaskActivityLogs(previousTask, task, actorName, taskLabel));
  });

  toPlainTasks(existingTasks).forEach((task) => {
    if (incomingTasks.has(normalizeTaskId(task.id))) {
      return;
    }

    logs.push(
      createActivityLogEntry({
        actorName,
        sectionKey: "tasks",
        sectionLabel: TASK_SECTION_LABEL,
        text: `${actorName} đã xóa task ${task.title || "công việc"}`,
      }),
    );
  });

  return logs;
};

export const buildProjectUpdatePayload = async ({ req, existing }) => {
  const nextActivityLogs = [...(existing.activityLogs ?? [])];
  const actorName = await getActorName(req);
  const canManageTasks = canManageProjectOperations(req, existing);
  let bodyForUpdate = { ...req.body };

  const existingPlainTasks = toPlainTasks(existing.tasks);
  let incomingTasksForProgressLog = null;

  if ("tasks" in bodyForUpdate && !canManageTasks) {
    incomingTasksForProgressLog = bodyForUpdate.tasks ?? [];
    const existingTaskIds = new Set(existingPlainTasks.map((task) => normalizeTaskId(task.id)));
    const nextTaskIds = new Set(
      incomingTasksForProgressLog.map((task) => normalizeTaskId(task.id)).filter(Boolean),
    );

    if ([...nextTaskIds].some((taskId) => !existingTaskIds.has(taskId))) {
      throw forbidden(FORBIDDEN_PM_OR_ADMIN_TASKS);
    }

    bodyForUpdate = {
      ...bodyForUpdate,
      tasks: mergeTaskProgressOnly(
        existingPlainTasks,
        incomingTasksForProgressLog,
        req.user?.employeeId,
      ),
    };
  }

  const removedTaskFileUrls =
    "tasks" in bodyForUpdate && canManageTasks
      ? existingPlainTasks
          .filter(
            (task) =>
              !(bodyForUpdate.tasks ?? []).some(
                (nextTask) => normalizeTaskId(nextTask.id) === normalizeTaskId(task.id),
              ),
          )
          .flatMap((task) => collectTaskFileUrls(task))
      : [];

  if ("tasks" in bodyForUpdate) {
    if (!canManageTasks && incomingTasksForProgressLog) {
      nextActivityLogs.push(
        ...buildEmployeeTaskProgressLogs(
          existingPlainTasks,
          bodyForUpdate.tasks ?? [],
          actorName,
          req.user?.employeeId,
        ),
      );
    } else if (
      canManageTasks &&
      JSON.stringify(existingPlainTasks) !== JSON.stringify(bodyForUpdate.tasks ?? [])
    ) {
      nextActivityLogs.push(
        ...buildTaskActivityLogs(existingPlainTasks, bodyForUpdate.tasks ?? [], actorName),
      );
    }
  }

  if (isAdmin(req)) {
    nextActivityLogs.push(...buildOverviewActivityLogs(existing, bodyForUpdate, actorName));
    nextActivityLogs.push(...buildMembersActivityLogs(existing, bodyForUpdate, actorName));
  }

  const progressChanged =
    PROGRESS_SECTION_KEY in bodyForUpdate &&
    JSON.stringify(existing[PROGRESS_SECTION_KEY] ?? null) !==
      JSON.stringify(bodyForUpdate[PROGRESS_SECTION_KEY] ?? null);

  if (progressChanged && !isAdmin(req) && !canManageTasks) {
    throw forbidden(FORBIDDEN_PM_OR_ADMIN_PROGRESS);
  }

  if (progressChanged && (isAdmin(req) || canManageTasks)) {
    const sectionLabel =
      bodyForUpdate[PROGRESS_SECTION_KEY]?.title ||
      existing[PROGRESS_SECTION_KEY]?.title ||
      PROGRESS_SECTION_LABEL;
    nextActivityLogs.push(
      createActivityLogEntry({
        actorName,
        sectionKey: PROGRESS_SECTION_KEY,
        sectionLabel,
        text: `${actorName} đã chỉnh sửa ${sectionLabel}`,
      }),
    );
  }

  const editablePayload = getNonAdminEditableFields(canManageTasks).reduce((acc, field) => {
    if (field in bodyForUpdate) {
      acc[field] = bodyForUpdate[field];
    }
    return acc;
  }, {});

  const updatePayload = isAdmin(req)
    ? {
        ...bodyForUpdate,
        activityLogs: nextActivityLogs,
      }
    : {
        ...editablePayload,
        activityLogs: nextActivityLogs,
      };

  return {
    removedTaskFileUrls,
    updatePayload,
  };
};
