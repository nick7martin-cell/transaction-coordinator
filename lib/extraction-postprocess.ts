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

/** Drop review noise when Handled already knows Team Steady agent contact info. */
export function filterTeamSteadyAgentContactErrors(d: ExtractedData): string[] {
  return d.errors.filter((err) => !isTeamSteadyAgentContactError(err, d));
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
  const errors = filterTeamSteadyAgentContactErrors(d);
  const hasCritical =
    !d.propertyAddress?.trim() ||
    d.purchasePrice == null ||
    errors.some((e) => e.toLowerCase().includes("missing critical"));

  let flaggedForReview = d.flaggedForReview;
  if (errors.length === 0 && d.confidence >= 0.85 && !hasCritical) {
    flaggedForReview = false;
  } else if (errors.length > 0 || d.confidence < 0.85 || hasCritical) {
    flaggedForReview = true;
  }

  if (errors === d.errors && flaggedForReview === d.flaggedForReview) return d;
  return { ...d, errors, flaggedForReview };
}

/** Normalize extraction after Claude or when loading from the database. */
export function applyExtractionPostProcess(d: ExtractedData): ExtractedData {
  return refreshReviewFlag(
    enrichTeamSteadyAgentContacts(applyCounterofferConcessionOverride(d))
  );
}
