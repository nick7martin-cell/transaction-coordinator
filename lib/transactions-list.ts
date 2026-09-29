import { teamSteadyAgentNameFromCommission, type CommissionResult } from "@/lib/commission";
import { normalizeTransactionRow } from "@/lib/transaction-lifecycle";
import { coerceExtractedData, type Transaction } from "@/lib/types";

/** PostgREST projection — avoids shipping full extracted_data JSONB on list loads. */
export const EXTRACTION_LIST_SELECT = `
  id,
  document_type,
  file_name,
  flagged_for_review,
  status,
  status_manual,
  confidence,
  created_at,
  propertyAddress:extracted_data->propertyAddress,
  purchasePrice:extracted_data->purchasePrice,
  closingDate:extracted_data->closingDate,
  lifecycle:extracted_data->_lifecycle
`.replace(/\s+/g, " ");

export type ExtractionListRow = {
  id: string;
  document_type: string;
  file_name: string;
  flagged_for_review: boolean;
  status: Transaction["status"];
  status_manual: boolean | null;
  confidence: number | null;
  created_at: string;
  propertyAddress: unknown;
  purchasePrice: unknown;
  closingDate: unknown;
  lifecycle: unknown;
};

export function extractionListRowToTransaction(
  row: ExtractionListRow,
  opts: { teamSteadyAgentName?: string | null; propertyPhotoUrl?: string | null }
): Transaction {
  const extracted_data: Record<string, unknown> = {
    ...coerceExtractedData({
      propertyAddress: row.propertyAddress,
      purchasePrice: row.purchasePrice,
      closingDate: row.closingDate,
    }),
  };
  if (row.lifecycle && typeof row.lifecycle === "object") {
    extracted_data._lifecycle = row.lifecycle;
  }

  return normalizeTransactionRow({
    id: row.id,
    document_type: row.document_type,
    file_name: row.file_name,
    flagged_for_review: row.flagged_for_review,
    status: row.status,
    status_manual: row.status_manual ?? undefined,
    confidence: row.confidence ?? 0,
    created_at: row.created_at,
    extracted_data,
    propertyPhotoUrl: opts.propertyPhotoUrl ?? null,
    teamSteadyAgentName: opts.teamSteadyAgentName ?? null,
  } as unknown as Record<string, unknown>);
}

export function agentNameFromMetaCommission(commission: unknown): string | null {
  return teamSteadyAgentNameFromCommission(commission as CommissionResult | null);
}
