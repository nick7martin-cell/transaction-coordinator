import { normalizeIncomeAddress } from "@/lib/income-import";

/** Final income-tracker payout overrides keyed by normalized address. */
const OVERRIDES: Record<string, number> = {
  [normalizeIncomeAddress("9743 Almond Ave N")]: 11930,
  [normalizeIncomeAddress("2586 Ann Drive")]: 5104.4,
  /** Flat $2,500 listing GCI — saved commission was $0 until CW splits were entered. */
  [normalizeIncomeAddress("505 54th Ave NE")]: 50,
};

export function incomeAmountOverride(address: string): number | undefined {
  return OVERRIDES[normalizeIncomeAddress(address)];
}
