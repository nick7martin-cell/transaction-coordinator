import { daysUntilClosing } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { PersistedTransactionStatus, Transaction } from "@/lib/types";

const LIFECYCLE_JSON_KEY = "_lifecycle";

export interface LifecycleMeta {
  status: PersistedTransactionStatus;
  status_manual: boolean;
}

export function lifecycleFromExtracted(
  extracted: unknown
): LifecycleMeta | null {
  const lc = (extracted as Record<string, unknown> | null)?.[LIFECYCLE_JSON_KEY];
  if (!lc || typeof lc !== "object") return null;
  const status = (lc as Record<string, unknown>).status;
  const status_manual = (lc as Record<string, unknown>).status_manual;
  if (isPersistedStatus(status)) {
    return { status, status_manual: Boolean(status_manual) };
  }
  return null;
}

export function withLifecycleInExtracted(
  extracted: Record<string, unknown>,
  status: PersistedTransactionStatus,
  statusManual: boolean
): Record<string, unknown> {
  return {
    ...extracted,
    [LIFECYCLE_JSON_KEY]: { status, status_manual: statusManual },
  };
}

export function preserveLifecycleInExtracted(
  merged: Record<string, unknown>,
  existing: unknown
): Record<string, unknown> {
  const lifecycle = (existing as Record<string, unknown> | null)?.[LIFECYCLE_JSON_KEY];
  if (!lifecycle) return merged;
  return { ...merged, [LIFECYCLE_JSON_KEY]: lifecycle };
}

/** Merge DB columns + JSONB fallback into a consistent Transaction shape. */
export function normalizeTransactionRow(row: Record<string, unknown>): Transaction {
  const t = row as unknown as Transaction;
  const fromJson = lifecycleFromExtracted(t.extracted_data);
  if (!fromJson) return t;
  return {
    ...t,
    status: t.status ?? fromJson.status,
    status_manual: t.status_manual ?? fromJson.status_manual,
  };
}

export function isMissingStatusColumnError(
  error: { code?: string; message?: string } | null
): boolean {
  return (
    error?.code === "PGRST204" &&
    typeof error.message === "string" &&
    error.message.includes("'status'")
  );
}

export function stripStatusColumnsFromUpdates(
  updates: Record<string, unknown>
): Record<string, unknown> {
  const { status: _s, status_manual: _m, ...rest } = updates;
  void _s;
  void _m;
  return rest;
}

export function resolveStatus(
  transaction: Transaction
): PersistedTransactionStatus {
  const status = transaction.status;
  if (status === "closed" || status === "cancelled" || status === "active") {
    return status;
  }
  const fromJson = lifecycleFromExtracted(transaction.extracted_data);
  if (fromJson) return fromJson.status;
  return "active";
}

export function isStatusManual(transaction: Transaction): boolean {
  if (transaction.status_manual) return true;
  return Boolean(lifecycleFromExtracted(transaction.extracted_data)?.status_manual);
}

export function isActiveTransaction(transaction: Transaction): boolean {
  return resolveStatus(transaction) === "active";
}

export function isAutoClosable(transaction: Transaction): boolean {
  if (resolveStatus(transaction) !== "active") return false;
  if (isStatusManual(transaction)) return false;
  const days = daysUntilClosing(transaction.extracted_data.closingDate);
  return days != null && days < 0;
}

async function persistLifecycleStatus(
  id: string,
  existingExtracted: unknown,
  status: PersistedTransactionStatus,
  statusManual: boolean
): Promise<{ ok: boolean; error?: string }> {
  const extracted = withLifecycleInExtracted(
    (existingExtracted ?? {}) as Record<string, unknown>,
    status,
    statusManual
  );

  const withColumns = {
    status,
    status_manual: statusManual,
    extracted_data: extracted,
  };

  let { error } = await supabase
    .from("extractions")
    .update(withColumns)
    .eq("id", id);

  if (isMissingStatusColumnError(error)) {
    ({ error } = await supabase
      .from("extractions")
      .update({ extracted_data: extracted })
      .eq("id", id));
  }

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Persist auto-close for transactions whose closing date has passed. */
export async function applyAutoClose(
  transactions: Transaction[]
): Promise<Transaction[]> {
  const closable = transactions.filter(isAutoClosable);
  if (closable.length === 0) return transactions;

  const closed = new Set<string>();
  for (const t of closable) {
    const result = await persistLifecycleStatus(
      t.id,
      t.extracted_data,
      "closed",
      false
    );
    if (result.ok) closed.add(t.id);
    else console.error("[auto-close] failed:", t.id, result.error);
  }

  if (closed.size === 0) return transactions;

  return transactions.map((t) => {
    if (!closed.has(t.id)) return t;
    const extracted = withLifecycleInExtracted(
      (t.extracted_data ?? {}) as unknown as Record<string, unknown>,
      "closed",
      false
    );
    return normalizeTransactionRow({
      ...t,
      extracted_data: extracted,
      status: "closed",
      status_manual: false,
    });
  });
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

export function isPersistedStatus(
  value: unknown
): value is PersistedTransactionStatus {
  return (
    typeof value === "string" &&
    VALID_PERSISTED_STATUSES.includes(value as PersistedTransactionStatus)
  );
}
