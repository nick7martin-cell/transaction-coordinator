import { findAgentIdByName } from "@/lib/agents";
import type { CommissionResult } from "@/lib/commission";
import {
  detectDualAgency,
  type ExtractedData,
  type TransactionParty,
} from "@/lib/types";

/** True when commission JSONB has a real saved calculation, not the empty `{}` placeholder. */
export function hasSavedCommission(
  c: CommissionResult | null | undefined
): boolean {
  if (!c || typeof c !== "object") return false;
  if (c.side !== "buyer" && c.side !== "seller" && c.side !== "dual") return false;
  if (c.side === "dual") return true;
  return !!(c.buyer ?? c.seller);
}

export type CommissionSide = "buyer" | "seller" | "dual";

export interface CommissionAutofill {
  side: CommissionSide;
  /** Which side's agent dropdown to populate (not set for dual). */
  agentSide?: "buyer" | "seller";
  /** Buyer-side (or shared dual-agency) agent ID. */
  agentId?: string;
  /** Seller-side agent ID — only set for dual when the two sides have different TS agents. */
  sellerAgentId?: string;
  /** Buyer broker commission % from the PA. */
  commissionPct?: number;
  shouldCalculate: boolean;
}

function teamSteadyAgentIdFromParty(party: TransactionParty | undefined): string | null {
  if (!party?.name?.trim()) return null;
  return findAgentIdByName(party.name);
}

/**
 * Infer commission calculator defaults from saved transaction contacts and PA
 * extraction. Returns null when side/agent cannot be determined.
 */
export function resolveCommissionAutofill(
  parties: TransactionParty[],
  extracted: ExtractedData
): CommissionAutofill | null {
  const buyerAgentParty = parties.find((p) => p.role === "buyer_agent");
  const listingAgentParty = parties.find((p) => p.role === "listing_agent");

  const buyerTsId = teamSteadyAgentIdFromParty(buyerAgentParty);
  const listingTsId = teamSteadyAgentIdFromParty(listingAgentParty);

  const dualFromExtraction = detectDualAgency(extracted);
  const bothSidesTeamSteady = !!buyerTsId && !!listingTsId;

  if (dualFromExtraction || bothSidesTeamSteady) {
    const primaryId = buyerTsId ?? listingTsId ?? undefined;
    // When two different TS agents are on opposite sides, track them separately.
    const secondaryId =
      bothSidesTeamSteady && listingTsId !== buyerTsId ? (listingTsId ?? undefined) : undefined;
    return {
      side: "dual",
      agentId: primaryId,
      sellerAgentId: secondaryId,
      commissionPct: extracted.buyerBrokerCommissionPct ?? undefined,
      shouldCalculate: false,
    };
  }

  if (buyerTsId) {
    const pct = extracted.buyerBrokerCommissionPct;
    return {
      side: "buyer",
      agentSide: "buyer",
      agentId: buyerTsId,
      commissionPct: pct ?? undefined,
      shouldCalculate: pct != null && pct > 0,
    };
  }

  if (listingTsId) {
    return {
      side: "seller",
      agentSide: "seller",
      agentId: listingTsId,
      shouldCalculate: false,
    };
  }

  // Fall back to PA-extracted agent names when roster roles aren't confirmed yet.
  const extractedBuyerTsId = findAgentIdByName(extracted.buyerAgentName);
  const extractedListingTsId = findAgentIdByName(extracted.listingAgentName);

  if (extractedBuyerTsId && extractedListingTsId) {
    const secondaryId =
      extractedListingTsId !== extractedBuyerTsId ? extractedListingTsId : undefined;
    return {
      side: "dual",
      agentId: extractedBuyerTsId,
      sellerAgentId: secondaryId,
      commissionPct: extracted.buyerBrokerCommissionPct ?? undefined,
      shouldCalculate: false,
    };
  }

  if (extractedBuyerTsId) {
    const pct = extracted.buyerBrokerCommissionPct;
    return {
      side: "buyer",
      agentSide: "buyer",
      agentId: extractedBuyerTsId,
      commissionPct: pct ?? undefined,
      shouldCalculate: pct != null && pct > 0,
    };
  }

  if (extractedListingTsId) {
    return {
      side: "seller",
      agentSide: "seller",
      agentId: extractedListingTsId,
      shouldCalculate: false,
    };
  }

  return null;
}
