import { extractFromDocuments } from "@/lib/extract-pdf";
import { partiesToWorksheet } from "@/lib/parties-worksheet";
import { supabase } from "@/lib/supabase";
import { buildTransactionRow } from "@/lib/transaction-db";
import { buildInitialParties } from "@/lib/transaction-seed";
import {
  countPdfFiles,
  filesToExtractionDocuments,
  isAllowedUploadFile,
  isPdfFile,
  primaryFileName,
} from "@/lib/upload-files";
import { mergePartiesFromExtraction } from "@/lib/party-merge";
import { applyWorksheetDefaults, concessionsWorksheetFields } from "@/lib/worksheet-defaults";
import type { Contact } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const documentType = (formData.get("type") as string) || "purchase_agreement";
    const notesRaw = formData.get("notes");
    const notes =
      typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null;

    const uploaded = [
      ...formData.getAll("files"),
      ...(formData.has("pdf") ? [formData.get("pdf")] : []),
    ].filter((f): f is File => f instanceof File);

    if (uploaded.length === 0) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    const invalid = uploaded.filter((f) => !isAllowedUploadFile(f));
    if (invalid.length > 0) {
      return Response.json(
        {
          error:
            "Unsupported file type. Upload a PDF purchase agreement and optional JPEG, PNG, GIF, or WebP images.",
        },
        { status: 400 }
      );
    }

    const pdfCount = countPdfFiles(uploaded);
    if (pdfCount === 0) {
      return Response.json(
        { error: "Please include the purchase agreement PDF." },
        { status: 400 }
      );
    }
    if (pdfCount > 1) {
      return Response.json(
        { error: "Please upload only one PDF purchase agreement." },
        { status: 400 }
      );
    }

    const documents = await filesToExtractionDocuments(
      uploaded.sort((a, b) => {
        if (isPdfFile(a) && !isPdfFile(b)) return -1;
        if (!isPdfFile(a) && isPdfFile(b)) return 1;
        return 0;
      })
    );

    const result = await extractFromDocuments(documents, documentType, notes);
    const fileName = primaryFileName(uploaded);

    const { data, error } = await supabase
      .from("extractions")
      .insert({
        document_type: documentType,
        file_name: fileName,
        extracted_data: result,
        flagged_for_review: result.flaggedForReview,
        confidence: result.confidence,
      })
      .select();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const transactionId = data[0].id as string;

    const { error: transactionError } = await supabase
      .from("transactions")
      .insert(
        buildTransactionRow({
          id: transactionId,
          documentType,
          fileName,
          extracted: result,
        })
      );

    if (transactionError) {
      await supabase.from("extractions").delete().eq("id", transactionId);
      return Response.json({ error: transactionError.message }, { status: 500 });
    }

    const { data: contacts } = await supabase
      .from("contacts")
      .select("*")
      .order("type")
      .order("company_name");

    const parties = mergePartiesFromExtraction(
      buildInitialParties(result, (contacts ?? []) as Contact[]),
      result
    ).parties;
    const worksheet = applyWorksheetDefaults({}, {
      ...partiesToWorksheet(parties),
      ...concessionsWorksheetFields(result),
      _parties: parties,
    });

    await supabase.from("transaction_meta").upsert(
      {
        transaction_id: transactionId,
        commission: {},
        worksheet,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "transaction_id" }
    );

    return Response.json({
      success: true,
      extraction: result,
      id: transactionId,
      flaggedForReview: result.flaggedForReview,
    });
  } catch (error) {
    return Response.json(
      { error: "Extraction failed", details: String(error) },
      { status: 500 }
    );
  }
}
