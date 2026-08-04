import fs from "fs";
import fsPromises from "fs/promises";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;
const stripControlChars = (value) =>
  value
    .split("")
    .filter((char) => char.charCodeAt(0) > 31)
    .join("");

export const sanitizeUploadFolderName = (value = "") =>
  stripControlChars(String(value))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(INVALID_FILENAME_CHARS, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "project";

/** Vercel serverless only allows writes under /tmp */
export const getUploadRoot = () =>
  process.env.VERCEL
    ? path.join("/tmp", "uploads")
    : path.join(__dirname, "..", "uploads");

export const ensureUploadDirectory = (subdir = "") => {
  const targetDir = path.join(getUploadRoot(), subdir);
  fs.mkdirSync(targetDir, { recursive: true });
  return targetDir;
};

export const extractUploadRelativePath = (url) => {
  if (!url) {
    return null;
  }

  const match = String(url).trim().match(/\/uploads\/(.+)$/);
  return match?.[1] ?? null;
};

export const getUploadAbsolutePathFromUrl = (url) => {
  const relativePath = extractUploadRelativePath(url);
  if (!relativePath) {
    return null;
  }

  return path.join(getUploadRoot(), ...relativePath.split("/"));
};

export const deleteUploadByUrl = async (url) => {
  const absolutePath = getUploadAbsolutePathFromUrl(url);
  if (!absolutePath) {
    return;
  }

  await fsPromises.unlink(absolutePath).catch(() => {});
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ensureUploadDirectory(req.uploadSubdir || ""));
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomUUID()}${extension}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = req.allowedUploadExtensions;
  if (!allowedExtensions?.length) {
    cb(null, true);
    return;
  }

  const extension = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(extension)) {
    cb(null, true);
    return;
  }

  cb(null, false);
};

const upload = multer({ storage, fileFilter });

export default upload;
