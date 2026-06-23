"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  computeIncomeSummary,
  formatMonthLabel,
  groupRowsByMonth,
  monthDealCount,
  monthDealTotal,
  monthPaidTotal,
  monthTotal,
  filterRowsByAgent,
  sortRowsByCloseDate,
  type IncomeRow,
  type IncomeSummary,
} from "@/lib/income-tracker";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  Loader2,
  TrendingUp,
  Users,
} from "lucide-react";

type IncomeResponse = {
  year: number;
  rows: IncomeRow[];
  summary: IncomeSummary;
  availableYears: number[];
  warning?: string;
  paidKeysWritable?: boolean;
};

function SummaryCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "brand" | "good" | "warn";
}) {
  const accentCls =
    accent === "good"
      ? "border-good/60 bg-good/25"
      : accent === "warn"
        ? "border-warn/60 bg-warn/25"
        : "border-line bg-surface";

  return (
    <div className={cn("rounded-[20px] border p-5 shadow-card", accentCls)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
        {label}
      </p>
      <p className="mt-2 text-2xl sm:text-[28px] font-semibold text-ink tabular-nums leading-none">
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}

function PaidToggle({
  paid,
  disabled,
  onToggle,
  compact = false,
}: {
  paid: boolean;
  disabled?: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
          paid
            ? "text-good-ink hover:bg-good/20"
            : "text-ink-mute hover:text-ink hover:bg-line/40"
        )}
      >
        {paid ? <Check className="h-3 w-3" /> : null}
        {paid ? "Received" : "Mark received"}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl px-3 h-9 text-xs font-semibold transition-colors disabled:opacity-50",
        paid
          ? "bg-good text-good-ink hover:bg-good/80"
          : "bg-warn/80 text-warn-ink hover:bg-warn"
      )}
    >
      {paid ? <Check className="h-3.5 w-3.5" /> : null}
      {paid ? "Paid" : "Mark paid"}
    </button>
  );
}

function BasePayStrip({
  row,
  togglingId,
  onTogglePaid,
}: {
  row: IncomeRow;
  togglingId: string | null;
  onTogglePaid: (id: string, paid: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line/40 px-5 py-2">
      <p className="text-[11px] text-ink-mute">
        <span className="font-medium uppercase tracking-wider">Base pay</span>
        <span className="mx-2 text-ink-mute/30">·</span>
        <span className="tabular-nums text-ink-soft">{formatCurrency(row.amount)}</span>
      </p>
      <PaidToggle
        paid={row.paid}
        disabled={togglingId === row.id}
        onToggle={() => onTogglePaid(row.id, !row.paid)}
        compact
      />
    </div>
  );
}

function DealTable({
  rows,
  togglingId,
  onTogglePaid,
  showMonth = false,
  basePayAmount = 0,
}: {
  rows: IncomeRow[];
  togglingId: string | null;
  onTogglePaid: (id: string, paid: boolean) => void;
  showMonth?: boolean;
  basePayAmount?: number;
}) {
  const dealTotal = monthDealTotal(rows);
  const total = dealTotal + basePayAmount;
  const dealCount = monthDealCount(rows);

  if (dealCount === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
            <th className="px-5 py-3 w-[110px]">Close</th>
            {showMonth ? <th className="px-5 py-3 w-[120px]">Month</th> : null}
            <th className="px-5 py-3">Address</th>
            <th className="px-5 py-3 w-[120px] text-right">Payout</th>
            <th className="px-5 py-3 w-[160px]">Agent</th>
            <th className="px-5 py-3 w-[120px]">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                "border-b border-line/60 last:border-0 transition-colors",
                row.paid ? "bg-good/15" : "bg-warn/10"
              )}
            >
              <td className="px-5 py-3.5 text-ink-soft tabular-nums whitespace-nowrap">
                {formatDate(row.closeDate)}
              </td>
              {showMonth ? (
                <td className="px-5 py-3.5 text-ink-soft whitespace-nowrap">
                  {formatMonthLabel(row.monthKey).replace(/ \d{4}$/, "")}
                </td>
              ) : null}
              <td className="px-5 py-3.5">
                {row.transactionId ? (
                  <Link
                    href={`/transactions/${row.transactionId}`}
                    className="font-medium text-ink hover:text-brand transition-colors"
                  >
                    {row.address}
                  </Link>
                ) : (
                  <span className="font-medium text-ink">{row.address}</span>
                )}
                {row.isNickDeal ? (
                  <span className="ml-2 text-[10px] font-semibold uppercase text-ink-mute">
                    Your deal
                  </span>
                ) : null}
              </td>
              <td className="px-5 py-3.5 text-right font-semibold tabular-nums">
                <span className={row.amount === 0 ? "text-ink-mute" : "text-ink"}>
                  {formatCurrency(row.amount)}
                </span>
                {row.amount === 0 ? (
                  <span className="block text-[10px] font-medium text-ink-mute mt-0.5">
                    Closed · no payout
                  </span>
                ) : null}
              </td>
              <td className="px-5 py-3.5 text-ink-soft">
                {row.agentLabel}
                {row.agentLabel.includes("Dual Side") ? (
                  <span className="ml-2 text-[10px] font-semibold uppercase text-ink-mute">
                    Both sides
                  </span>
                ) : null}
              </td>
              <td className="px-5 py-3.5">
                <PaidToggle
                  paid={row.paid}
                  disabled={togglingId === row.id}
                  onToggle={() => onTogglePaid(row.id, !row.paid)}
                />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-canvas/80 font-semibold text-ink">
            <td className="px-5 py-3" colSpan={showMonth ? 3 : 2}>
              {dealCount} transaction{dealCount === 1 ? "" : "s"}
              {basePayAmount > 0 ? (
                <span className="font-normal text-ink-mute"> · incl. base pay</span>
              ) : null}
            </td>
            <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(total)}</td>
            <td className="px-5 py-3" colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-ink-mute">{label}</span>
      <span className="font-semibold text-ink tabular-nums">{value}</span>
    </span>
  );
}

function forecastDealHint(summary: IncomeSummary): string {
  const extra = Math.round(summary.runRateDealCount);
  if (extra <= 0) {
    return `Based on ${summary.projectedTeamDealCount} known deals and base pay`;
  }
  return `~${extra} unscheduled deals at ${summary.dealsPerMonth.toFixed(1)}/mo pace (${summary.projectedTeamDealCount} total)`;
}

function yearTotalHint(summary: IncomeSummary): string {
  const personal =
    summary.projectedPersonalIncome > 0
      ? ` + ${formatCurrency(summary.projectedPersonalIncome)} from your deals on the books`
      : "";
  return `Projected team income${personal}`;
}

function TeamOverviewBar({ summary }: { summary: IncomeSummary }) {
  return (
    <div className="rounded-[20px] border border-line bg-surface px-4 py-3 sm:px-5 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:gap-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute shrink-0">
            Team deals
          </span>
          <StatPill label="Closed" value={summary.teamDealsClosed} />
          <span className="hidden sm:inline text-ink-mute/40">·</span>
          <StatPill label="Pending" value={summary.teamDealsPending} />
          <span className="hidden sm:inline text-ink-mute/40">·</span>
          <StatPill label="Known" value={summary.teamDealsTotal} />
          <span className="hidden sm:inline text-ink-mute/40">·</span>
          <StatPill label="Forecast" value={summary.projectedTeamDealCount} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:border-l sm:border-line sm:pl-6">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute shrink-0">
            Team income
          </span>
          <StatPill label="Closed YTD" value={formatCurrency(summary.teamIncomeClosed)} />
          <span className="hidden sm:inline text-ink-mute/40">·</span>
          <StatPill label="Projected" value={formatCurrency(summary.teamIncomeProjected)} />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-ink-mute leading-relaxed">
        Team income = $50 per deal side (dual-side = $100) + $5,000 base pay each month
        ($60,000/yr). Your personal agent commission is excluded from team income.
        Projected: {forecastDealHint(summary)}.
      </p>
    </div>
  );
}

function MonthSection({
  monthKey,
  rows,
  togglingId,
  onTogglePaid,
  expanded,
  onToggleExpanded,
}: {
  monthKey: string;
  rows: IncomeRow[];
  togglingId: string | null;
  onTogglePaid: (id: string, paid: boolean) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const basePayRow = rows.find((r) => r.isBasePay);
  const dealRows = rows.filter((r) => !r.isBasePay);
  const total = monthTotal(rows);
  const paidTotal = monthPaidTotal(rows);
  const dealCount = monthDealCount(rows);
  const allPaid = rows.every((r) => r.paid);

  return (
    <section className="rounded-[20px] border border-line bg-surface shadow-card overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpanded}
        className={cn(
          "w-full bg-canvas/60 text-left transition-colors hover:bg-canvas/80",
          expanded && "border-b border-line"
        )}
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[17px] font-semibold text-ink">{formatMonthLabel(monthKey)}</h2>
              {dealCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-ink-soft tabular-nums">
                  {dealCount} transaction{dealCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-ink-mute mt-0.5">
              {formatCurrency(total)} total · {formatCurrency(paidTotal)} paid
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                allPaid ? "bg-good/50 text-good-ink" : "bg-warn/50 text-warn-ink"
              )}
            >
              {allPaid ? "All paid" : "Outstanding balance"}
            </span>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-ink-mute" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4 text-ink-mute" aria-hidden />
            )}
          </div>
        </div>
      </button>

      {expanded ? (
        <>
          {basePayRow ? (
            <BasePayStrip row={basePayRow} togglingId={togglingId} onTogglePaid={onTogglePaid} />
          ) : null}

          <DealTable
            rows={dealRows}
            togglingId={togglingId}
            onTogglePaid={onTogglePaid}
            basePayAmount={basePayRow?.amount ?? 0}
          />

          {dealCount === 0 && basePayRow ? (
            <div className="flex items-center justify-between gap-4 border-t border-line/40 bg-canvas/80 px-5 py-3 text-sm font-semibold text-ink">
              <span className="text-ink-mute font-normal">No transaction closings this month</span>
              <span className="tabular-nums">{formatCurrency(basePayRow.amount)}</span>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function AgentDealsSection({
  agentName,
  rows,
  year,
  togglingId,
  onTogglePaid,
  onBack,
}: {
  agentName: string;
  rows: IncomeRow[];
  year: number;
  togglingId: string | null;
  onTogglePaid: (id: string, paid: boolean) => void;
  onBack: () => void;
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const paidTotal = rows.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0);

  return (
    <section className="rounded-[20px] border border-line bg-surface shadow-card overflow-hidden">
      <div className="border-b border-line px-5 py-4 bg-canvas/60 space-y-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:text-brand/80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to all transactions
        </button>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
              {year} · Agent deals
            </p>
            <h2 className="text-[22px] font-semibold text-ink tracking-tight mt-1">{agentName}</h2>
            <p className="text-xs text-ink-mute mt-1">
              {rows.length} transaction{rows.length === 1 ? "" : "s"} · {formatCurrency(total)}{" "}
              total · {formatCurrency(paidTotal)} paid
            </p>
          </div>
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-soft tabular-nums">
            Sorted by close date
          </span>
        </div>
      </div>

      <DealTable rows={rows} togglingId={togglingId} onTogglePaid={onTogglePaid} showMonth />
    </section>
  );
}

export function IncomeTrackerView() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<IncomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/income?year=${year}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load income data");
      setData(json as IncomeResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load income data");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedAgent(null);
  }, [year]);

  const monthKeys = useMemo(
    () => (data ? [...groupRowsByMonth(data.rows).keys()].sort() : []),
    [data]
  );

  useEffect(() => {
    if (monthKeys.length === 0) {
      setExpandedMonths(new Set());
      return;
    }
    setExpandedMonths(new Set([monthKeys[monthKeys.length - 1]!]));
  }, [year, monthKeys.join(",")]);

  async function togglePaid(id: string, paid: boolean) {
    setTogglingId(id);
    try {
      const res = await fetch("/api/income", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, paid }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update");
      setData((prev) => {
        if (!prev) return prev;
        const rows = prev.rows.map((r) => (r.id === id ? { ...r, paid } : r));
        return {
          ...prev,
          rows,
          summary: computeIncomeSummary(rows, prev.year),
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update paid status");
    } finally {
      setTogglingId(null);
    }
  }

  const byMonth = useMemo(
    () => (data ? groupRowsByMonth(data.rows) : new Map<string, IncomeRow[]>()),
    [data]
  );

  const agentDeals = useMemo(() => {
    if (!data || !selectedAgent) return [];
    return sortRowsByCloseDate(filterRowsByAgent(data.rows, selectedAgent));
  }, [data, selectedAgent]);

  const summary = data?.summary;

  return (
    <div className="space-y-8 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold text-ink tracking-tight">Income</h1>
          <p className="mt-1 text-sm text-ink-soft max-w-xl">
            Track coordinator payouts by close date. Handled transactions with a closing date
            and Team Steady agent appear here automatically (refresh to update). Cancelled deals
            are removed. Base pay ($5,000/mo) is added from June 2026 onward.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-2 py-1.5 shadow-card">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="rounded-lg p-2 text-ink-mute hover:text-ink hover:bg-line/60 transition-colors"
            aria-label="Previous year"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[4rem] text-center text-sm font-semibold text-ink tabular-nums">
            {year}
          </span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            className="rounded-lg p-2 text-ink-mute hover:text-ink hover:bg-line/60 transition-colors"
            aria-label="Next year"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-danger bg-danger/40 px-4 py-3 text-sm text-danger-ink">
          {error}
          {error.includes("income_tracker") ||
          error.includes("permission denied") ||
          error.includes("supabase-income-tracker-fix") ? (
            <p className="mt-1 text-xs">
              Open Supabase → SQL Editor and run the{" "}
              <code className="font-mono">supabase-income-tracker-fix.sql</code> file from the
              project root.
            </p>
          ) : null}
        </div>
      )}

      {data?.warning && !error ? (
        <div className="rounded-xl border border-warn bg-warn/30 px-4 py-3 text-sm text-warn-ink">
          {data.warning}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-ink-mute">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard
              label="Received YTD"
              value={formatCurrency(summary.ytdPaid)}
              hint="Deposits you've marked as paid through today"
              accent="good"
            />
            <SummaryCard
              label="Under contract"
              value={formatCurrency(summary.pipelineAmount)}
              hint={`${summary.pipelineCount} scheduled closing${summary.pipelineCount === 1 ? "" : "s"} still ahead`}
              accent="warn"
            />
            <SummaryCard
              label="Projected year total"
              value={formatCurrency(summary.projectedYearTotal)}
              hint={yearTotalHint(summary)}
            />
          </div>

          <TeamOverviewBar summary={summary} />

          <div className="grid gap-6 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(240px,320px)] min-w-0">
            <div className="space-y-6 min-w-0">
              {selectedAgent ? (
                <AgentDealsSection
                  agentName={selectedAgent}
                  rows={agentDeals}
                  year={year}
                  togglingId={togglingId}
                  onTogglePaid={togglePaid}
                  onBack={() => setSelectedAgent(null)}
                />
              ) : monthKeys.length === 0 ? (
                <div className="rounded-[20px] border border-line bg-surface p-10 text-center shadow-card">
                  <CircleDollarSign className="mx-auto h-10 w-10 text-ink-mute mb-3" />
                  <p className="text-sm text-ink-soft">
                    No income rows for {year} yet. Transactions need a closing date and a Team
                    Steady agent to appear here.
                  </p>
                </div>
              ) : (
                monthKeys.map((mk) => (
                  <MonthSection
                    key={mk}
                    monthKey={mk}
                    rows={byMonth.get(mk) ?? []}
                    togglingId={togglingId}
                    onTogglePaid={togglePaid}
                    expanded={expandedMonths.has(mk)}
                    onToggleExpanded={() =>
                      setExpandedMonths((prev) => {
                        const next = new Set(prev);
                        if (next.has(mk)) next.delete(mk);
                        else next.add(mk);
                        return next;
                      })
                    }
                  />
                ))
              )}
            </div>

            <aside className="space-y-4 min-w-0 xl:sticky xl:top-6 xl:self-start">
              <div className="rounded-[20px] border border-line bg-surface p-5 shadow-card">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4 text-brand" />
                  <h3 className="text-sm font-semibold text-ink">Projection details</h3>
                </div>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">Projected team income</dt>
                    <dd className="font-medium text-ink tabular-nums">
                      {formatCurrency(summary.teamIncomeProjected)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">Your deals (on books)</dt>
                    <dd className="font-medium text-ink tabular-nums">
                      {formatCurrency(summary.projectedPersonalIncome)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">Awaiting payment</dt>
                    <dd className="font-medium text-ink tabular-nums">
                      {formatCurrency(summary.awaitingPaymentAmount)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">Team booked (no forecast)</dt>
                    <dd className="font-medium text-ink tabular-nums">
                      {formatCurrency(summary.teamIncomeFromKnown)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">Team forecast add-on</dt>
                    <dd className="font-medium text-ink tabular-nums">
                      {formatCurrency(summary.projectedTeamFromRunRate)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">Avg payout per deal</dt>
                    <dd className="font-medium text-ink tabular-nums">
                      {formatCurrency(summary.avgPayoutPerDeal)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">Deals per month</dt>
                    <dd className="font-medium text-ink tabular-nums">
                      {summary.dealsPerMonth.toFixed(1)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs text-ink-mute leading-relaxed">
                  Projected year total = projected team income (YTD pace at $50/side +
                  $5k/mo base) plus your personal deals already on the tracker — no
                  forecast of additional personal deals.
                </p>
              </div>

              <div className="rounded-[20px] border border-line bg-surface p-5 shadow-card">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="h-4 w-4 text-brand" />
                  <h3 className="text-sm font-semibold text-ink">Deals by agent · {year}</h3>
                </div>
                {summary.agentCounts.length === 0 ? (
                  <p className="text-xs text-ink-mute">No deals yet this year.</p>
                ) : (
                  <ul className="space-y-1">
                    {summary.agentCounts.map((a) => {
                      const active = selectedAgent === a.agentName;
                      return (
                        <li key={a.agentId}>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedAgent((prev) =>
                                prev === a.agentName ? null : a.agentName
                              )
                            }
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm transition-colors",
                              active
                                ? "bg-brand/15 text-brand"
                                : "hover:bg-canvas/80 text-ink-soft hover:text-ink"
                            )}
                          >
                            <span className="truncate font-medium">{a.agentName}</span>
                            <span
                              className={cn(
                                "font-semibold tabular-nums shrink-0",
                                active ? "text-brand" : "text-ink"
                              )}
                            >
                              {a.count}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {selectedAgent ? (
                  <p className="mt-3 text-xs text-ink-mute">
                    Viewing {selectedAgent}&apos;s deals. Click the name again or use Back to
                    return.
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-ink-mute">
                    Click an agent to view their deals. Dual-side closings count as 2.
                  </p>
                )}
              </div>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
