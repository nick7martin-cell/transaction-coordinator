import {
  importedRowsToManualEntries,
  type ManualIncomeEntry,
} from "@/lib/income-import";
import seedRows2026 from "@/lib/data/income-2026-raw.json";
import { supabase } from "@/lib/supabase";

export const TRACKER_ID = "default";
const CLOSE_DATE_PREFIX = "@closeDate:";

const SEED_2026: ManualIncomeEntry[] = importedRowsToManualEntries(
  seedRows2026,
  new Set()
).entries;

export type PaidKeysState = {
  keys: Set<string>;
  /** False when Supabase denied access — rows still load, toggles won't persist. */
  writable: boolean;
};

export type IncomeTrackerState = PaidKeysState & {
  closeDateOverrides: Record<string, string>;
};

function seedRowForEntry(entry: ManualIncomeEntry) {
  return seedRows2026.find(
    (r) =>
      r.closeDate === entry.closeDate &&
      r.address === entry.address &&
      r.agentLabel === entry.agentLabel
  );
}

function shouldSeedPaid(entry: ManualIncomeEntry, seedRow: (typeof seedRows2026)[number] | undefined): boolean {
  if (!seedRow) return entry.amount === 0;
  return seedRow.paid === true || seedRow.amount === 0;
}

function defaultPaidKeysFromSeed(): Set<string> {
  const keys = new Set<string>();
  for (const entry of SEED_2026) {
    const seedRow = seedRowForEntry(entry);
    if (shouldSeedPaid(entry, seedRow)) keys.add(entry.id);
  }
  return keys;
}

function isIncomeTrackerAccessError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("permission denied") ||
    lower.includes("income_tracker") ||
    lower.includes("does not exist") ||
    lower.includes("schema cache")
  );
}

/** Manual deal rows sourced from the Google Sheet import (by year). */
export function manualEntriesForYear(year: number): ManualIncomeEntry[] {
  if (year === 2026) return SEED_2026;
  return [];
}

function coerceCloseDateOverrides(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      out[key] = value;
    }
  }
  return out;
}

/** Split paid flags and close-date overrides stored in the paid_keys JSON array. */
export function parseIncomeTrackerPaidKeys(raw: unknown): {
  paidKeys: Set<string>;
  closeDateOverrides: Record<string, string>;
} {
  const paidKeys = new Set<string>();
  const closeDateOverrides: Record<string, string> = {};
  if (!Array.isArray(raw)) return { paidKeys, closeDateOverrides };

  for (const item of raw) {
    const s = String(item);
    if (s.startsWith(CLOSE_DATE_PREFIX)) {
      const payload = s.slice(CLOSE_DATE_PREFIX.length);
      const eq = payload.indexOf("=");
      if (eq <= 0) continue;
      const id = payload.slice(0, eq);
      const date = payload.slice(eq + 1);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) closeDateOverrides[id] = date;
    } else {
      paidKeys.add(s);
    }
  }

  return { paidKeys, closeDateOverrides };
}

export function serializeIncomeTrackerPaidKeys(
  paidKeys: Set<string>,
  closeDateOverrides: Record<string, string>
): string[] {
  const out = [...paidKeys];
  for (const [id, date] of Object.entries(closeDateOverrides)) {
    out.push(`${CLOSE_DATE_PREFIX}${id}=${date}`);
  }
  return out;
}

export async function loadIncomeTrackerState(): Promise<IncomeTrackerState> {
  let data: Record<string, unknown> | null = null;
  let errorMessage: string | null = null;

  const full = await supabase
    .from("income_tracker")
    .select("paid_keys, close_date_overrides")
    .eq("id", TRACKER_ID)
    .maybeSingle();

  if (full.error?.message.includes("close_date_overrides")) {
    const paidOnly = await supabase
      .from("income_tracker")
      .select("paid_keys")
      .eq("id", TRACKER_ID)
      .maybeSingle();
    data = paidOnly.data as Record<string, unknown> | null;
    errorMessage = paidOnly.error?.message ?? null;
  } else {
    data = full.data as Record<string, unknown> | null;
    errorMessage = full.error?.message ?? null;
  }

  if (errorMessage) {
    if (isIncomeTrackerAccessError(errorMessage)) {
      return {
        keys: defaultPaidKeysFromSeed(),
        closeDateOverrides: {},
        writable: false,
      };
    }
    throw new Error(errorMessage);
  }

  const parsed = parseIncomeTrackerPaidKeys(data?.paid_keys);
  const columnOverrides = coerceCloseDateOverrides(data?.close_date_overrides);

  return {
    keys: parsed.paidKeys,
    closeDateOverrides: { ...parsed.closeDateOverrides, ...columnOverrides },
    writable: true,
  };
}

export async function loadPaidKeys(): Promise<PaidKeysState> {
  const state = await loadIncomeTrackerState();
  return { keys: state.keys, writable: state.writable };
}

export async function saveIncomeTrackerState(state: IncomeTrackerState): Promise<void> {
  const paid_keys = serializeIncomeTrackerPaidKeys(state.keys, state.closeDateOverrides);
  const payload: Record<string, unknown> = {
    id: TRACKER_ID,
    paid_keys,
    close_date_overrides: state.closeDateOverrides,
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabase.from("income_tracker").upsert(payload, { onConflict: "id" });

  if (error?.message.includes("close_date_overrides")) {
    ({ error } = await supabase.from("income_tracker").upsert(
      {
        id: TRACKER_ID,
        paid_keys,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    ));
  }

  if (error) {
    if (isIncomeTrackerAccessError(error.message)) {
      throw new Error(
        "Cannot save income tracker — run supabase-income-tracker-fix.sql in Supabase SQL Editor."
      );
    }
    throw new Error(error.message);
  }
}

export async function savePaidKeys(keys: Set<string>): Promise<void> {
  const state = await loadIncomeTrackerState();
  await saveIncomeTrackerState({ ...state, keys });
}

export async function saveCloseDateOverride(
  rowId: string,
  closeDate: string,
  existing: IncomeTrackerState
): Promise<Record<string, string>> {
  const closeDateOverrides = { ...existing.closeDateOverrides, [rowId]: closeDate };
  await saveIncomeTrackerState({ ...existing, closeDateOverrides });
  return closeDateOverrides;
}

/** Seed paid_keys once on first setup. After that, paid_keys in Supabase is the source of truth. */
export async function ensure2026PaidKeysSeeded(): Promise<number> {
  const { data, error } = await supabase
    .from("income_tracker")
    .select("id")
    .eq("id", TRACKER_ID)
    .maybeSingle();

  if (error) {
    if (isIncomeTrackerAccessError(error.message)) return 0;
    throw new Error(error.message);
  }

  // Row exists — respect user toggles; never re-merge from sheet seed.
  if (data) return 0;

  const keys = defaultPaidKeysFromSeed();
  await savePaidKeys(keys);
  return keys.size;
}
