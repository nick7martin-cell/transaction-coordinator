import type { CommissionResult } from "@/lib/commission";
import { formatMoney } from "@/lib/commission";
import type { ExtractedData, FinancingType } from "@/lib/types";

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
    if (!(k in (existing ?? {})) && !(k in merged)) {
      result[k] = v;
    }
  }
  return result;
}

/** Map extracted PA concessions (line 159) onto closing worksheet keys. */
export function concessionsWorksheetFields(
  extracted: Pick<
    ExtractedData,
    "sellerPaidBuyerConcessions" | "sellerPaidBuyerConcessionsPct"
  >
): Record<string, string> {
  const out: Record<string, string> = {};
  if (
    extracted.sellerPaidBuyerConcessions != null &&
    extracted.sellerPaidBuyerConcessions > 0
  ) {
    out.concessionsDollars = formatMoney(extracted.sellerPaidBuyerConcessions);
  }
  if (
    extracted.sellerPaidBuyerConcessionsPct != null &&
    extracted.sellerPaidBuyerConcessionsPct > 0
  ) {
    out.concessionsPct = String(extracted.sellerPaidBuyerConcessionsPct);
  }
  return out;
}

/** Fill blank worksheet concession fields from extraction (re-extract / backfill). */
export function mergeConcessionsIntoWorksheet(
  existingWs: Record<string, unknown>,
  extracted: Pick<
    ExtractedData,
    "sellerPaidBuyerConcessions" | "sellerPaidBuyerConcessionsPct"
  >
): Record<string, unknown> {
  const ws = { ...existingWs };
  const fromExtraction = concessionsWorksheetFields(extracted);

  for (const [key, value] of Object.entries(fromExtraction)) {
    const current = ws[key];
    if (
      current === undefined ||
      current === null ||
      current === "" ||
      current === "0" ||
      current === "0.00"
    ) {
      ws[key] = value;
    }
  }

  return ws;
}
