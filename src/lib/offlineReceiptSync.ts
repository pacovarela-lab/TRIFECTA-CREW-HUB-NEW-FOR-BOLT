import { isCurrentOfflineReceiptDraft, type OfflineReceiptDraft, type StoredOfflineReceiptDraft } from "@/lib/offlineReceiptQueue";
import { isRetryableNetworkError } from "@/lib/mobileReceiptCaptureFlow";

const processing = new Set<string>();

export async function syncOfflineReceiptDrafts(args: {
  drafts: StoredOfflineReceiptDraft[];
  claim: (draft: StoredOfflineReceiptDraft) => Promise<StoredOfflineReceiptDraft | null>;
  upgrade?: (draft: StoredOfflineReceiptDraft) => Promise<OfflineReceiptDraft>;
  findDuplicate: (hash: string) => Promise<unknown | null>;
  upload: (file: File, hash: string, idempotencyKey: string) => Promise<unknown>;
  remove: (draft: OfflineReceiptDraft) => Promise<void>;
  fail: (draft: StoredOfflineReceiptDraft, error: unknown, retryable: boolean) => Promise<void>;
  online?: () => boolean;
}) {
  for (const candidate of args.drafts) {
    if (processing.has(candidate.id)) continue;
    processing.add(candidate.id);
    let attemptedDraft: StoredOfflineReceiptDraft | null = null;
    try {
      const claimed = await args.claim(candidate);
      if (!claimed) continue;
      attemptedDraft = claimed;
      const draft = isCurrentOfflineReceiptDraft(claimed)
        ? claimed
        : await (args.upgrade
          ? args.upgrade(claimed)
          : Promise.reject(new Error("offline_legacy_upgrade_unavailable")));
      attemptedDraft = draft;
      const duplicate = await args.findDuplicate(draft.preparedHash);
      if (duplicate) { await args.remove(draft); continue; }
      const file = new File([draft.file], draft.generatedName, { type: draft.type });
      await args.upload(file, draft.preparedHash, draft.idempotencyKey);
      await args.remove(draft);
    } catch (error) {
      if (attemptedDraft) await args.fail(attemptedDraft, error, isRetryableNetworkError(error, args.online?.() ?? navigator.onLine));
    } finally {
      processing.delete(candidate.id);
    }
  }
}
