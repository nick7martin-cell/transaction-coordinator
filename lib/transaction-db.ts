import type { ExtractedData } from "@/lib/types";

/**
 * Columns on the live Supabase `transactions` table (Table Editor).
 * Keep in sync if the schema changes.
 */
const TRANSACTION_TABLE_COLUMNS = [
  "id",
  "property_address",
  "purchase_price",
  "closing_date",
  "acceptance_date",
  "inspection_period_days",
  "earnest_money",
  "financing_type",
  "financing_percentage",
  "contingencies",
  "source_documents",
  "conflicts_noted",
] as const;

function pickTransactionColumns(
  row: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of TRANSACTION_TABLE_COLUMNS) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

function mapExtractedToTransactionFields(
  id: string,
  extracted: ExtractedData
): Record<string, unknown> {
  const e = extracted;
  return {
    id,
    property_address: e.propertyAddress,
    purchase_price: e.purchasePrice,
    closing_date: e.closingDate,
    acceptance_date: e.acceptanceDate,
    inspection_period_days: e.inspectionPeriodDays,
    earnest_money: e.earnestMoney,
    financing_type: e.financingType,
    financing_percentage: e.financingPercentage,
    contingencies: e.contingencies,
    /** Links this transaction to its source extraction / PA document (same UUID). */
    source_documents: id ? [id] : undefined,
    conflicts_noted: e.errors.length > 0 ? e.errors : undefined,
  };
}

/** Map extracted PA data onto the `transactions` table row shape (snake_case columns). */
export function buildTransactionRow(params: {
  id: string;
  documentType: string;
  fileName: string;
  extracted: ExtractedData;
}): Record<string, unknown> {
  return pickTransactionColumns(
    mapExtractedToTransactionFields(params.id, params.extracted)
  );
}

/** Partial update for PATCH / re-extract flows (omits id). */
export function buildTransactionUpdate(params: {
  fileName?: string;
  extracted: ExtractedData;
}): Record<string, unknown> {
  const { id: _id, ...fields } = mapExtractedToTransactionFields("", params.extracted);
  void _id;
  return pickTransactionColumns(fields);
}
