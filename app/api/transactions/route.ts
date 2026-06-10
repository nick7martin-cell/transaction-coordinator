import { teamSteadyAgentNameFromCommission, type CommissionResult } from "@/lib/commission";
import { supabase } from "@/lib/supabase";
import { applyAutoClose } from "@/lib/transaction-lifecycle";
import type { Transaction } from "@/lib/types";

export async function GET() {
  const [{ data, error }, { data: metaRows }] = await Promise.all([
    supabase.from("extractions").select("*").order("created_at", { ascending: false }),
    supabase.from("transaction_meta").select("transaction_id, worksheet, commission"),
  ]);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const photoById = new Map<string, string>();
  const agentById = new Map<string, string>();
  for (const row of metaRows ?? []) {
    const ws = row.worksheet as Record<string, unknown> | null;
    const url = ws?.propertyPhotoUrl;
    if (typeof url === "string" && url) photoById.set(row.transaction_id, url);
    const agent = teamSteadyAgentNameFromCommission(
      row.commission as CommissionResult | null
    );
    if (agent) agentById.set(row.transaction_id, agent);
  }

  let transactions: Transaction[] = (data ?? []).map((t) => ({
    ...(t as Transaction),
    propertyPhotoUrl: photoById.get(t.id) ?? null,
    teamSteadyAgentName: agentById.get(t.id) ?? null,
  }));

  transactions = await applyAutoClose(transactions);

  return Response.json({ transactions });
}
