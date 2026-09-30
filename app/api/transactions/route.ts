import { supabase } from "@/lib/supabase";
import {
  agentNameFromMetaCommission,
  EXTRACTION_LIST_SELECT,
  extractionListRowToTransaction,
  fetchTransactionListMeta,
  photoUrlFromListMetaRow,
  type ExtractionListRow,
} from "@/lib/transactions-list";
import type { Transaction } from "@/lib/types";

export async function GET() {
  const [{ data, error }, metaResult] = await Promise.all([
    supabase
      .from("extractions")
      .select(EXTRACTION_LIST_SELECT)
      .order("created_at", { ascending: false }),
    fetchTransactionListMeta(),
  ]);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (metaResult.error) {
    return Response.json({ error: metaResult.error }, { status: 500 });
  }

  const agentById = new Map<string, string>();
  const photoById = new Map<string, string>();
  for (const row of metaResult.rows) {
    const tid = row.transaction_id;
    const agent = agentNameFromMetaCommission(row.commission);
    if (agent) agentById.set(tid, agent);
    const url = photoUrlFromListMetaRow(row);
    if (url) photoById.set(tid, url);
  }

  const transactions: Transaction[] = ((data ?? []) as unknown as ExtractionListRow[]).map(
    (row) =>
      extractionListRowToTransaction(row, {
        teamSteadyAgentName: agentById.get(row.id) ?? null,
        propertyPhotoUrl: photoById.get(row.id) ?? null,
      })
  );

  return Response.json({ transactions });
}
