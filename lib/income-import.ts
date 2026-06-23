import type { IncomeRow } from "@/lib/income-tracker";
import { NICK_AGENT_ID } from "@/lib/income-tracker";

export interface ManualIncomeEntry {
  id: string;
  closeDate: string;
  address: string;
  amount: number;
  agentLabel: string;
  isNickDeal: boolean;
  year: number;
  importedAt: string;
}

export interface ImportedIncomeRow {
  closeDate: string;
  address: string;
  amount: number;
  agentLabel: string;
  isNickDeal?: boolean;
  paid?: boolean;
}

const STREET_SUFFIX =
  /\s+(?:Circle|Cir\.?|Court|Ct\.?|Drive|Dr\.?|Lane|Ln\.?|Road|Rd\.?|Street|St\.?|Trail|Trl\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Place|Pl\.?|Way|Terrace|Ter\.?|Path|Pkwy|Parkway|Boulevard)\.?$/i;

const UNIT_SUFFIX =
  /\s*(?:#|unit|apt|apartment|suite|ste\.?|bldg|building)\s*[\w-]+.*$/i;

const TRAILING_DIRECTIONAL =
  /\s+(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\.?$/i;

const SUFFIX_TOKENS =
  /\b(?:circle|cir|court|ct|drive|dr|lane|ln|road|rd|street|st|trail|trl|avenue|ave|boulevard|blvd|place|pl|way|terrace|ter|path|pkwy|parkway)\b/gi;

export function normalizeIncomeAddress(address: string): string {
  let s = address.trim().replace(/,/g, " ");
  s = s.replace(UNIT_SUFFIX, "");
  s = s.replace(TRAILING_DIRECTIONAL, "");
  s = s.replace(STREET_SUFFIX, "");
  s = s.replace(SUFFIX_TOKENS, "");
  return s
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function agentSideKey(agentLabel: string): string {
  const lower = agentLabel.toLowerCase();
  if (lower.includes("listing")) return "listing";
  if (lower.includes("buy side") || lower.includes("buy-side")) return "buy";
  if (lower.includes("dual")) return "dual";
  return lower.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "deal";
}

export function incomeDedupeKey(
  closeDate: string,
  address: string,
  agentLabel?: string
): string {
  const side = agentLabel ? agentSideKey(agentLabel) : "";
  return `${closeDate}|${normalizeIncomeAddress(address)}|${side}`;
}

export function manualIncomeRowId(
  closeDate: string,
  address: string,
  agentLabel: string
): string {
  const slug = normalizeIncomeAddress(address)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return `manual-${closeDate}-${slug}-${agentSideKey(agentLabel)}`;
}

export function buildManualIncomeRow(
  entry: ManualIncomeEntry,
  paidKeys: Set<string>
): IncomeRow {
  const close = new Date(entry.closeDate + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  return {
    id: entry.id,
    transactionId: null,
    closeDate: entry.closeDate,
    address: entry.address,
    amount: entry.amount,
    agentLabel: entry.agentLabel,
    paid: paidKeys.has(entry.id) || entry.amount === 0,
    isBasePay: false,
    isNickDeal: entry.isNickDeal,
    status: close.getTime() <= today.getTime() ? "closed" : "active",
    monthKey: entry.closeDate.slice(0, 7),
  };
}

export function coerceManualEntries(raw: unknown): ManualIncomeEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ManualIncomeEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const closeDate = String(r.closeDate ?? "").trim();
    const address = String(r.address ?? "").trim();
    const amount = Number(r.amount);
    const agentLabel = String(r.agentLabel ?? "").trim();
    if (!closeDate || !address || !Number.isFinite(amount) || !agentLabel) continue;

    const year = parseInt(closeDate.slice(0, 4), 10);
    if (!Number.isFinite(year)) continue;

    out.push({
      id: String(r.id ?? manualIncomeRowId(closeDate, address, agentLabel)),
      closeDate,
      address,
      amount,
      agentLabel,
      isNickDeal:
        r.isNickDeal === true ||
        agentLabel.toLowerCase().includes("nick") ||
        agentLabel.includes(NICK_AGENT_ID),
      year,
      importedAt: String(r.importedAt ?? new Date().toISOString()),
    });
  }
  return out;
}

export function importedRowsToManualEntries(
  rows: ImportedIncomeRow[],
  existingIds: Set<string>
): { entries: ManualIncomeEntry[]; paidIds: string[]; skipped: number } {
  const entries: ManualIncomeEntry[] = [];
  const paidIds: string[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const row of rows) {
    const closeDate = row.closeDate.trim();
    const address = row.address.trim();
    const amount = row.amount;
    const agentLabel = row.agentLabel.trim();
    if (!closeDate || !address || !Number.isFinite(amount) || !agentLabel) {
      skipped += 1;
      continue;
    }

    const dedupe = incomeDedupeKey(closeDate, address, agentLabel);
    if (seen.has(dedupe)) {
      skipped += 1;
      continue;
    }
    seen.add(dedupe);

    const id = manualIncomeRowId(closeDate, address, agentLabel);
    if (existingIds.has(id)) {
      skipped += 1;
      continue;
    }

    const isNickDeal =
      row.isNickDeal === true || /nick/i.test(agentLabel);

    entries.push({
      id,
      closeDate,
      address,
      amount,
      agentLabel: agentLabel.replace(/Nick-\s*/i, "Nick - "),
      isNickDeal,
      year: parseInt(closeDate.slice(0, 4), 10),
      importedAt: new Date().toISOString(),
    });

    if (row.paid) paidIds.push(id);
  }

  return { entries, paidIds, skipped };
}

export function transactionDedupeKeys(rows: IncomeRow[]): Set<string> {
  return new Set(
    rows
      .filter((r) => !r.isBasePay && r.transactionId)
      .map((r) => incomeDedupeKey(r.closeDate, r.address, r.agentLabel))
  );
}

export function filterManualAgainstTransactions(
  manual: ManualIncomeEntry[],
  transactionKeys: Set<string>
): { kept: ManualIncomeEntry[]; skipped: number } {
  let skipped = 0;
  const kept = manual.filter((entry) => {
    const key = incomeDedupeKey(entry.closeDate, entry.address, entry.agentLabel);
    if (transactionKeys.has(key)) {
      skipped += 1;
      return false;
    }
    return true;
  });
  return { kept, skipped };
}

/** Collapse duplicate deal rows (Handled + sheet import) — prefer live transaction. */
export function dedupeDealRows(rows: IncomeRow[]): IncomeRow[] {
  const map = new Map<string, IncomeRow>();
  for (const row of rows) {
    if (row.isBasePay) continue;
    const key = incomeDedupeKey(row.closeDate, row.address, row.agentLabel);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    if (!existing.transactionId && row.transactionId) {
      map.set(key, row);
    }
  }
  const deduped = [...map.values()];
  const baseRows = rows.filter((r) => r.isBasePay);
  return [...baseRows, ...deduped];
}
