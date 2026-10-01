export const ESTIMATE_IMAGES_BUCKET = "estimate-images";
export const ESTIMATE_IMAGE_SIGNED_URL_TTL_SECONDS = 60;
export const ESTIMATE_IMAGE_RETENTION_DAYS_AFTER_APPROVAL = 90;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function estimateImageStoragePath(
  companyId: string,
  estimateId: string,
  imageId: string,
  extension: "jpg" | "jpeg" | "png" | "webp" | "heic" | "heif",
): string {
  if (![companyId, estimateId, imageId].every((value) => UUID.test(value))) {
    throw new Error("invalid_estimate_image_identity");
  }
  return `${companyId}/${estimateId}/${imageId}.${extension}`;
}

export function imageSetHashInput(orderedSha256: ReadonlyArray<string>): string {
  if (orderedSha256.length < 1 || orderedSha256.length > 5) throw new Error("estimate_image_count_out_of_range");
  if (orderedSha256.some((hash) => !/^[0-9a-f]{64}$/.test(hash))) throw new Error("invalid_estimate_image_hash");
  return orderedSha256.join(":");
}
