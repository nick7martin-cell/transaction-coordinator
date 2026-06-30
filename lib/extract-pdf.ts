import Anthropic from "@anthropic-ai/sdk";
import {
  buildExtractionPrompt,
  buildSupplementalExtractionPrompt,
  summarizePartiesForPrompt,
} from "@/lib/extraction-prompt";
import type { ExtractedData, TransactionParty } from "@/lib/types";
import { sanitizeNullableField, sanitizeStringArray } from "@/lib/format";

/** Sonnet is accurate for structured PA extraction at ~40% lower cost than Opus. */
export const EXTRACTION_MODEL =
  process.env.ANTHROPIC_EXTRACTION_MODEL ?? "claude-sonnet-4-6";

const client = new Anthropic();

export function normalizeExtraction(
  raw: Record<string, unknown>,
  options?: { supplemental?: boolean }
): ExtractedData {
  const errors = Array.isArray(raw.errors) ? raw.errors.map(String) : [];

  const result: ExtractedData = {
    propertyAddress: (raw.propertyAddress as string) ?? null,
    purchasePrice: typeof raw.purchasePrice === "number" ? raw.purchasePrice : null,
    closingDate: (raw.closingDate as string) ?? null,
    acceptanceDate: (raw.acceptanceDate as string) ?? null,
    inspectionPeriodDays:
      typeof raw.inspectionPeriodDays === "number" ? raw.inspectionPeriodDays : null,
    inspectionContingencyExpirationDate:
      (raw.inspectionContingencyExpirationDate as string) ?? null,
    earnestMoney: typeof raw.earnestMoney === "number" ? raw.earnestMoney : null,
    earnestMoneyDueDate: (raw.earnestMoneyDueDate as string) ?? null,
    financingType: (raw.financingType as ExtractedData["financingType"]) ?? null,
    financingPercentage:
      typeof raw.financingPercentage === "number" ? raw.financingPercentage : null,
    buyerBrokerCommissionPct:
      typeof raw.buyerBrokerCommissionPct === "number"
        ? raw.buyerBrokerCommissionPct
        : null,
    sellerPaidBuyerConcessions:
      typeof raw.sellerPaidBuyerConcessions === "number"
        ? raw.sellerPaidBuyerConcessions
        : null,
    sellerPaidBuyerConcessionsPct:
      typeof raw.sellerPaidBuyerConcessionsPct === "number"
        ? raw.sellerPaidBuyerConcessionsPct
        : null,
    mlsNumber: (raw.mlsNumber as string) ?? null,
    pidNumber: (raw.pidNumber as string) ?? null,
    buyerNames: sanitizeStringArray(raw.buyerNames),
    buyerEmails: sanitizeStringArray(raw.buyerEmails),
    buyerPhones: sanitizeStringArray(raw.buyerPhones),
    buyerAgentName: sanitizeNullableField(raw.buyerAgentName),
    buyerAgentBrokerage: sanitizeNullableField(raw.buyerAgentBrokerage),
    buyerAgentEmail: sanitizeNullableField(raw.buyerAgentEmail),
    buyerAgentPhone: sanitizeNullableField(raw.buyerAgentPhone),
    sellerNames: sanitizeStringArray(raw.sellerNames),
    sellerEmails: sanitizeStringArray(raw.sellerEmails),
    sellerPhones: sanitizeStringArray(raw.sellerPhones),
    listingAgentName: sanitizeNullableField(raw.listingAgentName),
    listingAgentBrokerage: sanitizeNullableField(raw.listingAgentBrokerage),
    listingAgentEmail: sanitizeNullableField(raw.listingAgentEmail),
    listingAgentPhone: sanitizeNullableField(raw.listingAgentPhone),
    dualAgency: Boolean(raw.dualAgency),
    contingencies: Array.isArray(raw.contingencies) ? raw.contingencies.map(String) : [],
    titleCompany: sanitizeNullableField(raw.titleCompany),
    buyerTitleCompany: sanitizeNullableField(raw.buyerTitleCompany),
    buyerTitleCloserName: sanitizeNullableField(raw.buyerTitleCloserName),
    buyerTitleCloserEmail: sanitizeNullableField(raw.buyerTitleCloserEmail),
    buyerTitleCloserPhone: sanitizeNullableField(raw.buyerTitleCloserPhone),
    sellerTitleCompany: sanitizeNullableField(raw.sellerTitleCompany),
    sellerTitleCloserName: sanitizeNullableField(raw.sellerTitleCloserName),
    sellerTitleCloserEmail: sanitizeNullableField(raw.sellerTitleCloserEmail),
    sellerTitleCloserPhone: sanitizeNullableField(raw.sellerTitleCloserPhone),
    hasPreApprovalLetter: Boolean(raw.hasPreApprovalLetter),
    lenderName: sanitizeNullableField(raw.lenderName),
    lenderCompany: sanitizeNullableField(raw.lenderCompany),
    lenderEmail: sanitizeNullableField(raw.lenderEmail),
    lenderPhone: sanitizeNullableField(raw.lenderPhone),
    confidence:
      typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : 0,
    flaggedForReview: Boolean(raw.flaggedForReview),
    errors,
  };

  if (!options?.supplemental && (!result.propertyAddress || !result.purchasePrice)) {
    result.flaggedForReview = true;
    if (!errors.includes("Missing critical fields")) {
      result.errors.push("Missing critical fields");
    }
  }

  if (result.confidence < 0.85) {
    result.flaggedForReview = true;
  }

  return result;
}

export type ExtractionDocument =
  | {
      kind: "pdf";
      buffer: ArrayBuffer;
      mediaType: "application/pdf";
    }
  | {
      kind: "image";
      buffer: ArrayBuffer;
      mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    };

type MessageContent = Anthropic.Messages.MessageCreateParams["messages"][number]["content"];

function buildMessageContent(
  documents: ExtractionDocument[],
  documentType: string,
  notes?: string | null
): MessageContent {
  const blocks: Extract<MessageContent, Array<unknown>> = [];

  for (const doc of documents) {
    const base64 = Buffer.from(doc.buffer).toString("base64");
    if (doc.kind === "pdf") {
      blocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64,
        },
      });
    } else {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: doc.mediaType,
          data: base64,
        },
      });
    }
  }

  const trimmedNotes = notes?.trim() ?? "";
  const hasSupplementalImages = documents.some((d) => d.kind === "image");

  if (trimmedNotes) {
    blocks.push({
      type: "text",
      text: `Additional context from the coordinator:\n${trimmedNotes}`,
    });
  }

  if (hasSupplementalImages || trimmedNotes) {
    blocks.push({
      type: "text",
      text:
        "Supplemental coordinator notes and/or screenshot images are included. " +
        "Extract ALL party contact details from them — email addresses, phone numbers, " +
        "title closers, lenders, and agents — even when that information is not on the purchase agreement.",
    });
  }

  blocks.push({
    type: "text",
    text: buildExtractionPrompt(documentType),
  });

  return blocks;
}

/** Run Claude extraction on one or more documents plus optional coordinator notes. */
export async function extractFromDocuments(
  documents: ExtractionDocument[],
  documentType = "purchase_agreement",
  notes?: string | null
): Promise<ExtractedData> {
  if (documents.length === 0) {
    throw new Error("At least one document is required");
  }

  const extraction = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: buildMessageContent(documents, documentType, notes),
      },
    ],
  });

  const responseText =
    extraction.content[0].type === "text" ? extraction.content[0].text : "";

  const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  return normalizeExtraction(parsed);
}

/** Extract party contact info from notes/screenshots without a purchase agreement PDF. */
export async function extractSupplementalContacts(
  documents: ExtractionDocument[],
  notes: string | null | undefined,
  context: {
    propertyAddress: string | null;
    existingParties?: TransactionParty[];
  }
): Promise<ExtractedData> {
  if (documents.length === 0 && !notes?.trim()) {
    throw new Error("At least one image or notes are required");
  }

  const blocks: Extract<MessageContent, Array<unknown>> = [];

  for (const doc of documents) {
    if (doc.kind !== "image") continue;
    const base64 = Buffer.from(doc.buffer).toString("base64");
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: doc.mediaType,
        data: base64,
      },
    });
  }

  const trimmedNotes = notes?.trim() ?? "";
  if (trimmedNotes) {
    blocks.push({
      type: "text",
      text: `Coordinator notes:\n${trimmedNotes}`,
    });
  }

  blocks.push({
    type: "text",
    text: buildSupplementalExtractionPrompt({
      propertyAddress: context.propertyAddress,
      knownParties: summarizePartiesForPrompt(
        (context.existingParties ?? []).map((p) => ({
          role: p.role,
          name: p.name,
          company: p.company,
          email: p.email,
        }))
      ),
    }),
  });

  const extraction = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 3000,
    messages: [{ role: "user", content: blocks }],
  });

  const responseText =
    extraction.content[0].type === "text" ? extraction.content[0].text : "";

  const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  return normalizeExtraction(parsed, { supplemental: true });
}

/** Run Claude extraction on a PDF buffer. */
export async function extractPdf(
  pdfBuffer: ArrayBuffer,
  documentType = "purchase_agreement"
): Promise<ExtractedData> {
  return extractFromDocuments(
    [{ kind: "pdf", buffer: pdfBuffer, mediaType: "application/pdf" }],
    documentType
  );
}
