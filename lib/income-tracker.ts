import { findAgent, findAgentIdByName, NICK_TC_FEE } from "@/lib/agents";
import {
  buildManualIncomeRow,
  dedupeDealRows,
  filterManualEntries,
  incomeIdentityKey,
  type ManualIncomeEntry,
} from "@/lib/income-import";
import { EXCLUDED_INCOME_TRANSACTION_IDS } from "@/lib/data/income-exclusions";
import type { CommissionResult, SideBreakdown } from "@/lib/commission";
import { hasSavedCommission, resolveCommissionAutofill } from "@/lib/commission-autofill";
import { resolveStatus } from "@/lib/transaction-lifecycle";
import {
  coerceExtractedData,
  type ExtractedData,
  type Transaction,
  type TransactionParty,
} from "@/lib/types";

export const BASE_PAY_AMOUNT = 5000;
/** First calendar month (1–12) with guaranteed base pay, by year. */
export const BASE_PAY_FIRST_MONTH: Record<number, number> = {
  2026: 6, // W-2 base pay started June 2026; Jan–May was deal income only.
};
export const NICK_AGENT_ID = "nick-martin";
export const STANDARD_TC_FEE = NICK_TC_FEE;
/** RE/MAX Results brokerage fee — net deposit is 95% of agent commission. */
export const NICK_BROKERAGE_NET_FACTOR = 0.95;
/** Nick's TC fee when representing both sides of a dual-agency deal. */
export const DUAL_SIDE_TC_FEE = NICK_TC_FEE * 2;

export interface IncomeRow {
  /** Stable key for paid tracking — transaction UUID or `base-pay-YYYY-MM`. */
  id: string;
  transactionId: string | null;
  closeDate: string;
  address: string;
  amount: number;
  agentLabel: string;
  paid: boolean;
  isBasePay: boolean;
  /** Nick's personal income — agent commission or team referral payout (not TC fees). */
  isNickDeal: boolean;
  status: "closed" | "active" | "cancelled";
  monthKey: string;
}

export interface AgentDealCount {
  agentId: string;
  agentName: string;
  count: number;
}

export interface IncomeSummary {
  year: number;
  ytdPaid: number;
  /** Closed through today (or base pay due) but not yet marked paid. */
  awaitingPaymentAmount: number;
  awaitingPaymentCount: number;
  pipelineAmount: number;
  pipelineCount: number;
  projectedYearTotal: number;
  /** Your agent deals already on the tracker (closed + pending) — not forecasted. */
  projectedPersonalIncome: number;
  /** Team + personal deals on the books (no run-rate). */
  projectedFromKnown: number;
  projectedFromPipeline: number;
  /** Unscheduled team deals at YTD pace (included in projectedTeamIncome). */
  projectedFromRunRate: number;
  projectedTeamFromRunRate: number;
  /** Expected team deal count by year-end (known + forecast). */
  projectedDealCount: number;
  runRateDealCount: number;
  /** ($50 × deals + $5,000 base pay) ÷ deals, weighted across the year. */
  avgPayoutPerDeal: number;
  dealsPerMonth: number;
  agentCounts: AgentDealCount[];
  /** Team deal counts (dual-side = 2). */
  teamDealsClosed: number;
  teamDealsPending: number;
  teamDealsTotal: number;
  /** Team income through today — base pay + $50/side on team deals only. */
  teamIncomeClosed: number;
  /** Team income for the full year — forecast incl. run-rate at YTD pace. */
  teamIncomeProjected: number;
  /** Team income from known deals + base pay only. */
  teamIncomeFromKnown: number;
  /** Expected team deal count by year-end (known + forecast). */
  projectedTeamDealCount: number;
}

function monthKeyFromDate(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function basePayFirstMonth(year: number): number {
  return BASE_PAY_FIRST_MONTH[year] ?? 1;
}

/** Month keys that should show a base-pay row for the given year. */
function basePayMonthKeysForYear(year: number, now: Date): string[] {
  const first = basePayFirstMonth(year);
  const currentYear = now.getFullYear();
  if (year > currentYear) return [];
  const last = year < currentYear ? 12 : 12;
  const keys: string[] = [];
  for (let m = first; m <= last; m++) {
    keys.push(`${year}-${String(m).padStart(2, "0")}`);
  }
  return keys;
}

function sideDisplay(side: "buyer" | "seller"): string {
  return side === "buyer" ? "Buy Side" : "Listing";
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full.trim();
}

function nickTeamReferralPayout(side: SideBreakdown): number {
  if (
    side.referralType !== "team" ||
    !side.teamReferralAgentName ||
    side.teamReferralAmount == null ||
    side.teamReferralAmount <= 0
  ) {
    return 0;
  }
  return findAgentIdByName(side.teamReferralAgentName) === NICK_AGENT_ID
    ? side.teamReferralAmount
    : 0;
}

export function nickPayoutFromSide(side: SideBreakdown): number {
  if (side.agentId === NICK_AGENT_ID) return side.agentAmount;
  return side.nickAmount + nickTeamReferralPayout(side);
}

export function nickPayoutFromCommission(commission: CommissionResult): number {
  let total = 0;
  if (commission.buyer) total += nickPayoutFromSide(commission.buyer);
  if (commission.seller) total += nickPayoutFromSide(commission.seller);
  return total;
}

/** Apply brokerage haircut for Nick's deals on the income tracker only. */
export function incomeTrackerPayout(grossAmount: number, isNickDeal: boolean): number {
  if (!isNickDeal || grossAmount === 0) return grossAmount;
  return Math.round(grossAmount * NICK_BROKERAGE_NET_FACTOR * 100) / 100;
}

function agentLabelFromSide(
  side: SideBreakdown,
  commissionSide: CommissionResult["side"],
  peerSide?: SideBreakdown
): string {
  const name = firstName(side.agentName);
  if (commissionSide === "dual") {
    const role =
      peerSide && side.agentId === peerSide.agentId
        ? sideDisplay("seller")
        : sideDisplay("buyer");
    return `${name} - ${role}`;
  }
  if (commissionSide === "buyer") return `${name} - Buy Side`;
  return `${name} - Listing`;
}

function agentLabelFromAutofill(
  autofill: NonNullable<ReturnType<typeof resolveCommissionAutofill>>
): string {
  const agentId = autofill.agentId;
  if (!agentId) return "Team Steady";
  const agent = findAgent(agentId);
  const name = firstName(agent?.name ?? "Agent");
  if (autofill.side === "dual") return `${name} - Dual Side`;
  if (autofill.side === "buyer") return `${name} - Buy Side`;
  return `${name} - Listing`;
}

function isSameAgentDual(commission: CommissionResult): boolean {
  if (commission.side !== "dual" || !commission.buyer || !commission.seller) return false;
  return commission.buyer.agentId === commission.seller.agentId;
}

function isNickAgentFromCommission(commission: CommissionResult | null): boolean {
  if (!commission) return false;
  return (
    commission.buyer?.agentId === NICK_AGENT_ID ||
    commission.seller?.agentId === NICK_AGENT_ID
  );
}

function isNickReferralRecipientFromCommission(
  commission: CommissionResult | null
): boolean {
  if (!commission) return false;
  if (commission.buyer && nickTeamReferralPayout(commission.buyer) > 0) return true;
  if (commission.seller && nickTeamReferralPayout(commission.seller) > 0) return true;
  return false;
}

function isNickDealFromAutofill(
  autofill: ReturnType<typeof resolveCommissionAutofill>
): boolean {
  if (!autofill) return false;
  return (
    autofill.agentId === NICK_AGENT_ID || autofill.sellerAgentId === NICK_AGENT_ID
  );
}

function estimatePayout(
  commission: CommissionResult | null,
  autofill: ReturnType<typeof resolveCommissionAutofill>
): number {
  if (commission && hasSavedCommission(commission)) {
    return nickPayoutFromCommission(commission);
  }
  if (autofill?.side === "dual") {
    return DUAL_SIDE_TC_FEE;
  }
  if (isNickDealFromAutofill(autofill)) {
    return STANDARD_TC_FEE;
  }
  return STANDARD_TC_FEE;
}

function primaryAgentLabel(
  commission: CommissionResult | null,
  autofill: ReturnType<typeof resolveCommissionAutofill>,
  extracted: ExtractedData
): string {
  if (commission && hasSavedCommission(commission)) {
    const side = commission.side;
    if (side === "dual" && commission.buyer) {
      if (isSameAgentDual(commission)) {
        return `${firstName(commission.buyer.agentName)} - Dual Side`;
      }
      return agentLabelFromSide(
        commission.buyer,
        "dual",
        commission.seller
      );
    }
    if (commission.buyer) return agentLabelFromSide(commission.buyer, "buyer");
    if (commission.seller) return agentLabelFromSide(commission.seller, "seller");
  }
  if (autofill) return agentLabelFromAutofill(autofill);
  if (extracted.buyerAgentName) {
    return `${firstName(extracted.buyerAgentName)} - Buy Side`;
  }
  if (extracted.listingAgentName) {
    return `${firstName(extracted.listingAgentName)} - Listing`;
  }
  return "—";
}

export type TransactionIncomeInput = {
  transaction: Transaction;
  commission: CommissionResult | null;
  parties: TransactionParty[];
};

function isTeamSteadyTransaction(input: TransactionIncomeInput): boolean {
  const { transaction, commission, parties } = input;
  const extracted = coerceExtractedData(transaction.extracted_data);
  const autofill = resolveCommissionAutofill(parties, extracted);
  const buyerTs = findAgentIdByName(extracted.buyerAgentName);
  const listingTs = findAgentIdByName(extracted.listingAgentName);
  return (
    autofill != null ||
    !!buyerTs ||
    !!listingTs ||
    isNickAgentFromCommission(commission) ||
    (commission != null && hasSavedCommission(commission))
  );
}

function transactionIncomeIdentity(input: TransactionIncomeInput): string | null {
  const extracted = coerceExtractedData(input.transaction.extracted_data);
  const street = extracted.propertyAddress?.split(",")[0]?.trim();
  if (!street) return null;
  const autofill = resolveCommissionAutofill(input.parties, extracted);
  const agentLabel = primaryAgentLabel(input.commission, autofill, extracted);
  if (agentLabel === "—") return null;
  return incomeIdentityKey(street, agentLabel);
}

function classifyTransactionsForManualFilter(inputs: TransactionIncomeInput[]): {
  handledIdentities: Set<string>;
  cancelledIdentities: Set<string>;
} {
  const handledIdentities = new Set<string>();
  const cancelledIdentities = new Set<string>();

  for (const input of inputs) {
    const identity = transactionIncomeIdentity(input);
    if (!identity) continue;

    if (resolveStatus(input.transaction) === "cancelled") {
      cancelledIdentities.add(identity);
      continue;
    }

    if (!isTeamSteadyTransaction(input)) continue;
    const closeDate = coerceExtractedData(input.transaction.extracted_data).closingDate;
    if (closeDate) handledIdentities.add(identity);
  }

  return { handledIdentities, cancelledIdentities };
}

export function buildTransactionIncomeRow(
  input: TransactionIncomeInput,
  paidKeys: Set<string>
): IncomeRow | null {
  const { transaction, commission, parties } = input;
  const extracted = coerceExtractedData(transaction.extracted_data);
  const persisted = resolveStatus(transaction);
  if (persisted === "cancelled") return null;

  const closeDate = extracted.closingDate;
  if (!closeDate) return null;

  if (!isTeamSteadyTransaction(input)) return null;

  const autofill = resolveCommissionAutofill(parties, extracted);

  const grossAmount = estimatePayout(commission, autofill);
  const isNickAgent =
    isNickAgentFromCommission(commission) || isNickDealFromAutofill(autofill);
  const isNickReferral = isNickReferralRecipientFromCommission(commission);
  const isNickDeal = isNickAgent || isNickReferral;
  const amount = incomeTrackerPayout(grossAmount, isNickAgent);

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const closing = new Date(closeDate + "T12:00:00");
  const status: IncomeRow["status"] =
    persisted === "closed" || closing.getTime() < today.getTime()
      ? "closed"
      : "active";

  return {
    id: transaction.id,
    transactionId: transaction.id,
    closeDate,
    address: extracted.propertyAddress?.split(",")[0]?.trim() || "Address TBD",
    amount,
    agentLabel: primaryAgentLabel(commission, autofill, extracted),
    paid: paidKeys.has(transaction.id),
    isBasePay: false,
    isNickDeal,
    status,
    monthKey: monthKeyFromDate(closeDate),
  };
}

export function buildBasePayRow(monthKey: string, paidKeys: Set<string>): IncomeRow {
  const id = `base-pay-${monthKey}`;
  return {
    id,
    transactionId: null,
    closeDate: `${monthKey}-01`,
    address: "BASE PAY",
    amount: BASE_PAY_AMOUNT,
    agentLabel: "—",
    paid: paidKeys.has(id),
    isBasePay: true,
    isNickDeal: false,
    status: "closed",
    monthKey,
  };
}

export function buildIncomeRows(
  inputs: TransactionIncomeInput[],
  paidKeys: Set<string>,
  year: number,
  manualEntries: ManualIncomeEntry[] = []
): IncomeRow[] {
  const dealRows = inputs
    .map((input) => buildTransactionIncomeRow(input, paidKeys))
    .filter(
      (r): r is IncomeRow =>
        r != null &&
        r.closeDate.startsWith(String(year)) &&
        !(r.transactionId != null && EXCLUDED_INCOME_TRANSACTION_IDS.has(r.transactionId))
    );

  const { handledIdentities, cancelledIdentities } =
    classifyTransactionsForManualFilter(inputs);
  const { kept: manualForYear } = filterManualEntries(
    manualEntries.filter((e) => e.year === year),
    handledIdentities,
    cancelledIdentities
  );
  const manualRows = manualForYear.map((e) => buildManualIncomeRow(e, paidKeys));

  const now = new Date();
  const baseRows = basePayMonthKeysForYear(year, now).map((mk) =>
    buildBasePayRow(mk, paidKeys)
  );

  const merged = dedupeDealRows([...dealRows, ...manualRows]);

  return [...baseRows, ...merged].sort((a, b) => {
    if (a.isBasePay !== b.isBasePay) return a.isBasePay ? -1 : 1;
    return (
      new Date(a.closeDate + "T12:00:00").getTime() -
      new Date(b.closeDate + "T12:00:00").getTime()
    );
  });
}

export function computeIncomeSummary(
  rows: IncomeRow[],
  year: number
): IncomeSummary {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const currentMonth = today.getMonth() + 1;

  const yearRows = rows.filter((r) => r.monthKey.startsWith(String(year)));
  const dealRows = yearRows.filter((r) => !r.isBasePay);
  const baseRows = yearRows.filter((r) => r.isBasePay);

  const closedDeals = dealRows.filter((r) => {
    const close = new Date(r.closeDate + "T12:00:00");
    return r.status === "closed" || close.getTime() <= today.getTime();
  });

  const pendingDeals = dealRows.filter((r) => {
    const close = new Date(r.closeDate + "T12:00:00");
    return r.status === "active" && close.getTime() > today.getTime();
  });

  function countsTowardYtd(row: IncomeRow): boolean {
    if (row.isBasePay) {
      const m = parseInt(row.monthKey.split("-")[1] ?? "0", 10);
      const rowYear = parseInt(row.monthKey.split("-")[0] ?? "0", 10);
      if (rowYear < today.getFullYear()) return true;
      if (rowYear > today.getFullYear()) return false;
      return m <= currentMonth;
    }
    const close = new Date(row.closeDate + "T12:00:00");
    return row.status === "closed" || close.getTime() <= today.getTime();
  }

  const ytdRows = yearRows.filter(countsTowardYtd);

  const basePayFullYear = baseRows.reduce((s, r) => s + r.amount, 0);

  const ytdPaid = ytdRows
    .filter((r) => r.paid)
    .reduce((s, r) => s + r.amount, 0);

  const awaitingPaymentRows = ytdRows.filter((r) => !r.paid);
  const awaitingPaymentAmount = awaitingPaymentRows.reduce((s, r) => s + r.amount, 0);
  const awaitingPaymentCount = awaitingPaymentRows
    .filter((r) => !r.isBasePay)
    .reduce((s, r) => s + agentDealCredit(r.agentLabel), 0);

  const pipelineAmount = pendingDeals.reduce((s, r) => s + r.amount, 0);
  const pipelineCount = pendingDeals.reduce(
    (s, r) => s + agentDealCredit(r.agentLabel),
    0
  );

  const avgPayoutPerDeal = computeAvgPayoutPerDeal(yearRows);

  const monthsElapsed =
    year < today.getFullYear() ? 12 : year > today.getFullYear() ? 0 : currentMonth;
  const closedCredits = closedDeals.reduce(
    (s, r) => s + agentDealCredit(r.agentLabel),
    0
  );
  const dealsPerMonth = monthsElapsed > 0 ? closedCredits / monthsElapsed : 0;

  const forecast = computeYearEndForecast(
    year,
    today,
    closedDeals,
    pendingDeals,
    basePayFullYear,
    dealsPerMonth
  );

  const agentMap = new Map<string, AgentDealCount>();
  for (const row of dealRows) {
    const labelName = agentNameFromLabel(row.agentLabel);
    const credit = agentDealCredit(row.agentLabel);
    const existing = agentMap.get(labelName);
    if (existing) {
      existing.count += credit;
    } else {
      agentMap.set(labelName, {
        agentId: labelName.toLowerCase(),
        agentName: labelName,
        count: credit,
      });
    }
  }

  const agentCounts = [...agentMap.values()].sort((a, b) => b.count - a.count);

  const teamDealsClosed = closedDeals.reduce(
    (s, r) => s + agentDealCredit(r.agentLabel),
    0
  );
  const teamDealsPending = pendingDeals.reduce(
    (s, r) => s + agentDealCredit(r.agentLabel),
    0
  );
  const teamDealsTotal = teamDealsClosed + teamDealsPending;

  const ytdDealRows = ytdRows.filter((r) => !r.isBasePay);
  const teamIncomeClosed =
    teamFeesFromRows(ytdDealRows) + teamBasePayYtd(year, today);

  return {
    year,
    ytdPaid,
    awaitingPaymentAmount,
    awaitingPaymentCount,
    pipelineAmount,
    pipelineCount,
    projectedYearTotal: forecast.projectedYearTotal,
    projectedPersonalIncome: forecast.projectedPersonalIncome,
    projectedFromKnown: forecast.projectedFromKnown,
    projectedFromPipeline: pipelineAmount,
    projectedFromRunRate: forecast.projectedFromRunRate,
    projectedTeamFromRunRate: forecast.projectedTeamFromRunRate,
    projectedDealCount: forecast.projectedDealCount,
    runRateDealCount: forecast.runRateDealCount,
    avgPayoutPerDeal,
    dealsPerMonth,
    agentCounts,
    teamDealsClosed,
    teamDealsPending,
    teamDealsTotal,
    teamIncomeClosed,
    teamIncomeProjected: forecast.projectedTeamIncome,
    teamIncomeFromKnown: forecast.projectedTeamFromKnown,
    projectedTeamDealCount: forecast.projectedTeamDealCount,
  };
}

/** Coordinator fee credited to team income — $50 per side (dual = $100). */
export function teamCoordinatorFee(row: IncomeRow): number {
  if (row.isBasePay || row.isNickDeal) return 0;
  return agentDealCredit(row.agentLabel) * STANDARD_TC_FEE;
}

function isTeamIncomeDeal(row: IncomeRow): boolean {
  return !row.isBasePay && !row.isNickDeal;
}

function teamDealCredits(rows: IncomeRow[]): number {
  return sumDealCredits(rows.filter(isTeamIncomeDeal));
}

/** Base pay in the team-income model — $5,000 every month of the year. */
export function teamBasePayAnnual(): number {
  return BASE_PAY_AMOUNT * 12;
}

export function teamBasePayYtd(year: number, today: Date): number {
  const currentYear = today.getFullYear();
  if (year < currentYear) return teamBasePayAnnual();
  if (year > currentYear) return 0;
  return BASE_PAY_AMOUNT * (today.getMonth() + 1);
}

function teamFeesFromRows(rows: IncomeRow[]): number {
  return teamDealCredits(rows) * STANDARD_TC_FEE;
}

function sumDealCredits(rows: IncomeRow[]): number {
  return rows.reduce((s, r) => s + agentDealCredit(r.agentLabel), 0);
}

export interface YearEndForecast {
  projectedYearTotal: number;
  projectedPersonalIncome: number;
  projectedTeamIncome: number;
  projectedFromKnown: number;
  projectedTeamFromKnown: number;
  projectedFromRunRate: number;
  projectedTeamFromRunRate: number;
  projectedDealCount: number;
  projectedTeamDealCount: number;
  runRateDealCount: number;
}

function existingPersonalDealIncome(rows: IncomeRow[]): number {
  return rows
    .filter((r) => !r.isBasePay && r.isNickDeal)
    .reduce((s, r) => s + r.amount, 0);
}

/**
 * Year-end forecast: team income at YTD pace ($50/side + $5k/mo base), plus your
 * personal deals already on the tracker (no forecast of future personal deals).
 */
export function computeYearEndForecast(
  year: number,
  today: Date,
  closedDeals: IncomeRow[],
  pendingDeals: IncomeRow[],
  _basePayFullYear: number,
  dealsPerMonth: number
): YearEndForecast {
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const closedCredits = sumDealCredits(closedDeals);
  const pendingCredits = sumDealCredits(pendingDeals);
  const knownDeals = [...closedDeals, ...pendingDeals];
  const personalIncome = existingPersonalDealIncome(knownDeals);

  const teamBasePay = teamBasePayAnnual();
  const closedTeamFees = teamFeesFromRows(closedDeals);
  const pipelineTeamFees = teamFeesFromRows(pendingDeals);

  const projectedTeamFromKnown = closedTeamFees + pipelineTeamFees + teamBasePay;
  const projectedFromKnown = projectedTeamFromKnown + personalIncome;

  const closedTeamCredits = teamDealCredits(closedDeals);
  const pendingTeamCredits = teamDealCredits(pendingDeals);
  const teamKnownCount = closedTeamCredits + pendingTeamCredits;

  if (year < currentYear) {
    const knownCount = closedCredits + pendingCredits;
    return {
      projectedYearTotal: projectedFromKnown,
      projectedPersonalIncome: personalIncome,
      projectedTeamIncome: projectedTeamFromKnown,
      projectedFromKnown,
      projectedTeamFromKnown,
      projectedFromRunRate: 0,
      projectedTeamFromRunRate: 0,
      projectedDealCount: knownCount,
      projectedTeamDealCount: teamKnownCount,
      runRateDealCount: 0,
    };
  }

  const pendingCreditsByMonth = new Map<number, number>();
  for (const row of pendingDeals) {
    const m = parseInt(row.monthKey.split("-")[1] ?? "0", 10);
    pendingCreditsByMonth.set(
      m,
      (pendingCreditsByMonth.get(m) ?? 0) + agentDealCredit(row.agentLabel)
    );
  }

  let runRateTeam = 0;
  let runRateCredits = 0;

  const startMonth = year > currentYear ? 1 : currentMonth;

  for (let m = startMonth; m <= 12; m++) {
    let knownCredits = pendingCreditsByMonth.get(m) ?? 0;

    if (year === currentYear && m === currentMonth) {
      const closedThisMonth = closedDeals.filter(
        (r) => parseInt(r.monthKey.split("-")[1] ?? "0", 10) === m
      );
      knownCredits += sumDealCredits(closedThisMonth);
    }

    const gapCredits = Math.max(0, dealsPerMonth - knownCredits);
    runRateCredits += gapCredits;
    runRateTeam += gapCredits * STANDARD_TC_FEE;
  }

  const knownCount = closedCredits + pendingCredits;
  const forecastDealCount = Math.round(knownCount + runRateCredits);
  const forecastTeamDealCount = Math.round(teamKnownCount + runRateCredits);
  const projectedTeamIncome = forecastTeamDealCount * STANDARD_TC_FEE + teamBasePay;

  return {
    projectedYearTotal: projectedTeamIncome + personalIncome,
    projectedPersonalIncome: personalIncome,
    projectedTeamIncome,
    projectedFromKnown,
    projectedTeamFromKnown,
    projectedFromRunRate: runRateTeam,
    projectedTeamFromRunRate: runRateTeam,
    projectedDealCount: forecastDealCount,
    projectedTeamDealCount: forecastTeamDealCount,
    runRateDealCount: runRateCredits,
  };
}

/**
 * Average payout per deal: each month, (deal count × $50 + $5,000) ÷ deal count,
 * then weighted by deal count across months (months with zero closings skipped).
 * Base pay applies every month — before June 2026 it was embedded in early closings.
 */
export function computeAvgPayoutPerDeal(yearRows: IncomeRow[]): number {
  const byMonth = groupRowsByMonth(yearRows);

  let totalDeals = 0;
  let totalComp = 0;

  for (const [, monthRows] of byMonth) {
    const dealCount = monthDealCount(monthRows);
    if (dealCount === 0) continue;

    totalDeals += dealCount;
    totalComp += dealCount * STANDARD_TC_FEE + BASE_PAY_AMOUNT;
  }

  return totalDeals > 0 ? totalComp / totalDeals : STANDARD_TC_FEE;
}

export function groupRowsByMonth(rows: IncomeRow[]): Map<string, IncomeRow[]> {
  const map = new Map<string, IncomeRow[]>();
  for (const row of rows) {
    const list = map.get(row.monthKey) ?? [];
    list.push(row);
    map.set(row.monthKey, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => {
      if (a.isBasePay !== b.isBasePay) return a.isBasePay ? -1 : 1;
      return (
        new Date(a.closeDate + "T12:00:00").getTime() -
        new Date(b.closeDate + "T12:00:00").getTime()
      );
    });
  }
  return map;
}

/** Default which month sections start expanded: current calendar month + the next month only. */
export function defaultExpandedMonthKeys(
  monthKeys: string[],
  now: Date = new Date()
): Set<string> {
  if (monthKeys.length === 0) return new Set();

  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth() + 1;

  const currentKey = `${todayYear}-${String(todayMonth).padStart(2, "0")}`;
  const nextMonthDate = new Date(todayYear, todayMonth, 1);
  const nextKey = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const openKeys = new Set([currentKey, nextKey]);
  return new Set(monthKeys.filter((mk) => openKeys.has(mk)));
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

export function monthTotal(rows: IncomeRow[]): number {
  return rows.reduce((s, r) => s + r.amount, 0);
}

export function monthPaidTotal(rows: IncomeRow[]): number {
  return rows.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0);
}

export function agentNameFromLabel(agentLabel: string): string {
  const match = agentLabel.match(/^(.+?)\s-/);
  return match?.[1]?.trim() ?? agentLabel;
}

/** Deal credits for agent stats — dual-sided closings count as 2. */
export function agentDealCredit(agentLabel: string): number {
  return agentLabel.includes("Dual Side") ? 2 : 1;
}

export function monthDealCount(rows: IncomeRow[]): number {
  return rows
    .filter((r) => !r.isBasePay)
    .reduce((sum, r) => sum + agentDealCredit(r.agentLabel), 0);
}

export function monthDealTotal(rows: IncomeRow[]): number {
  return rows.filter((r) => !r.isBasePay).reduce((s, r) => s + r.amount, 0);
}

export function monthDealPaidTotal(rows: IncomeRow[]): number {
  return rows
    .filter((r) => !r.isBasePay && r.paid)
    .reduce((s, r) => s + r.amount, 0);
}

export function filterRowsByAgent(rows: IncomeRow[], agentName: string): IncomeRow[] {
  const target = agentName.trim().toLowerCase();
  return rows.filter(
    (r) => !r.isBasePay && agentNameFromLabel(r.agentLabel).toLowerCase() === target
  );
}

export function sortRowsByCloseDate(rows: IncomeRow[]): IncomeRow[] {
  return [...rows].sort(
    (a, b) =>
      new Date(a.closeDate + "T12:00:00").getTime() -
      new Date(b.closeDate + "T12:00:00").getTime()
  );
}
