import { supabase } from "@/integrations/supabase/client";

export interface DuplicateMatch {
  id: string;
  file_name: string | null;
  amount: number | null;
  spent_on: string | null;
  expense_id: string | null;
  match_reason: "hash" | "fingerprint";
}

/**
 * Busca un duplicado por hash exacto. Si no, intenta por (vendor + amount + fecha).
 */
export async function findDuplicateReceipt(opts: {
  hash?: string;
  vendorId?: string | null;
  amount?: number | null;
  spentOn?: string | null;
}): Promise<DuplicateMatch | null> {
  if (opts.hash) {
    const { data } = await supabase
      .from("receipts")
      .select("id, file_name, amount, spent_on, expense_id")
      .eq("file_hash", opts.hash)
      .limit(1)
      .maybeSingle();
    if (data) return { ...data, match_reason: "hash" };
  }
  if (opts.vendorId && opts.amount && opts.spentOn) {
    const { data } = await supabase
      .from("receipts")
      .select("id, file_name, amount, spent_on, expense_id")
      .eq("vendor_id", opts.vendorId)
      .eq("amount", opts.amount)
      .eq("spent_on", opts.spentOn)
      .limit(1)
      .maybeSingle();
    if (data) return { ...data, match_reason: "fingerprint" };
  }
  return null;
}
