import type { ExtractedData } from "@/lib/types";

const FIELD_LABELS: Partial<Record<keyof ExtractedData, string>> = {
  propertyAddress: "Property address",
  purchasePrice: "Purchase price",
  closingDate: "Closing date",
  acceptanceDate: "Acceptance date",
  inspectionPeriodDays: "Inspection period (days)",
  inspectionContingencyExpirationDate: "Inspection expiration date",
  earnestMoney: "Earnest money",
  earnestMoneyDueDate: "Earnest money due date",
  financingType: "Financing type",
  financingPercentage: "Financing percentage",
  buyerBrokerCommissionPct: "Buyer broker commission %",
  mlsNumber: "MLS number",
  pidNumber: "PID number",
  buyerNames: "Buyer name(s)",
  buyerEmails: "Buyer email(s)",
  buyerPhones: "Buyer phone(s)",
  buyerAgentName: "Buyer's agent",
  buyerAgentBrokerage: "Buyer's agent brokerage",
  buyerAgentEmail: "Buyer's agent email",
  buyerAgentPhone: "Buyer's agent phone",
  sellerNames: "Seller name(s)",
  sellerEmails: "Seller email(s)",
  sellerPhones: "Seller phone(s)",
  listingAgentName: "Listing agent",
  listingAgentBrokerage: "Listing agent brokerage",
  listingAgentEmail: "Listing agent email",
  listingAgentPhone: "Listing agent phone",
  dualAgency: "Dual agency flag",
  contingencies: "Contingencies",
  titleCompany: "Title company",
  hasPreApprovalLetter: "Pre-approval letter detected",
  lenderName: "Lender / loan officer",
  lenderCompany: "Lender company",
  lenderEmail: "Lender email",
  lenderPhone: "Lender phone",
};

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * Fill only blank/null fields on `existing` from `incoming`.
 * Never overwrites populated values (including manually edited extraction fields).
 */
export function mergeExtractedData(
  existing: ExtractedData,
  incoming: ExtractedData
): { merged: ExtractedData; filled: { field: string; label: string; value: string }[] } {
  const merged: ExtractedData = { ...existing };
  const filled: { field: string; label: string; value: string }[] = [];

  for (const key of Object.keys(incoming) as (keyof ExtractedData)[]) {
    if (key === "errors" || key === "confidence" || key === "flaggedForReview") continue;

    const prev = existing[key];
    const next = incoming[key];
    if (!isBlank(prev) || isBlank(next)) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (merged as any)[key] = next;
    filled.push({
      field: key,
      label: FIELD_LABELS[key] ?? key,
      value: formatValue(next),
    });
  }

  // Append new extraction errors only when there were none saved before.
  if (isBlank(existing.errors) && incoming.errors.length > 0) {
    merged.errors = [...incoming.errors];
    filled.push({
      field: "errors",
      label: "Extraction notes",
      value: incoming.errors.join("; "),
    });
  }

  return { merged, filled };
}
