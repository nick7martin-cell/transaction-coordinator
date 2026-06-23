import {
  importedRowsToManualEntries,
  type ManualIncomeEntry,
} from "@/lib/income-import";
import seedRows2026 from "@/lib/data/income-2026-raw.json";
import { supabase } from "@/lib/supabase";

export const TRACKER_ID = "default";

const SEED_2026: ManualIncomeEntry[] = importedRowsToManualEntries(
  seedRows2026,
  new Set()
).entries;

export type PaidKeysState = {
  keys: Set<string>;
  /** False when Supabase denied access — rows still load, toggles won't persist. */
  writable: boolean;
};

function defaultPaidKeysFromSeed(): Set<string> {
  const keys = new Set<string>();
  for (const entry of SEED_2026) {
    const seedRow = seedRows2026.find(
      (r) => r.closeDate === entry.closeDate && r.address === entry.address
    );
    if (seedRow?.paid) keys.add(entry.id);
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

export async function loadPaidKeys(): Promise<PaidKeysState> {
  const { data, error } = await supabase
    .from("income_tracker")
    .select("paid_keys")
    .eq("id", TRACKER_ID)
    .maybeSingle();

  if (error) {
    if (isIncomeTrackerAccessError(error.message)) {
      return { keys: defaultPaidKeysFromSeed(), writable: false };
    }
    throw new Error(error.message);
  }

  const raw = data?.paid_keys;
  return {
    keys: new Set(Array.isArray(raw) ? raw.map(String) : []),
    writable: true,
  };
}

export async function savePaidKeys(keys: Set<string>): Promise<void> {
  const paid_keys = [...keys];
  const { error } = await supabase.from("income_tracker").upsert(
    {
      id: TRACKER_ID,
      paid_keys,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) {
    if (isIncomeTrackerAccessError(error.message)) {
      throw new Error(
        "Cannot save paid status — run supabase-income-tracker-fix.sql in Supabase SQL Editor."
      );
    }
    throw new Error(error.message);
  }
}

/** Seed paid_keys for imported manual rows marked paid in the sheet (through June 2026). */
export async function ensure2026PaidKeysSeeded(): Promise<number> {
  const state = await loadPaidKeys();
  if (!state.writable) return 0;

  let added = 0;
  for (const entry of SEED_2026) {
    const seedRow = seedRows2026.find(
      (r) => r.closeDate === entry.closeDate && r.address === entry.address
    );
    if (seedRow?.paid && !state.keys.has(entry.id)) {
      state.keys.add(entry.id);
      added += 1;
    }
  }

  if (added > 0) await savePaidKeys(state.keys);
  return added;
}
