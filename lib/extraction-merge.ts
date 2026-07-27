import type { ExtractedData } from "@/lib/types";
import { sanitizeContactField } from "@/lib/format";
import {
  hasTitleContactInfo,
  titleInfoForSide,
  type TitleContactInfo,
} from "@/lib/transaction-seed";

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

const LENDER_KEYS = [
  "lenderName",
  "lenderCompany",
  "lenderEmail",
  "lenderPhone",
] as const satisfies readonly (keyof ExtractedData)[];

/**
 * When supplemental notes/screenshots name a lender, allow that to replace a
 * previously auto-seeded or extracted loan officer (e.g. Josh Little → Laura Freese).
 */
export function applySupplementalLenderOverride(
  existing: ExtractedData,
  incoming: ExtractedData
): ExtractedData {
  const incName = sanitizeContactField(incoming.lenderName ?? "");
  const incEmail = sanitizeContactField(incoming.lenderEmail ?? "");
  if (!incName && !incEmail) return existing;

  const exName = sanitizeContactField(existing.lenderName ?? "");
  const exEmail = sanitizeContactField(existing.lenderEmail ?? "");
  const nameDiffers =
    !!incName && !!exName && incName.toLowerCase() !== exName.toLowerCase();
  const emailDiffers =
    !!incEmail &&
    !!exEmail &&
    incEmail.toLowerCase() !== exEmail.toLowerCase();

  if (!nameDiffers && !emailDiffers) return existing;

  const merged: ExtractedData = { ...existing };
  for (const key of LENDER_KEYS) {
    const next = incoming[key];
    if (typeof next === "string" && next.trim()) {
      merged[key] = next;
    }
  }
  return merged;
}

const SELLER_TITLE_KEYS = [
  "sellerTitleCompany",
  "sellerTitleCloserName",
  "sellerTitleCloserEmail",
  "sellerTitleCloserPhone",
] as const satisfies readonly (keyof ExtractedData)[];

const BUYER_TITLE_KEYS = [
  "buyerTitleCompany",
  "buyerTitleCloserName",
  "buyerTitleCloserEmail",
  "buyerTitleCloserPhone",
] as const satisfies readonly (keyof ExtractedData)[];

function normTitleText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function titleSideDiffers(
  existing: TitleContactInfo,
  incoming: TitleContactInfo
): boolean {
  if (
    incoming.company.trim() &&
    normTitleText(incoming.company) !== normTitleText(existing.company)
  ) {
    return true;
  }
  if (incoming.name.trim() && normTitleText(incoming.name) !== normTitleText(existing.name)) {
    return true;
  }
  if (
    incoming.email.trim() &&
    normTitleText(incoming.email) !== normTitleText(existing.email)
  ) {
    return true;
  }
  return false;
}

function isKnownOurSideDefaultTitle(info: TitleContactInfo): boolean {
  const name = normTitleText(info.name);
  const company = normTitleText(info.company);
  const email = normTitleText(info.email);
  return (
    (name.includes("ingrid") && name.includes("bredeson")) ||
    company.includes("watermark") ||
    email.includes("wmtitle.com") ||
    (name.includes("lacey") && name.includes("rentz")) ||
    company.includes("all american title") ||
    email.includes("allamericantitleco.com")
  );
}

function applyTitleSideOverride(
  merged: ExtractedData,
  incoming: ExtractedData,
  side: "buyer" | "seller"
): ExtractedData {
  const keys = side === "buyer" ? BUYER_TITLE_KEYS : SELLER_TITLE_KEYS;
  const existingInfo = titleInfoForSide(merged, side);
  const incomingInfo = titleInfoForSide(incoming, side);
  if (!hasTitleContactInfo(incomingInfo)) return merged;
  if (!titleSideDiffers(existingInfo, incomingInfo)) return merged;

  const out = { ...merged };
  for (const key of keys) {
    const value = incoming[key];
    if (typeof value === "string" && value.trim()) {
      out[key] = value;
    }
  }
  return out;
}

/** When supplemental material names a different title closer, override seeded defaults. */
export function applySupplementalTitleOverride(
  existing: ExtractedData,
  incoming: ExtractedData,
  teamSteadySide: "buyer" | "seller" | null
): ExtractedData {
  let rerouted = { ...incoming };
  const otherSide: "buyer" | "seller" =
    teamSteadySide === "seller" ? "buyer" : "seller";

  // Model sometimes puts the other side's title into buyerTitle* on buyer-side deals.
  const incOurSide = titleInfoForSide(rerouted, teamSteadySide ?? "buyer");
  const exOurSide = titleInfoForSide(existing, teamSteadySide ?? "buyer");
  if (
    teamSteadySide === "buyer" &&
    hasTitleContactInfo(incOurSide) &&
    isKnownOurSideDefaultTitle(exOurSide) &&
    !isKnownOurSideDefaultTitle(incOurSide) &&
    titleSideDiffers(exOurSide, incOurSide) &&
    !hasTitleContactInfo(titleInfoForSide(rerouted, "seller"))
  ) {
    rerouted = {
      ...rerouted,
      sellerTitleCompany: rerouted.buyerTitleCompany,
      sellerTitleCloserName: rerouted.buyerTitleCloserName,
      sellerTitleCloserEmail: rerouted.buyerTitleCloserEmail,
      sellerTitleCloserPhone: rerouted.buyerTitleCloserPhone,
      buyerTitleCompany: null,
      buyerTitleCloserName: null,
      buyerTitleCloserEmail: null,
      buyerTitleCloserPhone: null,
    };
  }

  let merged = applyTitleSideOverride(existing, rerouted, "seller");
  merged = applyTitleSideOverride(merged, rerouted, "buyer");

  // Unlabeled single title block → other side when Team Steady side is known.
  if (
    teamSteadySide &&
    !hasTitleContactInfo(titleInfoForSide(rerouted, "seller")) &&
    !hasTitleContactInfo(titleInfoForSide(rerouted, "buyer")) &&
    incoming.titleCompany?.trim()
  ) {
    const legacy: TitleContactInfo = {
      company: incoming.titleCompany ?? "",
      name: incoming.sellerTitleCloserName ?? incoming.buyerTitleCloserName ?? "",
      email: incoming.sellerTitleCloserEmail ?? incoming.buyerTitleCloserEmail ?? "",
      phone: incoming.sellerTitleCloserPhone ?? incoming.buyerTitleCloserPhone ?? "",
    };
    if (hasTitleContactInfo(legacy)) {
      const side = otherSide;
      const keys = side === "buyer" ? BUYER_TITLE_KEYS : SELLER_TITLE_KEYS;
      merged = { ...merged };
      if (legacy.company) merged[keys[0]] = legacy.company;
      if (legacy.name) merged[keys[1]] = legacy.name;
      if (legacy.email) merged[keys[2]] = legacy.email;
      if (legacy.phone) merged[keys[3]] = legacy.phone;
    }
  }

  return merged;
}
