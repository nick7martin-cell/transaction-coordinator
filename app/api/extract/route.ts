import { extractPdf } from "@/lib/extract-pdf";
import { partiesToWorksheet } from "@/lib/parties-worksheet";
import { supabase } from "@/lib/supabase";
import { buildTransactionRow } from "@/lib/transaction-db";
import { buildInitialParties } from "@/lib/transaction-seed";
import { applyWorksheetDefaults } from "@/lib/worksheet-defaults";
import type { Contact } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const pdfFile = formData.get("pdf") as File;
    const documentType = (formData.get("type") as string) || "purchase_agreement";

    if (!pdfFile) {
      return Response.json({ error: "No PDF provided" }, { status: 400 });
    }

    const result = await extractPdf(await pdfFile.arrayBuffer(), documentType);

    const { data, error } = await supabase
      .from("extractions")
      .insert({
        document_type: documentType,
        file_name: pdfFile.name,
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
          fileName: pdfFile.name,
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

    const parties = buildInitialParties(result, (contacts ?? []) as Contact[]);
    const worksheet = applyWorksheetDefaults({}, {
      ...partiesToWorksheet(parties),
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
