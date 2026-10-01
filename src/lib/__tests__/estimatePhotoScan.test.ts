import { describe, expect, it } from "vitest";
import { orderedEstimateImageSetHash, validateEstimatePhotoFiles } from "@/lib/estimatePhotoScan";

const image = (name = "estimate.jpg", size = 100, type = "image/jpeg") => new File([new Uint8Array(size)], name, { type });

describe("estimate photo selection", () => {
  it("accepts one image", () => expect(() => validateEstimatePhotoFiles([image()])).not.toThrow());
  it("accepts five images", () => expect(() => validateEstimatePhotoFiles(Array.from({ length: 5 }, (_, i) => image(`${i}.jpg`)))).not.toThrow());
  it("rejects six images", () => expect(() => validateEstimatePhotoFiles(Array.from({ length: 6 }, (_, i) => image(`${i}.jpg`)))).toThrow("estimate_image_count_out_of_range"));
  it("rejects files over 10 MB", () => expect(() => validateEstimatePhotoFiles([image("huge.jpg", 10 * 1024 * 1024 + 1)])).toThrow("estimate_image_too_large"));
  it("rejects unsupported MIME", () => expect(() => validateEstimatePhotoFiles([image("payload.svg", 100, "image/svg+xml")])).toThrow("estimate_image_mime_unsupported"));
});

describe("ordered image-set hash", () => {
  const a = "a".repeat(64);
  const b = "b".repeat(64);
  it("is deterministic for the same order", async () => expect(await orderedEstimateImageSetHash([a, b])).toBe(await orderedEstimateImageSetHash([a, b])));
  it("changes when image order changes", async () => expect(await orderedEstimateImageSetHash([a, b])).not.toBe(await orderedEstimateImageSetHash([b, a])));
});
