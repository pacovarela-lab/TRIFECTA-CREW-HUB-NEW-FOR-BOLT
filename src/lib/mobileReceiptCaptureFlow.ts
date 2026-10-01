export type CaptureFlowResult<T> =
  | { status: "duplicate"; duplicate: T }
  | { status: "uploaded"; receiptId: string; postProcessingFailed: boolean }
  | { status: "queued" }
  | { status: "failed"; error: unknown };

export function isRetryableNetworkError(error: unknown, online = navigator.onLine): boolean {
  if (!online) return true;
  const value = error as { message?: string; name?: string; status?: number; statusCode?: number; code?: string } | null;
  const status = Number(value?.status ?? value?.statusCode);
  if ([502, 503, 504].includes(status)) return true;
  if (value?.name === "AbortError" || value?.code === "ETIMEDOUT" || value?.code === "ECONNRESET") return true;
  return /failed to fetch|network(?: request)? failed|networkerror|load failed|timed?\s*out|connection (?:aborted|reset)/i.test(value?.message ?? "");
}

export async function executeReceiptCapture<TDuplicate>(args: {
  preparedFile: File;
  preparedHash: string;
  findDuplicate: (hash: string) => Promise<TDuplicate | null>;
  upload: (file: File, hash: string) => Promise<{ id: string }>;
  postProcess: (receiptId: string, file: File, hash: string) => Promise<void>;
  queue: (file: File, hash: string) => Promise<void>;
  online?: () => boolean;
}): Promise<CaptureFlowResult<TDuplicate>> {
  let remoteReceiptId: string | null = null;
  if (!(args.online?.() ?? navigator.onLine)) {
    try {
      await args.queue(args.preparedFile, args.preparedHash);
      return { status: "queued" };
    } catch (error) {
      return { status: "failed", error };
    }
  }
  try {
    const duplicate = await args.findDuplicate(args.preparedHash);
    if (duplicate) return { status: "duplicate", duplicate };
    const receipt = await args.upload(args.preparedFile, args.preparedHash);
    remoteReceiptId = receipt.id;
  } catch (error) {
    if (!remoteReceiptId && isRetryableNetworkError(error, args.online?.() ?? navigator.onLine)) {
      await args.queue(args.preparedFile, args.preparedHash);
      return { status: "queued" };
    }
    return { status: "failed", error };
  }

  try {
    await args.postProcess(remoteReceiptId, args.preparedFile, args.preparedHash);
    return { status: "uploaded", receiptId: remoteReceiptId, postProcessingFailed: false };
  } catch {
    return { status: "uploaded", receiptId: remoteReceiptId, postProcessingFailed: true };
  }
}
