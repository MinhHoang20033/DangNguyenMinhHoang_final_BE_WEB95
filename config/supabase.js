import { createClient } from "@supabase/supabase-js";

let client = null;

export const getSupabaseBucket = () =>
  process.env.SUPABASE_STORAGE_BUCKET || "file";

export const isSupabaseConfigured = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export const getSupabaseAdmin = () => {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Thiếu cấu hình Supabase. Thêm SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY vào BE/.env",
    );
  }

  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return client;
};

export const getSupabasePublicUrl = (objectPath, bucket = getSupabaseBucket()) => {
  const { data } = getSupabaseAdmin().storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
};

export const uploadProjectFileBuffer = async (buffer, objectPath, contentType) => {
  const supabase = getSupabaseAdmin();
  const bucket = getSupabaseBucket();

  const { error } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    contentType: contentType || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    throw new Error(error.message || "Không thể tải tệp lên Supabase Storage");
  }

  return getSupabasePublicUrl(objectPath, bucket);
};

export const parseSupabasePublicUrl = (url = "") => {
  const value = String(url).trim().split("?")[0].split("#")[0];
  const match = value.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match) {
    return null;
  }

  return {
    bucket: decodeURIComponent(match[1]),
    objectPath: decodeURIComponent(match[2]),
  };
};

export const extractSupabaseObjectPath = (url = "") =>
  parseSupabasePublicUrl(url)?.objectPath ?? null;

export const deleteSupabaseByUrl = async (url) => {
  const parsed = parseSupabasePublicUrl(url);
  if (!parsed) {
    return false;
  }

  if (!isSupabaseConfigured()) {
    throw new Error("Thiếu cấu hình Supabase trên server");
  }

  const { error } = await getSupabaseAdmin()
    .storage.from(parsed.bucket)
    .remove([parsed.objectPath]);

  if (error) {
    throw new Error(error.message || "Không thể xóa tệp trên Supabase Storage");
  }

  return true;
};
