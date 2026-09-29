import { publicPropertyPhotoUrl } from "@/lib/property-photo-storage";
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
    supabase
      .from("transaction_meta")
      .select("transaction_id, commission, property_photo_path"),
  ]);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (metaError) {
    return Response.json({ error: metaError.message }, { status: 500 });
  }

  const agentById = new Map<string, string>();
  const photoById = new Map<string, string>();
  for (const row of metaRows ?? []) {
    const tid = row.transaction_id as string;
    const agent = agentNameFromMetaCommission(row.commission);
    if (agent) agentById.set(tid, agent);
    const url = publicPropertyPhotoUrl(
      row.property_photo_path as string | null | undefined
    );
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
