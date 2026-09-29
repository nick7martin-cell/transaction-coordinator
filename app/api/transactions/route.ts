import { supabase } from "@/lib/supabase";
import {
  agentNameFromMetaCommission,
  EXTRACTION_LIST_SELECT,
  extractionListRowToTransaction,
  type ExtractionListRow,
} from "@/lib/transactions-list";
import type { Transaction } from "@/lib/types";

export async function GET() {
  const [{ data, error }, { data: metaRows, error: metaError }] = await Promise.all([
    supabase
      .from("extractions")
      .select(EXTRACTION_LIST_SELECT)
      .order("created_at", { ascending: false }),
    supabase.from("transaction_meta").select("transaction_id, commission"),
  ]);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (metaError) {
    return Response.json({ error: metaError.message }, { status: 500 });
  }

  const agentById = new Map<string, string>();
  for (const row of metaRows ?? []) {
    const agent = agentNameFromMetaCommission(row.commission);
    if (agent) agentById.set(row.transaction_id as string, agent);
  }

  const transactions: Transaction[] = ((data ?? []) as unknown as ExtractionListRow[]).map(
    (row) =>
      extractionListRowToTransaction(row, {
        teamSteadyAgentName: agentById.get(row.id) ?? null,
        propertyPhotoUrl: null,
      })
  );

  return Response.json({ transactions });
}
