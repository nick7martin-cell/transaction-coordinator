import Anthropic from "@anthropic-ai/sdk";
import { buildExtractionPrompt } from "@/lib/extraction-prompt";
import type { ExtractedData } from "@/lib/types";

const client = new Anthropic();

export function normalizeExtraction(raw: Record<string, unknown>): ExtractedData {
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
    buyerNames: Array.isArray(raw.buyerNames) ? raw.buyerNames.map(String) : [],
    buyerEmails: Array.isArray(raw.buyerEmails) ? raw.buyerEmails.map(String) : [],
    buyerPhones: Array.isArray(raw.buyerPhones) ? raw.buyerPhones.map(String) : [],
    buyerAgentName: (raw.buyerAgentName as string) ?? null,
    buyerAgentBrokerage: (raw.buyerAgentBrokerage as string) ?? null,
    buyerAgentEmail: (raw.buyerAgentEmail as string) ?? null,
    buyerAgentPhone: (raw.buyerAgentPhone as string) ?? null,
    sellerNames: Array.isArray(raw.sellerNames) ? raw.sellerNames.map(String) : [],
    sellerEmails: Array.isArray(raw.sellerEmails) ? raw.sellerEmails.map(String) : [],
    sellerPhones: Array.isArray(raw.sellerPhones) ? raw.sellerPhones.map(String) : [],
    listingAgentName: (raw.listingAgentName as string) ?? null,
    listingAgentBrokerage: (raw.listingAgentBrokerage as string) ?? null,
    listingAgentEmail: (raw.listingAgentEmail as string) ?? null,
    listingAgentPhone: (raw.listingAgentPhone as string) ?? null,
    dualAgency: Boolean(raw.dualAgency),
    contingencies: Array.isArray(raw.contingencies) ? raw.contingencies.map(String) : [],
    titleCompany: (raw.titleCompany as string) ?? null,
    hasPreApprovalLetter: Boolean(raw.hasPreApprovalLetter),
    lenderName: (raw.lenderName as string) ?? null,
    lenderCompany: (raw.lenderCompany as string) ?? null,
    lenderEmail: (raw.lenderEmail as string) ?? null,
    lenderPhone: (raw.lenderPhone as string) ?? null,
    confidence:
      typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : 0,
    flaggedForReview: Boolean(raw.flaggedForReview),
    errors,
  };

  if (!result.propertyAddress || !result.purchasePrice) {
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

  if (hasSupplementalImages) {
    blocks.push({
      type: "text",
      text:
        "Supplemental screenshot images are included above. Use them together with the purchase agreement when extracting contact details and transaction information.",
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
    model: "claude-opus-4-6",
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
