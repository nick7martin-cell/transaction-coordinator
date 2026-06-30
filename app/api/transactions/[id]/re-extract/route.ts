import {
  extractFromDocuments,
  extractSupplementalContacts,
} from "@/lib/extract-pdf";
import { mergeExtractedData, applySupplementalLenderOverride } from "@/lib/extraction-merge";
import { mergeWorksheetFromParties } from "@/lib/parties-worksheet";
import { mergePartiesFromExtraction } from "@/lib/party-merge";
import { supabase } from "@/lib/supabase";
import { buildTransactionUpdate } from "@/lib/transaction-db";
import {
  ensureDefaultTitleParties,
  mergeLenderFromExtraction,
} from "@/lib/transaction-seed";
import { mergeConcessionsIntoWorksheet } from "@/lib/worksheet-defaults";
import { preserveLifecycleInExtracted } from "@/lib/transaction-lifecycle";
import {
  countPdfFiles,
  filesToExtractionDocuments,
  isAllowedUploadFile,
  isImageFile,
  isPdfFile,
} from "@/lib/upload-files";
import {
  coerceExtractedData,
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
    const notesRaw = formData.get("notes");
    const notes =
      typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null;

    const uploaded = [
      ...formData.getAll("files"),
      ...(formData.has("pdf") ? [formData.get("pdf")] : []),
    ].filter((f): f is File => f instanceof File && f.size > 0);

    const invalid = uploaded.filter((f) => !isAllowedUploadFile(f));
    if (invalid.length > 0) {
      return Response.json(
        {
          error:
            "Unsupported file type. Upload a PDF and/or JPEG, PNG, GIF, or WebP images.",
        },
        { status: 400 }
      );
    }

    const pdfCount = countPdfFiles(uploaded);
    if (pdfCount > 1) {
      return Response.json(
        { error: "Please upload only one PDF purchase agreement." },
        { status: 400 }
      );
    }

    const hasPdf = pdfCount === 1;
    const hasImages = uploaded.some(isImageFile);
    if (!hasPdf && !hasImages && !notes) {
      return Response.json(
        {
          error:
            "Provide a revised PDF, email screenshots, and/or notes with contact information.",
        },
        { status: 400 }
      );
    }

    const [{ data: existing, error: fetchError }, { data: metaRow }] =
      await Promise.all([
        supabase.from("extractions").select("*").eq("id", id).single(),
        supabase
          .from("transaction_meta")
          .select("worksheet, commission")
          .eq("transaction_id", id)
          .maybeSingle(),
      ]);

    if (fetchError || !existing) {
      return Response.json({ error: "Transaction not found" }, { status: 404 });
    }

    const current = coerceExtractedData(existing.extracted_data);
    const existingWs = (metaRow?.worksheet ?? {}) as Record<string, unknown>;
    const wsParties = existingWs._parties;
    const existingParties: TransactionParty[] = Array.isArray(wsParties)
      ? (wsParties as TransactionParty[])
      : [];

    let incoming;
    if (hasPdf) {
      const documents = await filesToExtractionDocuments(
        uploaded.sort((a, b) => {
          if (isPdfFile(a) && !isPdfFile(b)) return -1;
          if (!isPdfFile(a) && isPdfFile(b)) return 1;
          return 0;
        })
      );
      incoming = await extractFromDocuments(
        documents,
        existing.document_type,
        notes
      );
    } else {
      const images = uploaded.filter(isImageFile);
      const documents = await filesToExtractionDocuments(images);
      incoming = await extractSupplementalContacts(documents, notes, {
        propertyAddress: current.propertyAddress,
        existingParties,
      });
    }

    const { merged: baseMerged, filled } = mergeExtractedData(current, incoming);
    const merged = applySupplementalLenderOverride(baseMerged, incoming);

    const {
      parties: mergedParties,
      added: partiesAdded,
      updated: partiesUpdated,
    } = mergePartiesFromExtraction(existingParties, merged);

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

    const pdfFile = uploaded.find(isPdfFile);
    const { data: updated, error: updateError } = await supabase
      .from("extractions")
      .update({
        ...(pdfFile ? { file_name: pdfFile.name } : {}),
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
          ...(pdfFile ? { fileName: pdfFile.name } : {}),
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
      partiesUpdated,
      filledCount:
        filled.length + allPartiesAdded.length + partiesUpdated.length,
    });
  } catch (error) {
    return Response.json(
      { error: "Re-extraction failed", details: String(error) },
      { status: 500 }
    );
  }
}
