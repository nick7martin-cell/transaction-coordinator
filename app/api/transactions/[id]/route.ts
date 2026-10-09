import { supabase } from "@/lib/supabase";
import { buildTransactionUpdate } from "@/lib/transaction-db";
import { daysUntilClosing } from "@/lib/format";
import {
  applyWorksheetDefaults,
  worksheetConcessionsOverwrite,
} from "@/lib/worksheet-defaults";
import {
  applyAutoCloseForId,
  isMissingStatusColumnError,
  isPersistedStatus,
  isStatusManual,
  normalizeTransactionRow,
  resolveStatus,
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

function parseSellerPaidClosingCosts(
  raw: unknown
):
  | { ok: true; dollars: number | null; pct: number | null }
  | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "Invalid seller paid closing costs" };
  }
  const mode = (raw as { mode?: unknown }).mode;
  if (mode !== "dollars" && mode !== "percent" && mode !== "none") {
    return { ok: false, error: "Invalid seller paid closing costs mode" };
  }
  if (mode === "none") {
    return { ok: true, dollars: null, pct: null };
  }
  const value = (raw as { value?: unknown }).value;
  if (mode === "dollars") {
    const dollars = parsePurchasePrice(value);
    if (dollars == null) {
      return { ok: false, error: "Invalid dollar amount for seller paid closing costs" };
    }
    return { ok: true, dollars, pct: null };
  }
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[%\s]/g, ""))
        : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 100) {
    return { ok: false, error: "Invalid percentage for seller paid closing costs" };
  }
  return { ok: true, dollars: null, pct: n };
}

async function syncWorksheetConcessionsFromExtracted(
  transactionId: string,
  extracted: ReturnType<typeof coerceExtractedData>
): Promise<void> {
  const { data: metaRow } = await supabase
    .from("transaction_meta")
    .select("worksheet, commission")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  const worksheet = applyWorksheetDefaults(
    metaRow?.worksheet as Record<string, unknown> | null | undefined,
    {
      ...((metaRow?.worksheet ?? {}) as Record<string, unknown>),
      ...worksheetConcessionsOverwrite(extracted),
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
  const hasSellerClosingCosts = "sellerPaidClosingCosts" in body;

  if (
    !hasFlagged &&
    !hasAcceptance &&
    !hasClosing &&
    !hasPurchasePrice &&
    !hasStatus &&
    !hasSellerClosingCosts
  ) {
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

    if (closingDate) {
      const preview = normalizeTransactionRow({
        ...existing,
        extracted_data: extractedBase,
      }) as Transaction;
      const days = daysUntilClosing(closingDate);
      if (
        days != null &&
        days >= 0 &&
        resolveStatus(preview) === "closed" &&
        !isStatusManual(preview)
      ) {
        updates.status = "active";
        updates.status_manual = false;
        extractedBase = withLifecycleInExtracted(extractedBase, "active", false);
      }
    }
  }

  if (hasPurchasePrice) {
    const purchasePrice = parsePurchasePrice(body.purchasePrice);
    if (purchasePrice == null) {
      return Response.json({ error: "Invalid purchase price" }, { status: 400 });
    }
    extractedBase = { ...extractedBase, purchasePrice };
  }

  if (hasSellerClosingCosts) {
    const parsed = parseSellerPaidClosingCosts(body.sellerPaidClosingCosts);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    extractedBase = {
      ...extractedBase,
      sellerPaidBuyerConcessions: parsed.dollars,
      sellerPaidBuyerConcessionsPct: parsed.pct,
    };
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

  if (
    hasAcceptance ||
    hasClosing ||
    hasPurchasePrice ||
    hasStatus ||
    hasSellerClosingCosts
  ) {
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

  if (hasSellerClosingCosts) {
    await syncWorksheetConcessionsFromExtracted(id, extracted);
  }

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
