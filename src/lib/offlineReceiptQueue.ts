import { sha256File } from "@/lib/fileHash";
import { prepareReceiptFile } from "@/lib/imagePrep";

export const OFFLINE_RECEIPT_SCHEMA_VERSION = 2 as const;
type OfflineReceiptStatus = "pending" | "syncing" | "failed";

export type OfflineReceiptDraft = {
  schemaVersion: typeof OFFLINE_RECEIPT_SCHEMA_VERSION;
  id: string; idempotencyKey: string; userId: string; companyId: string;
  file: Blob; generatedName: string; type: string; preparedHash: string; createdAt: string; attempts: number;
  status: OfflineReceiptStatus; lastErrorCode: string | null;
  lastAttemptAt: string | null; nextRetryAt: string | null;
};

export type LegacyOfflineReceiptDraft = {
  schemaVersion?: 1;
  id: string; idempotencyKey?: string; userId?: string; companyId?: string;
  file?: Blob; name?: string; generatedName?: string; type?: string; preparedHash?: string;
  createdAt?: string; attempts?: number; status?: OfflineReceiptStatus;
  lastErrorCode?: string | null; lastAttemptAt?: string | null; nextRetryAt?: string | null;
};

export type StoredOfflineReceiptDraft = OfflineReceiptDraft | LegacyOfflineReceiptDraft;

const DB = "trifecta-offline-v2";
const STORE = "receipt-drafts";
const MAX_ITEM_BYTES = 10 * 1024 * 1024;
const MAX_QUEUE_BYTES = 40 * 1024 * 1024;
const MAX_ITEMS = 12;

const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function all(db: IDBDatabase) {
  return new Promise<StoredOfflineReceiptDraft[]>((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as StoredOfflineReceiptDraft[]);
    request.onerror = () => reject(request.error);
  });
}

const put = (db: IDBDatabase, row: StoredOfflineReceiptDraft) => new Promise<void>((resolve, reject) => {
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(row);
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
});

const isBlob = (value: unknown): value is Blob =>
  typeof Blob !== "undefined" && value instanceof Blob;

export const isCurrentOfflineReceiptDraft = (draft: StoredOfflineReceiptDraft): draft is OfflineReceiptDraft =>
  draft.schemaVersion === OFFLINE_RECEIPT_SCHEMA_VERSION &&
  typeof draft.id === "string" && !!draft.id &&
  typeof draft.idempotencyKey === "string" && !!draft.idempotencyKey &&
  typeof draft.userId === "string" && !!draft.userId &&
  typeof draft.companyId === "string" && !!draft.companyId &&
  isBlob(draft.file) && typeof draft.preparedHash === "string" && !!draft.preparedHash;

export const isLegacyOfflineReceiptDraft = (draft: unknown): draft is LegacyOfflineReceiptDraft => {
  if (!draft || typeof draft !== "object") return false;
  const row = draft as Partial<LegacyOfflineReceiptDraft>;
  return (row.schemaVersion as number | undefined) !== OFFLINE_RECEIPT_SCHEMA_VERSION &&
    typeof row.id === "string" && !!row.id &&
    typeof row.userId === "string" && !!row.userId &&
    typeof row.companyId === "string" && !!row.companyId &&
    isBlob(row.file);
};

const extensionFor = (type: string) => type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : "jpg";

export async function upgradeLegacyReceiptDraft(
  draft: StoredOfflineReceiptDraft,
  dependencies: {
    prepare?: (file: File) => Promise<File>;
    hash?: (file: File) => Promise<string>;
    createId?: () => string;
  } = {},
): Promise<OfflineReceiptDraft> {
  if (isCurrentOfflineReceiptDraft(draft)) return draft;
  if (!isLegacyOfflineReceiptDraft(draft)) throw new Error("offline_legacy_draft_irrecoverable");

  const originalType = draft.type || draft.file.type || "application/octet-stream";
  const originalName = draft.generatedName || draft.name || `${draft.id}.${extensionFor(originalType)}`;
  const originalFile = new File([draft.file], originalName, { type: originalType });
  const alreadyPrepared = typeof draft.preparedHash === "string" && !!draft.preparedHash;
  const preparedFile = alreadyPrepared
    ? originalFile
    : await (dependencies.prepare ?? prepareReceiptFile)(originalFile);
  const preparedHash = alreadyPrepared
    ? draft.preparedHash!
    : await (dependencies.hash ?? sha256File)(preparedFile);
  const idempotencyKey = draft.idempotencyKey?.trim() || (dependencies.createId ?? crypto.randomUUID)();

  return {
    schemaVersion: OFFLINE_RECEIPT_SCHEMA_VERSION,
    id: draft.id,
    idempotencyKey,
    userId: draft.userId!,
    companyId: draft.companyId!,
    file: preparedFile,
    generatedName: preparedFile.name,
    type: preparedFile.type || originalType,
    preparedHash,
    createdAt: draft.createdAt || new Date().toISOString(),
    attempts: Number.isFinite(draft.attempts) ? Number(draft.attempts) : 0,
    status: draft.status ?? "pending",
    lastErrorCode: draft.lastErrorCode ?? null,
    lastAttemptAt: draft.lastAttemptAt ?? null,
    nextRetryAt: draft.nextRetryAt ?? null,
  };
}

export const MAX_RECEIPT_SYNC_ATTEMPTS = 5;
const RETRY_BASE_MS = 15_000;

export async function queueReceipt(file: File, preparedHash: string, userId: string, companyId: string, id = crypto.randomUUID()) {
  if (!userId || !companyId) throw new Error("offline_owner_required");
  if (!preparedHash) throw new Error("offline_hash_required");
  if (file.size > MAX_ITEM_BYTES) throw new Error("offline_receipt_too_large");
  const db = await open();
  const existing = await all(db);
  const existingBytes = existing.reduce((sum, row) => sum + (isBlob(row.file) ? row.file.size : 0), 0);
  if (existing.length >= MAX_ITEMS || existingBytes + file.size > MAX_QUEUE_BYTES) {
    db.close(); throw new Error("offline_queue_full");
  }
  const row: OfflineReceiptDraft = {
    schemaVersion: OFFLINE_RECEIPT_SCHEMA_VERSION,
    id, idempotencyKey: id, userId, companyId, file,
    generatedName: file.name || `${id}.${extensionFor(file.type)}`, type: file.type, preparedHash,
    createdAt: new Date().toISOString(), attempts: 0, status: "pending",
    lastErrorCode: null, lastAttemptAt: null, nextRetryAt: null,
  };
  await put(db, row);
  db.close(); return id;
}

export async function claimQueuedReceipt(id: string, userId: string, companyId: string, now = new Date()) {
  const db = await open(); const current = (await all(db)).find((row) => row.id === id);
  const status = current?.status ?? "pending";
  const lastAttemptAt = current?.lastAttemptAt ?? null;
  const attempts = Number.isFinite(current?.attempts) ? Number(current?.attempts) : 0;
  const nextRetryAt = current?.nextRetryAt ?? null;
  const stale = status === "syncing" && (!lastAttemptAt || now.getTime() - Date.parse(lastAttemptAt) > 60_000);
  const ready = current && current.userId === userId && current.companyId === companyId &&
    attempts < MAX_RECEIPT_SYNC_ATTEMPTS && (!nextRetryAt || Date.parse(nextRetryAt) <= now.getTime()) &&
    (status === "pending" || stale);
  if (!ready) { db.close(); return null; }
  const claimed: StoredOfflineReceiptDraft = { ...current, attempts, status: "syncing", lastAttemptAt: now.toISOString() };
  await put(db, claimed);
  db.close(); return claimed;
}

export async function upgradeQueuedReceipt(draft: StoredOfflineReceiptDraft, userId: string, companyId: string) {
  const db = await open();
  try {
    const current = (await all(db)).find((row) => row.id === draft.id);
    if (!current || current.userId !== userId || current.companyId !== companyId) {
      throw new Error("offline_receipt_not_owned");
    }
    const upgraded = await upgradeLegacyReceiptDraft(current);
    await put(db, upgraded);
    return upgraded;
  } finally {
    db.close();
  }
}

export async function markQueuedReceiptFailed(draft: StoredOfflineReceiptDraft, errorCode: string, retryable: boolean, now = new Date()) {
  const db = await open(); const attempts = (Number.isFinite(draft.attempts) ? Number(draft.attempts) : 0) + 1;
  const canRetry = retryable && attempts < MAX_RECEIPT_SYNC_ATTEMPTS;
  const row: StoredOfflineReceiptDraft = { ...draft, attempts, status: canRetry ? "pending" : "failed",
    lastErrorCode: errorCode, lastAttemptAt: now.toISOString(),
    nextRetryAt: canRetry ? new Date(now.getTime() + RETRY_BASE_MS * 2 ** (attempts - 1)).toISOString() : null };
  await put(db, row);
  db.close(); return row;
}

export async function retryQueuedReceipt(id: string, userId: string, companyId: string) {
  const db = await open(); const current = (await all(db)).find((row) => row.id === id);
  if (!current || current.userId !== userId || current.companyId !== companyId) { db.close(); throw new Error("offline_receipt_not_owned"); }
  const row: StoredOfflineReceiptDraft = { ...current, attempts: 0, status: "pending", lastErrorCode: null, nextRetryAt: null };
  await put(db, row);
  db.close(); return row;
}

export async function listQueuedReceipts(userId: string, companyId: string) {
  const db = await open(); const rows = (await all(db)).filter((row) => row.userId === userId && row.companyId === companyId);
  db.close(); return rows;
}

export async function removeQueuedReceipt(id: string, userId: string, companyId: string) {
  const db = await open(); const current = (await all(db)).find((row) => row.id === id);
  if (!current || current.userId !== userId || current.companyId !== companyId) { db.close(); throw new Error("offline_receipt_not_owned"); }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
  db.close();
}
