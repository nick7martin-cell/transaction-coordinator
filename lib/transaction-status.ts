import { daysUntilClosing } from "@/lib/format";
import {
  isEffectiveActive,
  isEffectiveClosed,
  resolveStatus,
} from "@/lib/transaction-lifecycle";
import type { Transaction } from "@/lib/types";

export type TransactionStatus =
  | "active"
  | "needs_review"
  | "closing_soon"
  | "on_hold"
  | "closed"
  | "cancelled";

export function getTransactionStatus(
  transaction: Transaction
): TransactionStatus {
  const persisted = resolveStatus(transaction);
  if (persisted === "cancelled") return "cancelled";
  if (persisted === "closed" || isEffectiveClosed(transaction)) return "closed";
  if (transaction.flagged_for_review) return "needs_review";

  const days = daysUntilClosing(transaction.extracted_data.closingDate);
  if (days != null && days <= 10 && days >= 0) return "closing_soon";
  return "active";
}

/** Semantic tone for each status — restricted to the calm green/gold/neutral palette. */
export type StatusTone = "good" | "warn" | "neutral";

export const statusConfig: Record<
  TransactionStatus,
  { label: string; tone: StatusTone }
> = {
  active:       { label: "Active",       tone: "good" },
  needs_review: { label: "Needs Review", tone: "warn" },
  closing_soon: { label: "Closing Soon", tone: "warn" },
  on_hold:      { label: "On Hold",      tone: "neutral" },
  closed:       { label: "Closed",       tone: "neutral" },
  cancelled:    { label: "Cancelled",    tone: "neutral" },
};

export type TransactionFilter =
  | "all"
  | "needs_review"
  | "closed"
  | "cancelled";

export function matchesFilter(
  transaction: Transaction,
  filter: TransactionFilter
): boolean {
  const persisted = resolveStatus(transaction);

  switch (filter) {
    case "all":
      return isEffectiveActive(transaction);
    case "needs_review":
      return isEffectiveActive(transaction) && transaction.flagged_for_review;
    case "closed":
      return isEffectiveClosed(transaction);
    case "cancelled":
      return persisted === "cancelled";
    default:
      return true;
  }
}
