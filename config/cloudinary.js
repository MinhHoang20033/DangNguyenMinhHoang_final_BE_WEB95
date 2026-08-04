import { v2 as cloudinary } from "cloudinary";

let configured = false;

export const isCloudinaryConfigured = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );

const ensureCloudinary = () => {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Thiếu cấu hình Cloudinary. Thêm CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET vào BE/.env",
    );
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }

  return cloudinary;
};

export const uploadAvatarBuffer = (buffer, folder = "project-manager/avatars") =>
  new Promise((resolve, reject) => {
    const stream = ensureCloudinary().uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        overwrite: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      },
    );

    stream.end(buffer);
  });

export const extractCloudinaryPublicId = (url = "") => {
  const value = String(url);
  if (!value.includes("res.cloudinary.com")) {
    return null;
  }

  const uploadIndex = value.indexOf("/upload/");
  if (uploadIndex < 0) {
    return null;
  }

  let pathPart = value.slice(uploadIndex + "/upload/".length);
  pathPart = pathPart.replace(/^v\d+\//, "");
  pathPart = pathPart.replace(/\.[a-zA-Z0-9]+$/, "");
  return pathPart || null;
};

export const deleteCloudinaryByUrl = async (url) => {
  const publicId = extractCloudinaryPublicId(url);
  if (!publicId || !isCloudinaryConfigured()) {
    return;
  }

  await ensureCloudinary().uploader.destroy(publicId).catch(() => {});
};
