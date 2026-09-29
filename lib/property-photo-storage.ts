import { supabase } from "@/lib/supabase";

export const PROPERTY_PHOTOS_BUCKET = "property-photos";

export function propertyPhotoObjectPath(transactionId: string): string {
  return `${transactionId}/cover.jpg`;
}

export function publicPropertyPhotoUrl(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  const encoded = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/storage/v1/object/public/${PROPERTY_PHOTOS_BUCKET}/${encoded}`;
}

export function isEmbeddedPropertyPhoto(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/");
}

/** Upload JPEG bytes and persist path + public URL on transaction_meta. */
export async function savePropertyPhotoForTransaction(
  transactionId: string,
  imageBytes: Buffer,
  contentType = "image/jpeg"
): Promise<{ path: string; publicUrl: string }> {
  const path = propertyPhotoObjectPath(transactionId);
  const { error: uploadError } = await supabase.storage
    .from(PROPERTY_PHOTOS_BUCKET)
    .upload(path, imageBytes, {
      upsert: true,
      contentType,
      cacheControl: "3600",
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const publicUrl = publicPropertyPhotoUrl(path);
  if (!publicUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");

  const { data: existing } = await supabase
    .from("transaction_meta")
    .select("worksheet")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  const worksheet = (existing?.worksheet ?? {}) as Record<string, unknown>;

  const patch = {
    worksheet: { ...worksheet, propertyPhotoUrl: publicUrl },
    property_photo_path: path,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: metaError } = await supabase
    .from("transaction_meta")
    .update(patch)
    .eq("transaction_id", transactionId)
    .select("transaction_id")
    .maybeSingle();

  if (metaError) {
    throw new Error(metaError.message);
  }

  if (!updated) {
    const { error: insertError } = await supabase.from("transaction_meta").insert({
      transaction_id: transactionId,
      commission: {},
      ...patch,
    });
    if (insertError) throw new Error(insertError.message);
  }

  return { path, publicUrl };
}

export async function migrateDataUrlToStorage(
  transactionId: string,
  dataUrl: string
): Promise<{ path: string; publicUrl: string } | null> {
  if (!isEmbeddedPropertyPhoto(dataUrl)) return null;

  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;

  const contentType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) return null;

  return savePropertyPhotoForTransaction(transactionId, buffer, contentType);
}
