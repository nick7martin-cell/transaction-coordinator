import {
  concessionsFieldsEqual,
} from "@/lib/counteroffer-concessions";
import { applyExtractionPostProcess } from "@/lib/extraction-postprocess";
import { supabase } from "@/lib/supabase";
import { buildTransactionUpdate } from "@/lib/transaction-db";
import {
  applyWorksheetDefaults,
  worksheetConcessionsOverwrite,
} from "@/lib/worksheet-defaults";
import type { ExtractedData } from "@/lib/types";
import { coerceExtractedDataBase } from "@/lib/types";

export function effectiveExtractedFromRaw(
  raw: Record<string, unknown>
): ExtractedData {
  return applyExtractionPostProcess(coerceExtractedDataBase(raw));
}

export function concessionsRepairNeeded(raw: Record<string, unknown>): boolean {
  const base = coerceExtractedDataBase(raw);
  const effective = applyExtractionPostProcess(base);
  return !concessionsFieldsEqual(base, effective);
}

export function rawExtractedWithEffectiveConcessions(
  raw: Record<string, unknown>,
  effective: ExtractedData
): Record<string, unknown> {
  return {
    ...raw,
    sellerPaidBuyerConcessions: effective.sellerPaidBuyerConcessions,
    sellerPaidBuyerConcessionsPct: effective.sellerPaidBuyerConcessionsPct,
  };
}

/** Persist counteroffer-corrected concessions and sync CW line 159. */
export async function repairConcessionsForTransaction(
  transactionId: string,
  rawExtracted: Record<string, unknown>
): Promise<ExtractedData | null> {
  if (!concessionsRepairNeeded(rawExtracted)) return null;

  const effective = effectiveExtractedFromRaw(rawExtracted);
  const extractedPayload = rawExtractedWithEffectiveConcessions(
    rawExtracted,
    effective
  );

  await supabase
    .from("extractions")
    .update({ extracted_data: extractedPayload })
    .eq("id", transactionId);

  await supabase
    .from("transactions")
    .update(buildTransactionUpdate({ extracted: effective }))
    .eq("id", transactionId);

  const { data: metaRow } = await supabase
    .from("transaction_meta")
    .select("worksheet, commission")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  const worksheet = applyWorksheetDefaults(
    metaRow?.worksheet as Record<string, unknown> | null | undefined,
    {
      ...((metaRow?.worksheet ?? {}) as Record<string, unknown>),
      ...worksheetConcessionsOverwrite(effective),
    }
  );

  await supabase.from("transaction_meta").upsert(
    {
      transaction_id: transactionId,
      commission: metaRow?.commission ?? {},
      worksheet,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "transaction_id" }
  );

  return effective;
}
