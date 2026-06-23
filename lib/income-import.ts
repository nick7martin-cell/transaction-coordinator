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

export function normalizeIncomeAddress(address: string): string {
  return address
    .trim()
    .replace(/,/g, "")
    .replace(STREET_SUFFIX, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function incomeDedupeKey(closeDate: string, address: string, amount?: number): string {
  const base = `${closeDate}|${normalizeIncomeAddress(address)}`;
  return amount != null ? `${base}|${amount.toFixed(2)}` : base;
}

export function manualIncomeRowId(closeDate: string, address: string): string {
  const slug = normalizeIncomeAddress(address)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 48);
  return `manual-${closeDate}-${slug}`;
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
    paid: paidKeys.has(entry.id),
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
      id: String(r.id ?? manualIncomeRowId(closeDate, address)),
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

    const dedupe = incomeDedupeKey(closeDate, address);
    if (seen.has(dedupe)) {
      skipped += 1;
      continue;
    }
    seen.add(dedupe);

    const id = manualIncomeRowId(closeDate, address);
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
      .map((r) => incomeDedupeKey(r.closeDate, r.address))
  );
}

export function filterManualAgainstTransactions(
  manual: ManualIncomeEntry[],
  transactionKeys: Set<string>
): { kept: ManualIncomeEntry[]; skipped: number } {
  let skipped = 0;
  const kept = manual.filter((entry) => {
    const key = incomeDedupeKey(entry.closeDate, entry.address);
    if (transactionKeys.has(key)) {
      skipped += 1;
      return false;
    }
    return true;
  });
  return { kept, skipped };
}
