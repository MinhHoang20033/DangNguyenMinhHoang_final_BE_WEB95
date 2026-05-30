import fs from "fs";
import multer from "multer";
import path from "path";

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

export const ensureUploadDirectory = (subdir = "") => {
  const targetDir = path.join("uploads", subdir);
  fs.mkdirSync(targetDir, { recursive: true });
  return targetDir;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ensureUploadDirectory(req.uploadSubdir || ""));
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

export default upload;
