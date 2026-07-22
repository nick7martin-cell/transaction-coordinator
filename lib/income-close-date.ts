import { buildTransactionUpdate } from "@/lib/transaction-db";
import type { IncomeRow } from "@/lib/income-tracker";
import { supabase } from "@/lib/supabase";
import { coerceExtractedData } from "@/lib/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isIsoCloseDate(value: string): boolean {
  return ISO_DATE.test(value);
}

export function isHandledIncomeRowId(id: string): boolean {
  return UUID_RE.test(id);
}

export function incomeRowWithCloseDate(row: IncomeRow, closeDate: string): IncomeRow {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const closing = new Date(closeDate + "T12:00:00");
  const status: IncomeRow["status"] =
    row.status === "cancelled"
      ? "cancelled"
      : closing.getTime() < today.getTime()
        ? "closed"
        : "active";

  return {
    ...row,
    closeDate,
    monthKey: closeDate.slice(0, 7),
    status,
  };
}

export async function updateHandledTransactionCloseDate(
  transactionId: string,
  closingDate: string
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("extractions")
    .select("extracted_data")
    .eq("id", transactionId)
    .single();

  if (fetchError || !existing) {
    throw new Error(fetchError?.message ?? "Transaction not found");
  }

  const extractedBase = {
    ...((existing.extracted_data ?? {}) as Record<string, unknown>),
    closingDate,
  };

  const { data, error } = await supabase
    .from("extractions")
    .update({ extracted_data: extractedBase })
    .eq("id", transactionId)
    .select("extracted_data")
    .single();

  if (error) throw new Error(error.message);

  const extracted = coerceExtractedData(data.extracted_data);
  const { error: syncError } = await supabase
    .from("transactions")
    .update(buildTransactionUpdate({ extracted }))
    .eq("id", transactionId);

  if (syncError) throw new Error(syncError.message);
}
