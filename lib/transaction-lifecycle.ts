import { daysUntilClosing } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { PersistedTransactionStatus, Transaction } from "@/lib/types";

export function resolveStatus(
  transaction: Transaction
): PersistedTransactionStatus {
  const status = transaction.status;
  if (status === "closed" || status === "cancelled" || status === "active") {
    return status;
  }
  return "active";
}

export function isActiveTransaction(transaction: Transaction): boolean {
  return resolveStatus(transaction) === "active";
}

export function isAutoClosable(transaction: Transaction): boolean {
  if (resolveStatus(transaction) !== "active") return false;
  if (transaction.status_manual) return false;
  const days = daysUntilClosing(transaction.extracted_data.closingDate);
  return days != null && days < 0;
}

/** Persist auto-close for transactions whose closing date has passed. */
export async function applyAutoClose(
  transactions: Transaction[]
): Promise<Transaction[]> {
  const ids = transactions.filter(isAutoClosable).map((t) => t.id);
  if (ids.length === 0) return transactions;

  const { error } = await supabase
    .from("extractions")
    .update({ status: "closed" })
    .in("id", ids);

  if (error) {
    console.error("[auto-close] failed:", error.message);
    return transactions;
  }

  const closed = new Set(ids);
  return transactions.map((t) =>
    closed.has(t.id) ? { ...t, status: "closed" as const } : t
  );
}

export async function applyAutoCloseForId(
  transaction: Transaction
): Promise<Transaction> {
  const [updated] = await applyAutoClose([transaction]);
  return updated;
}

export const VALID_PERSISTED_STATUSES: PersistedTransactionStatus[] = [
  "active",
  "closed",
  "cancelled",
];

export function isPersistedStatus(value: unknown): value is PersistedTransactionStatus {
  return (
    typeof value === "string" &&
    VALID_PERSISTED_STATUSES.includes(value as PersistedTransactionStatus)
  );
}
