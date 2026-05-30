import bcrypt from "bcryptjs";
import fs from "fs/promises";
import path from "path";

import Employee from "../models/Employee.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import { getUploadRoot } from "../middleware/upload.js";
import { badRequest, notFound } from "../utils/httpError.js";
import { normalizeMoneyValue } from "../utils/numbers.js";
import { getBaseUrl } from "../utils/request.js";

const buildEmployeeAvatarUrl = (req, filename) => `${getBaseUrl(req)}/uploads/${filename}`;

/** On Vercel, store avatar in MongoDB (base64) — /tmp files do not persist */
const buildEmployeeAvatarFromFile = async (req, file) => {
  if (!file) {
    return "";
  }

  if (process.env.VERCEL) {
    const filePath = path.join(getUploadRoot(), file.filename);
    const buffer = await fs.readFile(filePath);
    const mimeType = file.mimetype || "image/jpeg";
    await fs.unlink(filePath).catch(() => {});
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  return buildEmployeeAvatarUrl(req, file.filename);
};

const ACCOUNT_ROLES = ["employee", "PM"];
const EMPLOYEE_CODE_ATTEMPTS = 200;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const generateEmployeeCode = () => String(Math.floor(Math.random() * 10000)).padStart(4, "0");

const normalizeEmail = (email) => (email == null ? "" : String(email).trim().toLowerCase());

const buildEmployeeSearchQuery = (search = "") => {
  const keyword = search.trim();
  if (!keyword) {
    return {};
  }

  return {
    $or: [
      { name: { $regex: keyword, $options: "i" } },
      { employeeCode: { $regex: keyword, $options: "i" } },
      { role: { $regex: keyword, $options: "i" } },
    ],
  };
};

const findEmployeeByEmail = async (email, excludeId = null) => {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }

  const query = {
    email: { $regex: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return Employee.findOne(query);
};

const generateUniqueEmployeeCode = async () => {
  for (let attempt = 0; attempt < EMPLOYEE_CODE_ATTEMPTS; attempt += 1) {
    const candidate = generateEmployeeCode();
    const exists = await Employee.exists({ employeeCode: candidate });
    if (!exists) {
      return candidate;
    }
  }

  throw badRequest("Không thể tạo mã nhân viên duy nhất. Vui lòng thử lại.");
};

const ensureEmployeeCodes = async (employees = []) => {
  for (const employee of employees) {
    if (employee.employeeCode) {
      continue;
    }

    employee.employeeCode = await generateUniqueEmployeeCode();
    await employee.save();
  }
};

const toAbsoluteAvatarUrl = (employee, baseUrl) => {
  const data = employee.toObject ? employee.toObject() : { ...employee };
  if (data.avatar?.startsWith("/uploads")) {
    data.avatar = baseUrl + data.avatar;
  }
  return data;
};

const attachAccountRoles = async (employees) => {
  if (!employees.length) {
    return employees;
  }

  const employeeIds = employees.map((employee) => employee._id);
  const users = await User.find({
    employeeId: { $in: employeeIds },
    role: { $in: ACCOUNT_ROLES },
  }).lean();

  const accountByEmployeeId = new Map(
    users.map((user) => [
      String(user.employeeId),
      {
        accountRole: user.role,
        username: user.username,
        accountCreatedAt:
          user.createdAt ||
          (typeof user._id?.getTimestamp === "function" ? user._id.getTimestamp() : null),
      },
    ]),
  );

  return employees.map((employee) => {
    const account = accountByEmployeeId.get(String(employee._id));

    return {
      ...employee,
      accountRole: account?.accountRole ?? null,
      username: account?.username ?? null,
      accountCreatedAt: account?.accountCreatedAt ?? null,
    };
  });
};

const formatEmployeeResponse = async (employees, req) => {
  await ensureEmployeeCodes(employees);
  const baseUrl = getBaseUrl(req);
  const normalized = employees.map((employee) => toAbsoluteAvatarUrl(employee, baseUrl));
  return attachAccountRoles(normalized);
};

const parsePagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE),
  );

  return { page, limit, skip: (page - 1) * limit };
};

const getAdminEmployeeQuery = (search) => buildEmployeeSearchQuery(search);

const getScopedEmployeeIds = async (employeeId) => {
  const projects = await Project.find({ "members.employeeId": employeeId });
  return [
    ...new Set(
      projects.flatMap((project) => (project.members ?? []).map((member) => member.employeeId)),
    ),
  ];
};

const removeEmployeeFromProjects = async (employeeId) => {
  const id = String(employeeId);

  await Project.updateMany(
    { "members.employeeId": id },
    { $pull: { members: { employeeId: id } } },
  );

  await Project.updateMany({ managerId: id }, { $set: { managerId: "" } });

  const projectsWithAssignees = await Project.find({ "tasks.assigneeIds": id });
  await Promise.all(
    projectsWithAssignees.map(async (project) => {
      let changed = false;

      project.tasks = (project.tasks ?? []).map((task) => {
        const plainTask = task.toObject ? task.toObject() : { ...task };
        const nextAssigneeIds = (plainTask.assigneeIds ?? []).filter(
          (assigneeId) => String(assigneeId) !== id,
        );

        if (nextAssigneeIds.length !== (plainTask.assigneeIds ?? []).length) {
          changed = true;
        }

        return {
          ...plainTask,
          assigneeIds: nextAssigneeIds,
        };
      });

      if (changed) {
        await project.save();
      }
    }),
  );
};

export const getEmployees = async (req, res) => {
  const search = req.query.search ?? "";
  const fetchAll = req.query.all === "true";

  if (req.user?.role === "admin") {
    const query = getAdminEmployeeQuery(search);

    if (fetchAll) {
      const employees = await Employee.find(query).sort({ name: 1 });
      res.json(await formatEmployeeResponse(employees, req));
      return;
    }

    const { page, limit, skip } = parsePagination(req.query);
    const [employees, total] = await Promise.all([
      Employee.find(query).sort({ name: 1 }).skip(skip).limit(limit),
      Employee.countDocuments(query),
    ]);

    res.json({
      items: await formatEmployeeResponse(employees, req),
      total,
      page,
      limit,
    });
    return;
  }

  if (req.user?.employeeId) {
    const employeeIds = await getScopedEmployeeIds(req.user.employeeId);
    const employees = await Employee.find({ _id: { $in: employeeIds } }).sort({ name: 1 });
    const baseUrl = getBaseUrl(req);
    await ensureEmployeeCodes(employees);
    res.json(employees.map((employee) => toAbsoluteAvatarUrl(employee, baseUrl)));
    return;
  }

  if (fetchAll) {
    res.json([]);
    return;
  }

  res.json({ items: [], total: 0, page: 1, limit: DEFAULT_PAGE_SIZE });
};

export const getEmployee = async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  if (!employee) {
    throw notFound("Employee not found");
  }

  const [withAccount] = await formatEmployeeResponse([employee], req);
  res.json(withAccount);
};

export const createEmployee = async (req, res) => {
  let employee;

  try {
    const { username, password, userRole, ...employeePayload } = req.body;

    if (!username || !password) {
      throw badRequest("Username and password are required");
    }

    const accountRole = userRole === "PM" ? "PM" : "employee";
    if (userRole && !ACCOUNT_ROLES.includes(userRole)) {
      throw badRequest("Invalid account type");
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      throw badRequest("Username already exists");
    }

    const normalizedEmail = normalizeEmail(employeePayload.email);
    if (normalizedEmail) {
      const duplicateEmail = await findEmployeeByEmail(normalizedEmail);
      if (duplicateEmail) {
        throw badRequest("Email đã được sử dụng");
      }
    }

    employee = new Employee({
      employeeCode: await generateUniqueEmployeeCode(),
      ...employeePayload,
      email: normalizedEmail,
      salary: normalizeMoneyValue(employeePayload.salary),
      avatar: req.file
        ? await buildEmployeeAvatarFromFile(req, req.file)
        : employeePayload.avatar || "",
    });

    await employee.save();

    const createdUser = await User.create({
      username,
      passwordHash: await bcrypt.hash(password, 10),
      role: accountRole,
      employeeId: employee._id,
    });

    res.json({
      ...employee.toObject(),
      accountRole,
      username,
      accountCreatedAt:
        createdUser.createdAt ||
        (typeof createdUser._id?.getTimestamp === "function"
          ? createdUser._id.getTimestamp()
          : null),
    });
  } catch (error) {
    if (employee?._id) {
      await Employee.findByIdAndDelete(employee._id).catch(() => null);
    }
    throw error;
  }
};

export const updateEmployee = async (req, res) => {
  const employeeId = req.params.id;
  const { userRole, ...rest } = req.body;

  const normalizedEmail = normalizeEmail(rest.email);
  if (normalizedEmail) {
    const duplicateEmail = await findEmployeeByEmail(normalizedEmail, employeeId);
    if (duplicateEmail) {
      throw badRequest("Email đã được sử dụng");
    }
  }

  const updateData = {
    ...rest,
    email: normalizedEmail,
    salary: normalizeMoneyValue(rest.salary),
  };

  if (req.file) {
    updateData.avatar = await buildEmployeeAvatarFromFile(req, req.file);
  }

  const updated = await Employee.findByIdAndUpdate(employeeId, updateData, { new: true });
  if (!updated) {
    throw notFound("Employee not found");
  }

  if (userRole && ACCOUNT_ROLES.includes(userRole)) {
    const linkedUser = await User.findOne({ employeeId });
    if (linkedUser) {
      linkedUser.role = userRole === "PM" ? "PM" : "employee";
      await linkedUser.save();
    }
  }

  const [withAccount] = await formatEmployeeResponse([updated], req);
  res.json(withAccount);
};

export const deleteEmployee = async (req, res) => {
  const employeeId = req.params.id;

  await removeEmployeeFromProjects(employeeId);
  await Employee.findByIdAndDelete(employeeId);
  await User.findOneAndDelete({ employeeId });

  res.json({ message: "Deleted" });
};
