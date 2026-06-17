import { supabase } from "@/lib/supabase";
import { buildTransactionUpdate } from "@/lib/transaction-db";
import {
  applyAutoCloseForId,
  isMissingStatusColumnError,
  isPersistedStatus,
  normalizeTransactionRow,
  stripStatusColumnsFromUpdates,
  withLifecycleInExtracted,
} from "@/lib/transaction-lifecycle";
import type { Transaction } from "@/lib/types";
import { coerceExtractedData } from "@/lib/types";

function parsePurchasePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,\s]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("extractions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return Response.json(
      { error: error.message },
      { status: error.code === "PGRST116" ? 404 : 500 }
    );
  }

  const transaction = normalizeTransactionRow(
    (await applyAutoCloseForId(data as Transaction)) as unknown as Record<
      string,
      unknown
    >
  );

  return Response.json({ transaction });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const hasFlagged = "flagged_for_review" in body;
  const hasAcceptance = "acceptanceDate" in body;
  const hasClosing = "closingDate" in body;
  const hasPurchasePrice = "purchasePrice" in body;
  const hasStatus = "status" in body;

  if (!hasFlagged && !hasAcceptance && !hasClosing && !hasPurchasePrice && !hasStatus) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("extractions")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return Response.json(
      { error: fetchError?.message ?? "Transaction not found" },
      { status: fetchError?.code === "PGRST116" ? 404 : 500 }
    );
  }

  const updates: Record<string, unknown> = {};
  let extractedBase = (existing.extracted_data ?? {}) as Record<string, unknown>;

  if (hasFlagged) {
    updates.flagged_for_review = Boolean(body.flagged_for_review);
  }

  if (hasAcceptance) {
    const raw = body.acceptanceDate;
    const acceptanceDate =
      typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
    extractedBase = { ...extractedBase, acceptanceDate };
  }

  if (hasClosing) {
    const raw = body.closingDate;
    const closingDate =
      typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
    extractedBase = { ...extractedBase, closingDate };
  }

  if (hasPurchasePrice) {
    const purchasePrice = parsePurchasePrice(body.purchasePrice);
    if (purchasePrice == null) {
      return Response.json({ error: "Invalid purchase price" }, { status: 400 });
    }
    extractedBase = { ...extractedBase, purchasePrice };
  }

  if (hasStatus) {
    if (!isPersistedStatus(body.status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = body.status;
    updates.status_manual = true;
    extractedBase = withLifecycleInExtracted(
      extractedBase,
      body.status,
      true
    );
  }

  if (hasAcceptance || hasClosing || hasPurchasePrice || hasStatus) {
    updates.extracted_data = extractedBase;
  }

  let { data, error } = await supabase
    .from("extractions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (isMissingStatusColumnError(error) && hasStatus) {
    ({ data, error } = await supabase
      .from("extractions")
      .update(stripStatusColumnsFromUpdates(updates))
      .eq("id", id)
      .select()
      .single());
  }

  if (error) {
    return Response.json(
      { error: error.message },
      { status: error.code === "PGRST116" ? 404 : 500 }
    );
  }

  const extracted = coerceExtractedData(data.extracted_data);
  await supabase
    .from("transactions")
    .update(buildTransactionUpdate({ extracted }))
    .eq("id", id);

  return Response.json({ transaction: normalizeTransactionRow(data) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { error: metaError } = await supabase
    .from("transaction_meta")
    .delete()
    .eq("transaction_id", id);

  if (metaError) {
    return Response.json({ error: metaError.message }, { status: 500 });
  }

  const { error: transactionError } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id);

  if (transactionError) {
    return Response.json({ error: transactionError.message }, { status: 500 });
  }

  const { error: extractionError } = await supabase
    .from("extractions")
    .delete()
    .eq("id", id);

  if (extractionError) {
    return Response.json({ error: extractionError.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
