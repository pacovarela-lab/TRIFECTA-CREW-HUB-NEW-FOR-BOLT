import { describe, expect, it } from "vitest";
import {
  ESTIMATE_IMAGE_RETENTION_DAYS_AFTER_APPROVAL,
  ESTIMATE_IMAGE_SIGNED_URL_TTL_SECONDS,
  estimateImageStoragePath,
  imageSetHashInput,
} from "../estimatePhotoFoundation";

const company = "10000000-0000-4000-8000-000000000001";
const estimate = "10000000-0000-4000-8000-000000000002";
const image = "10000000-0000-4000-8000-000000000003";
const hash = "a".repeat(64);

describe("estimate image foundation", () => {
  it("builds the tenant/estimate/image storage path", () => {
    expect(estimateImageStoragePath(company, estimate, image, "jpg"))
      .toBe(`${company}/${estimate}/${image}.jpg`);
  });

  it("rejects unsafe identities and invalid image sets", () => {
    expect(() => estimateImageStoragePath("../bad", estimate, image, "jpg")).toThrow();
    expect(() => imageSetHashInput([])).toThrow();
    expect(() => imageSetHashInput(["not-a-hash"])).toThrow();
  });

  it("keeps order in the image-set idempotency input", () => {
    expect(imageSetHashInput([hash, "b".repeat(64)])).toBe(`${hash}:${"b".repeat(64)}`);
  });

  it("defines short signed URLs and the approved retention target", () => {
    expect(ESTIMATE_IMAGE_SIGNED_URL_TTL_SECONDS).toBe(60);
    expect(ESTIMATE_IMAGE_RETENTION_DAYS_AFTER_APPROVAL).toBe(90);
  });
});
