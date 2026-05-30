import mongoose from "mongoose";

const memberSchema = new mongoose.Schema(
  {
    employeeId: { type: String, default: "" },
    assignment: { type: String, default: "" },
  },
  { _id: false },
);

const chatMessageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    author: { type: String, default: "" },
    text: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const activityLogSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    actorName: { type: String, default: "" },
    sectionKey: { type: String, default: "" },
    sectionLabel: { type: String, default: "" },
    text: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const relatedFileSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: "" },
    originalName: { type: String, default: "" },
    url: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    extension: { type: String, default: "" },
    size: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, default: "" },
  },
  { _id: false },
);

const subtaskSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const taskSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    deadline: { type: String, default: "" },
    assigneeIds: { type: [String], default: [] },
    files: { type: [relatedFileSchema], default: [] },
    submissionFiles: { type: [relatedFileSchema], default: [] },
    subtasks: { type: [subtaskSchema], default: [] },
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const projectSchema = new mongoose.Schema({
  name: { type: String, default: "" },
  /** Hạn dự án (ISO hoặc YYYY-MM-DD), dùng cho danh sách / trạng thái trễ hạn */
  deadline: { type: String, default: "" },
  /** Nhân viên quản lý dự án (employeeId) — dùng cho phân công thành viên */
  managerId: { type: String, default: "" },
  /** Tên quản lý dự án (nhập tay, hiển thị tổng quan) */
  managerName: { type: String, default: "" },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  desc: { type: String, default: "" },
  formNo: { type: String, default: "" },
  date: { type: String, default: "" },
  code: { type: String, default: "" },
  siteName: { type: String, default: "" },
  /** Tiến độ dự án: { title, subtitle, columns[], rows[] } */
  progressChecks: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({}),
  },
  members: {
    type: [memberSchema],
    default: [],
  },
  chatMessages: {
    type: [chatMessageSchema],
    default: [],
  },
  activityLogs: {
    type: [activityLogSchema],
    default: [],
  },
  relatedFiles: {
    type: [relatedFileSchema],
    default: [],
  },
  tasks: {
    type: [taskSchema],
    default: [],
  },
});

export default mongoose.model("Project", projectSchema);
