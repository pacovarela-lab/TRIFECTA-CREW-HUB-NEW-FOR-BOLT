import { describe, expect, it, vi } from "vitest";
import { sha256File } from "@/lib/fileHash";
import { executeReceiptCapture, isRetryableNetworkError } from "@/lib/mobileReceiptCaptureFlow";
import { syncOfflineReceiptDrafts } from "@/lib/offlineReceiptSync";
import {
  OFFLINE_RECEIPT_SCHEMA_VERSION,
  isLegacyOfflineReceiptDraft,
  upgradeLegacyReceiptDraft,
  type LegacyOfflineReceiptDraft,
  type OfflineReceiptDraft,
} from "@/lib/offlineReceiptQueue";

const file = (body = "prepared") => new File([body], "receipt.jpg", { type: "image/jpeg" });
const networkError = () => new TypeError("Failed to fetch");
const captureArgs = (overrides: Record<string, unknown> = {}) => ({
  preparedFile: file(), preparedHash: "prepared-hash", online: () => true,
  findDuplicate: vi.fn(async () => null), upload: vi.fn(async () => ({ id: "R1" })),
  postProcess: vi.fn(async () => undefined), queue: vi.fn(async () => undefined), ...overrides,
});
const draft = (id: string): OfflineReceiptDraft => ({ schemaVersion: OFFLINE_RECEIPT_SCHEMA_VERSION, id, idempotencyKey: `key-${id}`, userId: "u", companyId: "c",
  file: file(id), generatedName: `${id}.jpg`, type: "image/jpeg", preparedHash: `hash-${id}`, createdAt: new Date().toISOString(),
  attempts: 0, status: "pending", lastErrorCode: null, lastAttemptAt: null, nextRetryAt: null });
const legacy = (overrides: Partial<LegacyOfflineReceiptDraft> = {}): LegacyOfflineReceiptDraft => ({
  id: "legacy-1",
  idempotencyKey: "legacy-key",
  userId: "u",
  companyId: "c",
  file: new Blob(["raw legacy bytes"], { type: "image/jpeg" }),
  generatedName: "legacy-original.jpg",
  type: "image/jpeg",
  createdAt: "2026-08-01T00:00:00.000Z",
  attempts: 0,
  ...overrides,
});
const upgradeDeps = () => ({
  prepare: vi.fn(async () => file("prepared legacy bytes")),
  hash: vi.fn(async () => "prepared-legacy-hash"),
  createId: vi.fn(() => "generated-stable-key"),
});

describe("mobile receipt capture idempotency", () => {
  it("queues the prepared file and prepared hash while offline", async () => {
    const queue = vi.fn(); const prepared = file("canonical"); const findDuplicate = vi.fn();
    const result = await executeReceiptCapture(captureArgs({ preparedFile: prepared, online: () => false,
      findDuplicate, queue }));
    expect(result.status).toBe("queued"); expect(queue).toHaveBeenCalledWith(prepared, "prepared-hash");
    expect(findDuplicate).not.toHaveBeenCalled();
  });
  it("queues a retryable upload network failure", async () => {
    const queue = vi.fn(); const result = await executeReceiptCapture(captureArgs({ upload: vi.fn(async () => { throw networkError(); }), queue }));
    expect(result.status).toBe("queued"); expect(queue).toHaveBeenCalledOnce();
  });
  it.each([400, 401])("does not queue upload HTTP %s", async (status) => {
    const queue = vi.fn(); const result = await executeReceiptCapture(captureArgs({ upload: vi.fn(async () => { throw { status }; }), queue }));
    expect(result.status).toBe("failed"); expect(queue).not.toHaveBeenCalled();
  });
  it("never queues after upload succeeds and update fails", async () => {
    const queue = vi.fn(); const upload = vi.fn(async () => ({ id: "R1" }));
    const result = await executeReceiptCapture(captureArgs({ upload, queue, postProcess: vi.fn(async () => { throw Error("update failed"); }) }));
    expect(result).toEqual({ status: "uploaded", receiptId: "R1", postProcessingFailed: true });
    expect(upload).toHaveBeenCalledOnce(); expect(queue).not.toHaveBeenCalled();
  });
  it("never queues after upload succeeds and OCR fails", async () => {
    const queue = vi.fn(); const result = await executeReceiptCapture(captureArgs({ queue, postProcess: vi.fn(async () => { throw Error("ocr failed"); }) }));
    expect(result.status).toBe("uploaded"); expect(queue).not.toHaveBeenCalled();
  });
  it("keeps initial and persisted retry hashes equal", async () => {
    const prepared = file("same bytes");
    const persisted = new File([prepared], prepared.name, { type: prepared.type });
    Object.defineProperty(prepared, "arrayBuffer", { value: async () => new TextEncoder().encode("same bytes").buffer });
    Object.defineProperty(persisted, "arrayBuffer", { value: async () => new TextEncoder().encode("same bytes").buffer });
    const initial = await sha256File(prepared);
    expect(await sha256File(persisted)).toBe(initial);
  });
  it("removes a draft when retry finds a remote duplicate", async () => {
    const remove = vi.fn(); const upload = vi.fn(); const d = draft("1");
    await syncOfflineReceiptDrafts({ drafts: [d], claim: async () => d, findDuplicate: async () => ({ id: "R1" }), upload, remove, fail: vi.fn() });
    expect(remove).toHaveBeenCalledWith(d); expect(upload).not.toHaveBeenCalled();
  });
  it.each([[false, "permanent"], [true, "temporary"]])("continues after a %s first-draft failure", async (retryable, label) => {
    const uploaded: string[] = []; const removed: string[] = [];
    await syncOfflineReceiptDrafts({ drafts: [draft("1"), draft("2")], claim: async d => d, findDuplicate: async () => null,
      upload: async f => { if (f.name === "1.jpg") throw retryable ? networkError() : { status: 400 }; uploaded.push(f.name); },
      remove: async d => { removed.push(d.id); }, fail: async () => undefined, online: () => true });
    expect(label).toBeTruthy(); expect(uploaded).toEqual(["2.jpg"]); expect(removed).toEqual(["2"]);
  });
  it("leaves only one failed draft when two of three succeed", async () => {
    const remaining = new Set(["1", "2", "3"]);
    await syncOfflineReceiptDrafts({ drafts: [...remaining].map(draft), claim: async d => d, findDuplicate: async () => null,
      upload: async f => { if (f.name === "2.jpg") throw { status: 400 }; }, remove: async d => { remaining.delete(d.id); }, fail: async () => undefined });
    expect([...remaining]).toEqual(["2"]);
  });
  it("processes the same draft once across simultaneous online events", async () => {
    const d = draft("1"); const upload = vi.fn(async () => { await Promise.resolve(); }); const claim = vi.fn(async () => d);
    const args = { drafts: [d], claim, findDuplicate: async () => null, upload, remove: vi.fn(async () => undefined), fail: vi.fn(async () => undefined) };
    await Promise.all([syncOfflineReceiptDrafts(args), syncOfflineReceiptDrafts(args)]);
    expect(upload).toHaveBeenCalledOnce();
  });
  it("does not upload again after reload finds the original row", async () => {
    const d = draft("1"); const upload = vi.fn();
    await syncOfflineReceiptDrafts({ drafts: [d], claim: async () => d, findDuplicate: async h => h === d.preparedHash ? { id: "R1" } : null,
      upload, remove: vi.fn(async () => undefined), fail: vi.fn(async () => undefined) });
    expect(upload).not.toHaveBeenCalled();
  });
  it("uses one upload for a guarded double click", async () => {
    let capturing = false; const upload = vi.fn(async () => ({ id: "R1" }));
    const click = async () => { if (capturing) return; capturing = true; try { await executeReceiptCapture(captureArgs({ upload })); } finally { capturing = false; } };
    await Promise.all([click(), click()]); expect(upload).toHaveBeenCalledOnce();
  });
  it("post-upload failure plus reload still represents one row", async () => {
    const upload = vi.fn(async () => ({ id: "R1" }));
    await executeReceiptCapture(captureArgs({ upload, postProcess: vi.fn(async () => { throw Error("later"); }) }));
    expect(upload).toHaveBeenCalledOnce();
  });
  it("preserves the idempotency key on retry", async () => {
    const d = draft("1"); const keys: string[] = [];
    await syncOfflineReceiptDrafts({ drafts: [d], claim: async () => d, findDuplicate: async () => null,
      upload: async (_f, _h, key) => { keys.push(key); }, remove: vi.fn(async () => undefined), fail: vi.fn(async () => undefined) });
    expect(keys).toEqual(["key-1"]);
  });
  it("passes the prepared blob rather than raw bytes to queue", async () => {
    const raw = file("raw"); const prepared = file("compressed"); const queue = vi.fn();
    await executeReceiptCapture(captureArgs({ preparedFile: prepared, online: () => false, findDuplicate: async () => { throw networkError(); }, queue }));
    expect(queue.mock.calls[0][0]).toBe(prepared); expect(queue.mock.calls[0][0]).not.toBe(raw);
  });
  it("classifies only transport failures as retryable", () => {
    expect(isRetryableNetworkError(networkError(), true)).toBe(true);
    expect(isRetryableNetworkError({ status: 503 }, true)).toBe(true);
    expect(isRetryableNetworkError({ status: 403 }, true)).toBe(false);
    expect(isRetryableNetworkError(Error("OCR failed"), true)).toBe(false);
  });
  it("returns distinct statuses for offline, online failure, and remote saved", async () => {
    expect((await executeReceiptCapture(captureArgs({ online: () => false, findDuplicate: async () => { throw networkError(); } }))).status).toBe("queued");
    expect((await executeReceiptCapture(captureArgs({ upload: async () => { throw { status: 400 }; } }))).status).toBe("failed");
    expect((await executeReceiptCapture(captureArgs({ postProcess: async () => { throw Error("post"); } }))).status).toBe("uploaded");
  });
});

describe("legacy offline receipt draft upgrade", () => {
  it("recognizes the exact legacy shape without schemaVersion", () => {
    expect(isLegacyOfflineReceiptDraft(legacy())).toBe(true);
  });

  it("prepares raw legacy bytes and stores the prepared hash", async () => {
    const deps = upgradeDeps();
    const upgraded = await upgradeLegacyReceiptDraft(legacy({ preparedHash: undefined }), deps);
    expect(deps.prepare).toHaveBeenCalledOnce();
    expect(deps.hash).toHaveBeenCalledOnce();
    expect(upgraded.file).toBeInstanceOf(File);
    expect(upgraded.preparedHash).toBe("prepared-legacy-hash");
    expect(upgraded.schemaVersion).toBe(2);
  });

  it("generates a missing idempotency key once", async () => {
    const deps = upgradeDeps();
    const upgraded = await upgradeLegacyReceiptDraft(legacy({ idempotencyKey: undefined }), deps);
    expect(upgraded.idempotencyKey).toBe("generated-stable-key");
    expect(deps.createId).toHaveBeenCalledOnce();
  });

  it("persists the upgrade before duplicate lookup and upload", async () => {
    const order: string[] = [];
    const raw = legacy({ idempotencyKey: undefined });
    const deps = upgradeDeps();
    await syncOfflineReceiptDrafts({
      drafts: [raw], claim: async () => raw,
      upgrade: async (candidate) => { const upgraded = await upgradeLegacyReceiptDraft(candidate, deps); order.push("persist"); return upgraded; },
      findDuplicate: async () => { order.push("duplicate"); return null; },
      upload: async () => { order.push("upload"); }, remove: async () => { order.push("remove"); }, fail: vi.fn(),
    });
    expect(order).toEqual(["persist", "duplicate", "upload", "remove"]);
  });

  it("uploads one canonical row and removes the legacy draft", async () => {
    const raw = legacy(); const upload = vi.fn(); const remove = vi.fn();
    await syncOfflineReceiptDrafts({ drafts: [raw], claim: async () => raw,
      upgrade: (candidate) => upgradeLegacyReceiptDraft(candidate, upgradeDeps()), findDuplicate: async () => null,
      upload, remove, fail: vi.fn() });
    expect(upload).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledOnce();
  });

  it("cleans a migrated draft when preparedHash already exists remotely", async () => {
    const raw = legacy(); const upload = vi.fn(); const remove = vi.fn();
    await syncOfflineReceiptDrafts({ drafts: [raw], claim: async () => raw,
      upgrade: (candidate) => upgradeLegacyReceiptDraft(candidate, upgradeDeps()), findDuplicate: async () => ({ id: "remote" }),
      upload, remove, fail: vi.fn() });
    expect(upload).not.toHaveBeenCalled(); expect(remove).toHaveBeenCalledOnce();
  });

  it("keeps prepared hash and idempotency key across network retry", async () => {
    const upgraded = await upgradeLegacyReceiptDraft(legacy({ idempotencyKey: undefined }), upgradeDeps());
    const failed: OfflineReceiptDraft[] = [];
    await syncOfflineReceiptDrafts({ drafts: [upgraded], claim: async () => upgraded, findDuplicate: async () => null,
      upload: async () => { throw networkError(); }, remove: vi.fn(),
      fail: async (candidate) => { failed.push(candidate as OfflineReceiptDraft); }, online: () => true });
    expect(failed[0].preparedHash).toBe("prepared-legacy-hash");
    expect(failed[0].idempotencyKey).toBe("generated-stable-key");
  });

  it("allows Retry to process the same upgraded row without another draft", async () => {
    const upgraded = await upgradeLegacyReceiptDraft(legacy(), upgradeDeps()); const upload = vi.fn();
    await syncOfflineReceiptDrafts({ drafts: [upgraded], claim: async () => upgraded, findDuplicate: async () => null,
      upload, remove: vi.fn(), fail: vi.fn() });
    expect(upload).toHaveBeenCalledOnce();
  });

  it("continues after an irreparable legacy row", async () => {
    const corrupt = { ...legacy(), id: "broken", file: undefined } as LegacyOfflineReceiptDraft;
    const current = draft("valid"); const upload = vi.fn(); const fail = vi.fn();
    await syncOfflineReceiptDrafts({ drafts: [corrupt, current], claim: async (candidate) => candidate,
      upgrade: (candidate) => upgradeLegacyReceiptDraft(candidate, upgradeDeps()), findDuplicate: async () => null,
      upload, remove: vi.fn(), fail });
    expect(fail).toHaveBeenCalledOnce(); expect(upload).toHaveBeenCalledOnce();
  });

  it("processes a mixed legacy and current queue", async () => {
    const raw = legacy(); const current = draft("current"); const upload = vi.fn();
    await syncOfflineReceiptDrafts({ drafts: [raw, current], claim: async (candidate) => candidate,
      upgrade: (candidate) => upgradeLegacyReceiptDraft(candidate, upgradeDeps()), findDuplicate: async () => null,
      upload, remove: vi.fn(), fail: vi.fn() });
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("upgrades only once and reuses the persisted canonical row after reload", async () => {
    const deps = upgradeDeps(); const upgraded = await upgradeLegacyReceiptDraft(legacy(), deps);
    const reloaded = await upgradeLegacyReceiptDraft(upgraded, deps);
    expect(reloaded).toBe(upgraded); expect(deps.prepare).toHaveBeenCalledOnce(); expect(deps.hash).toHaveBeenCalledOnce();
  });

  it("uses prepared hash even when raw hash would differ", async () => {
    const upgraded = await upgradeLegacyReceiptDraft(legacy(), upgradeDeps());
    expect(upgraded.preparedHash).toBe("prepared-legacy-hash");
    expect(upgraded.preparedHash).not.toBe("raw-legacy-hash");
  });

  it("reload after upgrade finds the duplicate and does not upload", async () => {
    const upgraded = await upgradeLegacyReceiptDraft(legacy(), upgradeDeps()); const upload = vi.fn();
    await syncOfflineReceiptDrafts({ drafts: [upgraded], claim: async () => upgraded,
      findDuplicate: async (hash) => hash === upgraded.preparedHash ? { id: "remote" } : null,
      upload, remove: vi.fn(), fail: vi.fn() });
    expect(upload).not.toHaveBeenCalled();
  });

  it("does not process one legacy draft concurrently on duplicate online events", async () => {
    const raw = legacy(); const upload = vi.fn(async () => { await Promise.resolve(); });
    const args = { drafts: [raw], claim: async () => raw,
      upgrade: (candidate: LegacyOfflineReceiptDraft) => upgradeLegacyReceiptDraft(candidate, upgradeDeps()),
      findDuplicate: async () => null, upload, remove: vi.fn(async () => undefined), fail: vi.fn(async () => undefined) };
    await Promise.all([syncOfflineReceiptDrafts(args), syncOfflineReceiptDrafts(args)]);
    expect(upload).toHaveBeenCalledOnce();
  });
});
