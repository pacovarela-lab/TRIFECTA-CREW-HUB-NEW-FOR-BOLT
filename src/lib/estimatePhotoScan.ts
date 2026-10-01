import { prepareReceiptFile } from "@/lib/imagePrep";
import { imageSetHashInput } from "@/lib/estimatePhotoFoundation";

export const MAX_ESTIMATE_PHOTOS = 5;
export const MAX_ESTIMATE_PHOTO_BYTES = 10 * 1024 * 1024;
export const ESTIMATE_PHOTO_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export type PreparedEstimatePhoto = {
  file: File;
  sha256: string;
  previewUrl: string;
};

export function validateEstimatePhotoFiles(files: ReadonlyArray<File>): void {
  if (files.length < 1 || files.length > MAX_ESTIMATE_PHOTOS) throw new Error("estimate_image_count_out_of_range");
  for (const file of files) {
    if (file.size <= 0 || file.size > MAX_ESTIMATE_PHOTO_BYTES) throw new Error("estimate_image_too_large");
    const mime = file.type.toLowerCase();
    const heic = /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]/.test(mime);
    if (!heic && !ESTIMATE_PHOTO_MIMES.has(mime)) throw new Error("estimate_image_mime_unsupported");
  }
}

export async function sha256Bytes(value: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes: BufferSource = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value instanceof Uint8Array
      ? new Uint8Array(value)
      : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function orderedEstimateImageSetHash(hashes: ReadonlyArray<string>): Promise<string> {
  return sha256Bytes(imageSetHashInput(hashes));
}

export async function prepareEstimatePhotos(files: ReadonlyArray<File>): Promise<PreparedEstimatePhoto[]> {
  validateEstimatePhotoFiles(files);
  const prepared = await Promise.all(files.map(async (original) => {
    const file = await prepareReceiptFile(original);
    if (!ESTIMATE_PHOTO_MIMES.has(file.type.toLowerCase())) throw new Error("estimate_heic_conversion_failed");
    if (file.size <= 0 || file.size > MAX_ESTIMATE_PHOTO_BYTES) throw new Error("estimate_image_too_large");
    return {
      file,
      sha256: await sha256Bytes(await file.arrayBuffer()),
      previewUrl: URL.createObjectURL(file),
    };
  }));
  return prepared;
}
