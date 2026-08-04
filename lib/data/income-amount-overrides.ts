import { normalizeIncomeAddress } from "@/lib/income-import";

/** Final income-tracker payout overrides keyed by normalized address. */
const OVERRIDES: Record<string, number> = {
  [normalizeIncomeAddress("9743 Almond Ave N")]: 11930,
};

export function incomeAmountOverride(address: string): number | undefined {
  return OVERRIDES[normalizeIncomeAddress(address)];
}
