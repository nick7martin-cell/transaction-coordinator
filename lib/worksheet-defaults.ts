import type { CommissionResult } from "@/lib/commission";
import type { FinancingType } from "@/lib/types";

/** Default values seeded into worksheet JSONB when a transaction is first saved. */
export const WORKSHEET_FIELD_DEFAULTS: Record<string, string> = {
  propertyType: "Single Family",
  concessionsDollars: "0.00",
};

export const COMMISSION_CHECKBOX_KEYS = [
  "listingBrokerCheck",
  "buyerBrokerCheck",
  "brokerCoopCheck",
  "buyerPayingCheck",
] as const;

export type CommissionCheckboxKey = (typeof COMMISSION_CHECKBOX_KEYS)[number];

const ALL_COMMISSION_CHECKS_FALSE = Object.fromEntries(
  COMMISSION_CHECKBOX_KEYS.map((k) => [k, "false"])
) as Record<CommissionCheckboxKey, string>;

/**
 * Default commission-line checkboxes from saved commission side + financing type.
 *
 * @param extractedBuyerBrokerPct - The buyer broker commission % extracted from
 *   line 406 of the PA. Only relevant when side === "seller": if present and
 *   non-zero, the "Seller Paying BUYER Broker Compensation" line is checked.
 */
export function defaultCommissionCheckboxValues(
  commission: CommissionResult | null | undefined,
  financingType: FinancingType | null | undefined,
  extractedBuyerBrokerPct?: number | null
): Record<CommissionCheckboxKey, string> {
  const side = commission?.side;
  if (!side) return { ...ALL_COMMISSION_CHECKS_FALSE };

  const isCash = financingType === "cash";

  if (isCash && (side === "buyer" || side === "dual")) {
    return { ...ALL_COMMISSION_CHECKS_FALSE, buyerPayingCheck: "true" };
  }

  if (side === "buyer") {
    return { ...ALL_COMMISSION_CHECKS_FALSE, buyerBrokerCheck: "true" };
  }

  if (side === "seller") {
    // Only check the buyer broker line when line 406 of the PA was actually
    // extracted with a non-zero value. Otherwise leave all buyer lines blank.
    const hasBuyerBrokerPct = extractedBuyerBrokerPct != null && extractedBuyerBrokerPct > 0;
    return {
      ...ALL_COMMISSION_CHECKS_FALSE,
      listingBrokerCheck: "true",
      ...(hasBuyerBrokerPct && { buyerBrokerCheck: "true" }),
    };
  }

  return {
    ...ALL_COMMISSION_CHECKS_FALSE,
    listingBrokerCheck: "true",
    buyerBrokerCheck: "true",
  };
}

/** Fill default worksheet fields only when the key was never persisted before. */
export function applyWorksheetDefaults(
  existing: Record<string, unknown> | null | undefined,
  merged: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...merged };
  for (const [k, v] of Object.entries(WORKSHEET_FIELD_DEFAULTS)) {
    if (!(k in (existing ?? {}))) {
      result[k] = v;
    }
  }
  return result;
}
