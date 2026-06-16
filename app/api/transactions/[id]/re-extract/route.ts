import { extractPdf } from "@/lib/extract-pdf";
import { mergeExtractedData } from "@/lib/extraction-merge";
import { mergeWorksheetFromParties } from "@/lib/parties-worksheet";
import { supabase } from "@/lib/supabase";
import { buildTransactionUpdate } from "@/lib/transaction-db";
import {
  ensureDefaultTitleParties,
  mergeLenderFromExtraction,
} from "@/lib/transaction-seed";
import { mergeConcessionsIntoWorksheet } from "@/lib/worksheet-defaults";
import { preserveLifecycleInExtracted } from "@/lib/transaction-lifecycle";
import {
  coerceExtractedData,
  mergePartiesFromExtraction,
  type Contact,
  type Transaction,
  type TransactionParty,
} from "@/lib/types";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await req.formData();
    const pdfFile = formData.get("pdf") as File;

    if (!pdfFile) {
      return Response.json({ error: "No PDF provided" }, { status: 400 });
    }
    if (!pdfFile.name.toLowerCase().endsWith(".pdf")) {
      return Response.json({ error: "Please upload a PDF file" }, { status: 400 });
    }

    const [{ data: existing, error: fetchError }, { data: metaRow }] = await Promise.all([
      supabase.from("extractions").select("*").eq("id", id).single(),
      supabase.from("transaction_meta").select("worksheet, commission").eq("transaction_id", id).maybeSingle(),
    ]);

    if (fetchError || !existing) {
      return Response.json({ error: "Transaction not found" }, { status: 404 });
    }

    const current = coerceExtractedData(existing.extracted_data);
    const incoming = await extractPdf(await pdfFile.arrayBuffer(), existing.document_type);
    const { merged, filled } = mergeExtractedData(current, incoming);

    const existingWs = (metaRow?.worksheet ?? {}) as Record<string, unknown>;
    const wsParties = existingWs._parties;
    const existingParties: TransactionParty[] = Array.isArray(wsParties)
      ? (wsParties as TransactionParty[])
      : [];

    const { parties: mergedParties, added: partiesAdded } = mergePartiesFromExtraction(
      existingParties,
      merged
    );

    const { data: contacts } = await supabase
      .from("contacts")
      .select("*")
      .order("type")
      .order("company_name");

    let nextParties = ensureDefaultTitleParties(mergedParties);
    const lenderMerge = mergeLenderFromExtraction(
      nextParties,
      merged,
      (contacts ?? []) as Contact[]
    );
    nextParties = lenderMerge.parties;
    const allPartiesAdded = lenderMerge.added
      ? [...partiesAdded, lenderMerge.added]
      : partiesAdded;

    const worksheet = mergeConcessionsIntoWorksheet(
      mergeWorksheetFromParties(existingWs, nextParties),
      merged
    );

    const extractedPayload = preserveLifecycleInExtracted(
      merged as unknown as Record<string, unknown>,
      existing.extracted_data
    );

    const { data: updated, error: updateError } = await supabase
      .from("extractions")
      .update({
        file_name: pdfFile.name,
        extracted_data: extractedPayload,
        flagged_for_review: merged.flaggedForReview,
        confidence: merged.confidence,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    const { error: transactionError } = await supabase
      .from("transactions")
      .update(
        buildTransactionUpdate({
          fileName: pdfFile.name,
          extracted: merged,
        })
      )
      .eq("id", id);

    if (transactionError) {
      return Response.json({ error: transactionError.message }, { status: 500 });
    }

    const { error: metaError } = await supabase.from("transaction_meta").upsert(
      {
        transaction_id: id,
        commission: metaRow?.commission ?? {},
        worksheet,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "transaction_id" }
    );

    if (metaError) {
      return Response.json({ error: metaError.message }, { status: 500 });
    }

    return Response.json({
      success: true,
      transaction: updated as Transaction,
      parties: nextParties,
      filled,
      partiesAdded: allPartiesAdded,
      filledCount: filled.length + allPartiesAdded.length,
    });
  } catch (error) {
    return Response.json(
      { error: "Re-extraction failed", details: String(error) },
      { status: 500 }
    );
  }
}
