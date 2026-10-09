import type { CommissionResult } from "@/lib/commission";
import { formatMoney } from "@/lib/commission";
import type { ExtractedData, FinancingType } from "@/lib/types";

function hasConcessionsPct(
  ...sources: Array<Record<string, unknown> | null | undefined>
): boolean {
  for (const source of sources) {
    const pct = source?.concessionsPct;
    if (pct != null && pct !== "" && pct !== "0") return true;
  }
  return false;
}

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
/** MN PA line 406 — seller pays buyer broker compensation (not buyer-paying row). */
export function hasPaLine406BuyerBrokerPct(
  extractedBuyerBrokerPct?: number | null
): boolean {
  return extractedBuyerBrokerPct != null && extractedBuyerBrokerPct > 0;
}

export function defaultCommissionCheckboxValues(
  commission: CommissionResult | null | undefined,
  financingType: FinancingType | null | undefined,
  extractedBuyerBrokerPct?: number | null
): Record<CommissionCheckboxKey, string> {
  const side = commission?.side;
  if (!side) return { ...ALL_COMMISSION_CHECKS_FALSE };

  const out = { ...ALL_COMMISSION_CHECKS_FALSE };
  const hasLine406 = hasPaLine406BuyerBrokerPct(extractedBuyerBrokerPct);
  const isCash = financingType === "cash";

  if (side === "seller" || side === "dual") {
    out.listingBrokerCheck = "true";
  }

  // Line 406 always → "Seller Paying BUYER Broker Compensation" (never buyer-paying).
  if (hasLine406) {
    out.buyerBrokerCheck = "true";
    return out;
  }

  if (isCash && (side === "buyer" || side === "dual")) {
    out.buyerPayingCheck = "true";
    return out;
  }

  if (side === "buyer") {
    out.buyerBrokerCheck = "true";
    return out;
  }

  if (side === "dual") {
    out.buyerBrokerCheck = "true";
    return out;
  }

  return out;
}

/** Fill default worksheet fields only when the key was never persisted before. */
export function applyWorksheetDefaults(
  existing: Record<string, unknown> | null | undefined,
  merged: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...merged };
  for (const [k, v] of Object.entries(WORKSHEET_FIELD_DEFAULTS)) {
    if (
      k === "concessionsDollars" &&
      hasConcessionsPct(merged, existing)
    ) {
      continue;
    }
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

  if (
    fromExtraction.concessionsPct &&
    !fromExtraction.concessionsDollars &&
    (ws.concessionsDollars === "0.00" ||
      ws.concessionsDollars === "0" ||
      ws.concessionsDollars === "")
  ) {
    delete ws.concessionsDollars;
  }

  return ws;
}

/** Overwrite CW line 159 fields from extracted data (Handled financials edit). */
export function worksheetConcessionsOverwrite(
  extracted: Pick<
    ExtractedData,
    "sellerPaidBuyerConcessions" | "sellerPaidBuyerConcessionsPct"
  >
): Record<string, string> {
  const hasPct =
    extracted.sellerPaidBuyerConcessionsPct != null &&
    extracted.sellerPaidBuyerConcessionsPct > 0;
  const hasDollars =
    extracted.sellerPaidBuyerConcessions != null &&
    extracted.sellerPaidBuyerConcessions > 0;

  if (hasPct) {
    return {
      concessionsPct: String(extracted.sellerPaidBuyerConcessionsPct),
      concessionsDollars: WORKSHEET_FIELD_DEFAULTS.concessionsDollars,
    };
  }
  if (hasDollars) {
    return {
      concessionsDollars: formatMoney(extracted.sellerPaidBuyerConcessions!),
      concessionsPct: "0",
    };
  }
  return {
    concessionsDollars: WORKSHEET_FIELD_DEFAULTS.concessionsDollars,
    concessionsPct: "0",
  };
}

function parseWorksheetMoney(value: unknown): number | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str || str === "0" || str === "0.00") return null;
  const cleaned = str.replace(/[$,\s]/g, "");
  if (!cleaned || cleaned === "0") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseWorksheetPct(value: unknown): number | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str || str === "0") return null;
  const n = Number(str.replace(/[%\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return n;
}

/** Map CW line 159 fields back onto extracted PA concessions. */
export function worksheetToExtractedConcessions(
  ws: Record<string, unknown>
): Pick<
  ExtractedData,
  "sellerPaidBuyerConcessions" | "sellerPaidBuyerConcessionsPct"
> {
  const pct = parseWorksheetPct(ws.concessionsPct);
  if (pct != null) {
    return {
      sellerPaidBuyerConcessions: null,
      sellerPaidBuyerConcessionsPct: pct,
    };
  }
  const dollars = parseWorksheetMoney(ws.concessionsDollars);
  if (dollars != null) {
    return {
      sellerPaidBuyerConcessions: dollars,
      sellerPaidBuyerConcessionsPct: null,
    };
  }
  return {
    sellerPaidBuyerConcessions: null,
    sellerPaidBuyerConcessionsPct: null,
  };
}
