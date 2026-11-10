import { AGENTS, findAgentIdByName, teamSteadyEmailFor } from "@/lib/agents";
import { applyCounterofferConcessionOverride } from "@/lib/counteroffer-concessions";
import type { ExtractedData } from "@/lib/types";

function enrichTeamSteadyAgentContacts(d: ExtractedData): ExtractedData {
  let buyerAgentEmail = d.buyerAgentEmail;
  let listingAgentEmail = d.listingAgentEmail;

  if (d.buyerAgentName && findAgentIdByName(d.buyerAgentName) && !buyerAgentEmail?.trim()) {
    buyerAgentEmail = teamSteadyEmailFor(d.buyerAgentName);
  }
  if (d.listingAgentName && findAgentIdByName(d.listingAgentName) && !listingAgentEmail?.trim()) {
    listingAgentEmail = teamSteadyEmailFor(d.listingAgentName);
  }

  if (buyerAgentEmail === d.buyerAgentEmail && listingAgentEmail === d.listingAgentEmail) {
    return d;
  }
  return { ...d, buyerAgentEmail, listingAgentEmail };
}

/** Errors that should not trigger review or show in the extraction notes banner. */
export function filterReviewNoiseErrors(d: ExtractedData): string[] {
  return d.errors.filter((err) => !isIgnorableReviewError(err, d));
}

/** @deprecated Use filterReviewNoiseErrors */
export function filterTeamSteadyAgentContactErrors(d: ExtractedData): string[] {
  return filterReviewNoiseErrors(d);
}

function isEarnestDueCalculationNote(lower: string): boolean {
  return (
    lower.includes("earnest") &&
    lower.includes("due") &&
    (lower.includes("calculated") ||
      lower.includes("business day") ||
      lower.includes("final acceptance") ||
      lower.includes("landing on"))
  );
}

function isPartyContactGapError(lower: string, party: "buyer" | "seller"): boolean {
  if (lower.includes("agent")) return false;
  if (!lower.includes(party)) return false;
  if (!(lower.includes("email") || lower.includes("phone"))) return false;
  return (
    lower.includes("not found") ||
    lower.includes("missing") ||
    (party === "buyer" && lower.includes("no buyer")) ||
    (party === "seller" && lower.includes("no seller"))
  );
}

function isUnknownSellerTitleError(lower: string): boolean {
  if (!lower.includes("title") || !lower.includes("seller")) return false;
  return (
    lower.includes("not identified") ||
    lower.includes("not found") ||
    lower.includes("unidentified") ||
    lower.includes("missing")
  );
}

function isIgnorableReviewError(err: string, d: ExtractedData): boolean {
  const lower = err.toLowerCase().trim();
  if (isTeamSteadyAgentContactError(err, d)) return true;
  if (isEarnestDueCalculationNote(lower)) return true;
  if (isPartyContactGapError(lower, "buyer")) return true;
  if (isPartyContactGapError(lower, "seller")) return true;
  if (isUnknownSellerTitleError(lower)) return true;
  return false;
}

/** Whether extraction still needs coordinator review after stripping noise. */
export function extractionNeedsReview(d: ExtractedData): boolean {
  const errors = filterReviewNoiseErrors(d);
  const hasCritical =
    !d.propertyAddress?.trim() ||
    d.purchasePrice == null ||
    errors.some((e) => e.toLowerCase().includes("missing critical"));

  if (errors.length === 0 && d.confidence >= 0.85 && !hasCritical) {
    return false;
  }
  return errors.length > 0 || d.confidence < 0.85 || hasCritical;
}

function isTeamSteadyAgentContactError(err: string, d: ExtractedData): boolean {
  const lower = err.toLowerCase();
  const contactGap =
    (lower.includes("email") || lower.includes("phone")) &&
    (lower.includes("not found") ||
      lower.includes("needs confirmation") ||
      lower.includes("missing"));

  if (!contactGap) return false;

  for (const name of [d.buyerAgentName, d.listingAgentName]) {
    if (!name?.trim() || !findAgentIdByName(name)) continue;
    const first = name.trim().split(/\s+/)[0]?.toLowerCase();
    const full = name.trim().toLowerCase();
    if (lower.includes(full) || (first && lower.includes(first))) return true;
  }

  for (const agent of AGENTS) {
    const first = agent.name.split(/\s+/)[0]?.toLowerCase();
    const full = agent.name.toLowerCase();
    if (
      (lower.includes(full) || (first && lower.includes(first))) &&
      lower.includes("agent") &&
      contactGap
    ) {
      return true;
    }
  }

  return false;
}

function refreshReviewFlag(d: ExtractedData): ExtractedData {
  const errors = filterReviewNoiseErrors(d);
  const flaggedForReview = extractionNeedsReview({ ...d, errors });

  if (errors === d.errors && flaggedForReview === d.flaggedForReview) return d;
  return { ...d, errors, flaggedForReview };
}

/** Normalize extraction after Claude or when loading from the database. */
export function applyExtractionPostProcess(d: ExtractedData): ExtractedData {
  return refreshReviewFlag(
    enrichTeamSteadyAgentContacts(applyCounterofferConcessionOverride(d))
  );
}
