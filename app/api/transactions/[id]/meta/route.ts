import { isEmbeddedPropertyPhoto, publicPropertyPhotoUrl } from "@/lib/property-photo-storage";
import { supabase } from "@/lib/supabase";
import { buildTransactionUpdate } from "@/lib/transaction-db";
import {
  applyWorksheetDefaults,
  worksheetToExtractedConcessions,
} from "@/lib/worksheet-defaults";
import type { TransactionMeta } from "@/lib/types";
import { coerceExtractedData } from "@/lib/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await supabase
    .from("transaction_meta")
    .select("*")
    .eq("transaction_id", id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ meta: hydrateParties(data) });
}

/**
 * The parties roster is persisted inside the `worksheet` JSONB (under the
 * reserved `_parties` key) so it never depends on a separate column migration.
 * Expose it back at the top level as `meta.parties` for the client.
 */
function hydrateParties(
  row: Record<string, unknown> | null
): TransactionMeta | null {
  if (!row) return row as null;
  const ws = (row.worksheet ?? {}) as Record<string, unknown>;
  const storedUrl = publicPropertyPhotoUrl(
    row.property_photo_path as string | undefined
  );
  if (storedUrl) {
    ws.propertyPhotoUrl = storedUrl;
  } else if (isEmbeddedPropertyPhoto(ws.propertyPhotoUrl)) {
    ws.propertyPhotoUrl = undefined;
  }
  const wsParties = ws._parties;
  if (Array.isArray(wsParties)) {
    row.parties = wsParties;
  } else if (!Array.isArray(row.parties)) {
    row.parties = row.parties ?? null;
  }
  return row as unknown as TransactionMeta;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  // Fetch existing first so we can deep-merge worksheet / commission objects
  const { data: existing } = await supabase
    .from("transaction_meta")
    .select("*")
    .eq("transaction_id", id)
    .maybeSingle();

  // Build the merged worksheet JSONB. The parties roster lives inside it under
  // the reserved `_parties` key so persistence never depends on a separate
  // column migration (the `worksheet` JSONB always exists).
  const worksheet: Record<string, unknown> =
    "worksheet" in body || "parties" in body
      ? applyWorksheetDefaults(existing?.worksheet as Record<string, unknown>, {
          ...(existing?.worksheet ?? {}),
          ...(body.worksheet ?? {}),
        })
      : applyWorksheetDefaults(
          existing?.worksheet as Record<string, unknown>,
          (existing?.worksheet as Record<string, unknown>) ?? {}
        );

  if ("parties" in body) {
    worksheet._parties = body.parties;
  } else if ("worksheet" in body) {
    const existingWs = (existing?.worksheet ?? {}) as Record<string, unknown>;
    if (Array.isArray(existingWs._parties) && !Array.isArray(worksheet._parties)) {
      worksheet._parties = existingWs._parties;
    }
  }

  // Only write columns guaranteed to exist on the base table. The contact roster
  // (lender / title selections included) lives in worksheet._parties, so we no
  // longer depend on the optional contact-id columns or the `parties` column —
  // writing a missing column makes the WHOLE upsert fail (PGRST schema error).
  const merged: Record<string, unknown> = {
    transaction_id: id,
    commission: "commission" in body ? body.commission : existing?.commission ?? {},
    worksheet,
    updated_at: new Date().toISOString(),
  };

  // Preserve the legacy contact-id columns ONLY when the client explicitly sends
  // them (older flows). The current UI never does, avoiding the schema error.
  for (const k of ["lender_contact_id", "title_contact_id", "seller_title_contact_id"] as const) {
    if (k in body) merged[k] = body[k];
  }

  const { data, error } = await supabase
    .from("transaction_meta")
    .upsert(merged, { onConflict: "transaction_id" })
    .select()
    .single();

  if (error) {
    console.error("[meta PATCH] upsert failed:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const wsPatch = body.worksheet as Record<string, unknown> | undefined;
  if (
    wsPatch &&
    ("concessionsDollars" in wsPatch || "concessionsPct" in wsPatch)
  ) {
    const concessions = worksheetToExtractedConcessions(worksheet);
    const { data: extRow } = await supabase
      .from("extractions")
      .select("extracted_data")
      .eq("id", id)
      .maybeSingle();

    if (extRow?.extracted_data) {
      const extractedBase = {
        ...(extRow.extracted_data as Record<string, unknown>),
        ...concessions,
      };
      await supabase
        .from("extractions")
        .update({ extracted_data: extractedBase })
        .eq("id", id);
      const extracted = coerceExtractedData(extractedBase);
      await supabase
        .from("transactions")
        .update(buildTransactionUpdate({ extracted }))
        .eq("id", id);
    }
  }

  return Response.json({ meta: hydrateParties(data) });
}
