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

export const getSupabasePublicUrl = (objectPath) => {
  const { data } = getSupabaseAdmin().storage.from(getSupabaseBucket()).getPublicUrl(objectPath);
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

  return getSupabasePublicUrl(objectPath);
};

export const extractSupabaseObjectPath = (url = "") => {
  const value = String(url).trim();
  const marker = `/storage/v1/object/public/${getSupabaseBucket()}/`;
  const index = value.indexOf(marker);
  if (index < 0) {
    return null;
  }

  return decodeURIComponent(value.slice(index + marker.length));
};

export const deleteSupabaseByUrl = async (url) => {
  const objectPath = extractSupabaseObjectPath(url);
  if (!objectPath || !isSupabaseConfigured()) {
    return;
  }

  await getSupabaseAdmin()
    .storage.from(getSupabaseBucket())
    .remove([objectPath])
    .catch(() => {});
};
