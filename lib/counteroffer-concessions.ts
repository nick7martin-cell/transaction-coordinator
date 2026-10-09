import type { ExtractedData } from "@/lib/types";

export function normalizeConcessionNumbers(
  d: Pick<
    ExtractedData,
    "sellerPaidBuyerConcessions" | "sellerPaidBuyerConcessionsPct"
  >
): Pick<
  ExtractedData,
  "sellerPaidBuyerConcessions" | "sellerPaidBuyerConcessionsPct"
> {
  let sellerPaidBuyerConcessions = d.sellerPaidBuyerConcessions;
  let sellerPaidBuyerConcessionsPct = d.sellerPaidBuyerConcessionsPct;
  if (sellerPaidBuyerConcessions != null && sellerPaidBuyerConcessions <= 0) {
    sellerPaidBuyerConcessions = null;
  }
  if (sellerPaidBuyerConcessionsPct != null && sellerPaidBuyerConcessionsPct <= 0) {
    sellerPaidBuyerConcessionsPct = null;
  }
  return { sellerPaidBuyerConcessions, sellerPaidBuyerConcessionsPct };
}

export function concessionsFieldsEqual(
  a: Pick<
    ExtractedData,
    "sellerPaidBuyerConcessions" | "sellerPaidBuyerConcessionsPct"
  >,
  b: Pick<
    ExtractedData,
    "sellerPaidBuyerConcessions" | "sellerPaidBuyerConcessionsPct"
  >
): boolean {
  return (
    a.sellerPaidBuyerConcessions === b.sellerPaidBuyerConcessions &&
    a.sellerPaidBuyerConcessionsPct === b.sellerPaidBuyerConcessionsPct
  );
}

/** When review notes say a counteroffer zeroed line 159 but JSON still has PA dollars. */
export function applyCounterofferConcessionOverride(d: ExtractedData): ExtractedData {
  const normalized = normalizeConcessionNumbers(d);
  let next = normalized.sellerPaidBuyerConcessions === d.sellerPaidBuyerConcessions &&
    normalized.sellerPaidBuyerConcessionsPct === d.sellerPaidBuyerConcessionsPct
    ? d
    : { ...d, ...normalized };

  const combined = next.errors.join(" ").toLowerCase();
  const mentionsCounteroffer =
    combined.includes("counteroffer") || combined.includes("counter offer");
  if (!mentionsCounteroffer) return next;

  const aboutConcessions =
    combined.includes("line 159") ||
    combined.includes("buyer closing cost") ||
    combined.includes("buyer concessions") ||
    combined.includes("seller pays buyer") ||
    combined.includes("seller contribution") ||
    combined.includes("seller paid");

  const counterofferZero =
    aboutConcessions &&
    (/\$0(\.00)?/.test(combined) ||
      combined.includes("not to exceed $0") ||
      combined.includes("at 0%") ||
      (combined.includes("override") && combined.includes("$0")));

  const paStillHasAmount =
    next.sellerPaidBuyerConcessions != null && next.sellerPaidBuyerConcessions > 0;

  if (counterofferZero && paStillHasAmount) {
    return {
      ...next,
      sellerPaidBuyerConcessions: null,
      sellerPaidBuyerConcessionsPct: null,
    };
  }

  return next;
}
