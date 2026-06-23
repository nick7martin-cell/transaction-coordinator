import { findAgent, findAgentIdByName, NICK_TC_FEE } from "@/lib/agents";
import {
  buildManualIncomeRow,
  filterManualAgainstTransactions,
  type ManualIncomeEntry,
  transactionDedupeKeys,
} from "@/lib/income-import";
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
  /** Nick is the agent — payout is typically much higher than the $50 TC fee. */
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
  ytdEarned: number;
  ytdPaid: number;
  pipelineAmount: number;
  pipelineCount: number;
  projectedYearTotal: number;
  projectedFromPipeline: number;
  projectedFromRunRate: number;
  avgStandardDeal: number;
  dealsPerMonth: number;
  agentCounts: AgentDealCount[];
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

export function nickPayoutFromSide(side: SideBreakdown): number {
  if (side.agentId === NICK_AGENT_ID) return side.agentAmount;
  return side.nickAmount;
}

export function nickPayoutFromCommission(commission: CommissionResult): number {
  let total = 0;
  if (commission.buyer) total += nickPayoutFromSide(commission.buyer);
  if (commission.seller) total += nickPayoutFromSide(commission.seller);
  return total;
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
  if (autofill.side === "dual") return `${name} - Dual`;
  if (autofill.side === "buyer") return `${name} - Buy Side`;
  return `${name} - Listing`;
}

function isNickDealFromCommission(commission: CommissionResult | null): boolean {
  if (!commission) return false;
  return (
    commission.buyer?.agentId === NICK_AGENT_ID ||
    commission.seller?.agentId === NICK_AGENT_ID
  );
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

  const autofill = resolveCommissionAutofill(parties, extracted);
  const buyerTs = findAgentIdByName(extracted.buyerAgentName);
  const listingTs = findAgentIdByName(extracted.listingAgentName);
  const teamSteady =
    autofill != null ||
    !!buyerTs ||
    !!listingTs ||
    isNickDealFromCommission(commission) ||
    (commission != null && hasSavedCommission(commission));

  if (!teamSteady) return null;

  const amount = estimatePayout(commission, autofill);
  const isNickDeal =
    isNickDealFromCommission(commission) || isNickDealFromAutofill(autofill);

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
    .filter((r): r is IncomeRow => r != null && r.closeDate.startsWith(String(year)));

  const txKeys = transactionDedupeKeys(dealRows);
  const { kept: manualForYear } = filterManualAgainstTransactions(
    manualEntries.filter((e) => e.year === year),
    txKeys
  );
  const manualRows = manualForYear.map((e) => buildManualIncomeRow(e, paidKeys));

  const now = new Date();
  const baseRows = basePayMonthKeysForYear(year, now).map((mk) =>
    buildBasePayRow(mk, paidKeys)
  );

  return [...baseRows, ...dealRows, ...manualRows].sort((a, b) => {
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

  const basePayThroughCurrent = baseRows
    .filter((r) => {
      const m = parseInt(r.monthKey.split("-")[1] ?? "0", 10);
      const rowYear = parseInt(r.monthKey.split("-")[0] ?? "0", 10);
      if (rowYear < today.getFullYear()) return true;
      if (rowYear > today.getFullYear()) return false;
      return m <= currentMonth;
    })
    .reduce((s, r) => s + r.amount, 0);

  const basePayFullYear = baseRows.reduce((s, r) => s + r.amount, 0);

  const ytdEarned =
    closedDeals.reduce((s, r) => s + r.amount, 0) + basePayThroughCurrent;

  const ytdPaid = yearRows
    .filter((r) => r.paid)
    .reduce((s, r) => s + r.amount, 0);

  const pipelineAmount = pendingDeals.reduce((s, r) => s + r.amount, 0);
  const pipelineCount = pendingDeals.length;

  const standardClosed = closedDeals.filter((r) => !r.isNickDeal);
  const avgStandardDeal =
    standardClosed.length > 0
      ? standardClosed.reduce((s, r) => s + r.amount, 0) / standardClosed.length
      : STANDARD_TC_FEE;

  const monthsElapsed =
    year < today.getFullYear() ? 12 : year > today.getFullYear() ? 0 : currentMonth;
  const dealsPerMonth = monthsElapsed > 0 ? closedDeals.length / monthsElapsed : 0;

  const monthsRemaining =
    year < today.getFullYear() ? 0 : year > today.getFullYear() ? 12 : 12 - currentMonth;

  const basePayRemaining =
    year < today.getFullYear()
      ? 0
      : baseRows
          .filter((r) => {
            const m = parseInt(r.monthKey.split("-")[1] ?? "0", 10);
            return m > currentMonth;
          })
          .reduce((s, r) => s + r.amount, 0);

  const projectedFromRunRate =
    monthsRemaining > 0 ? dealsPerMonth * monthsRemaining * avgStandardDeal : 0;

  const projectedFromPipeline = pipelineAmount;

  const closedDealAmount = closedDeals.reduce((s, r) => s + r.amount, 0);

  /** Known year total — no run-rate double-count on top of scheduled closings. */
  const projectedYearTotal = closedDealAmount + pipelineAmount + basePayFullYear;

  const agentMap = new Map<string, AgentDealCount>();
  for (const row of dealRows) {
    const match = row.agentLabel.match(/^(.+?)\s-/);
    const labelName = match?.[1]?.trim() ?? row.agentLabel;
    const existing = agentMap.get(labelName);
    if (existing) {
      existing.count += 1;
    } else {
      agentMap.set(labelName, {
        agentId: labelName.toLowerCase(),
        agentName: labelName,
        count: 1,
      });
    }
  }

  const agentCounts = [...agentMap.values()].sort((a, b) => b.count - a.count);

  return {
    year,
    ytdEarned,
    ytdPaid,
    pipelineAmount,
    pipelineCount,
    projectedYearTotal,
    projectedFromPipeline,
    projectedFromRunRate,
    avgStandardDeal,
    dealsPerMonth,
    agentCounts,
  };
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
