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
  sellerPaidBuyerConcessions: "Seller paid buyer concessions ($)",
  sellerPaidBuyerConcessionsPct: "Seller paid buyer concessions (%)",
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
  buyerTitleCompany: "Buyer's title company",
  buyerTitleCloserName: "Buyer's title closer",
  buyerTitleCloserEmail: "Buyer's title closer email",
  buyerTitleCloserPhone: "Buyer's title closer phone",
  sellerTitleCompany: "Seller's title company",
  sellerTitleCloserName: "Seller's title closer",
  sellerTitleCloserEmail: "Seller's title closer email",
  sellerTitleCloserPhone: "Seller's title closer phone",
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

function mergeStringArrays(prev: string[], next: string[]): string[] | null {
  const len = Math.max(prev.length, next.length);
  const out: string[] = [];
  let changed = false;
  for (let i = 0; i < len; i++) {
    const p = (prev[i] ?? "").trim();
    const n = (next[i] ?? "").trim();
    if (!p && n) changed = true;
    out.push(p || n);
  }
  return changed ? out : null;
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
    if (isBlank(next)) continue;

    if (Array.isArray(prev) && Array.isArray(next)) {
      const mergedArr = mergeStringArrays(prev, next);
      if (mergedArr) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (merged as any)[key] = mergedArr;
        filled.push({
          field: key,
          label: FIELD_LABELS[key] ?? key,
          value: formatValue(mergedArr),
        });
      }
      continue;
    }

    if (!isBlank(prev)) continue;

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
