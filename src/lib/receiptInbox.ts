export const countReceiptInboxRows = (rows: ReadonlyArray<{ id: string }> | null): number => rows?.length ?? 0;
