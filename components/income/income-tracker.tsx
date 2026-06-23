"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  formatMonthLabel,
  groupRowsByMonth,
  monthPaidTotal,
  monthTotal,
  type IncomeRow,
  type IncomeSummary,
} from "@/lib/income-tracker";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronLeft,
  ChevronRight,
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
      <p className="mt-2 text-[28px] font-semibold text-ink tabular-nums leading-none">
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
}: {
  paid: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
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

function MonthSection({
  monthKey,
  rows,
  togglingId,
  onTogglePaid,
}: {
  monthKey: string;
  rows: IncomeRow[];
  togglingId: string | null;
  onTogglePaid: (id: string, paid: boolean) => void;
}) {
  const total = monthTotal(rows);
  const paidTotal = monthPaidTotal(rows);
  const allPaid = rows.every((r) => r.paid);

  return (
    <section className="rounded-[20px] border border-line bg-surface shadow-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 bg-canvas/60">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">{formatMonthLabel(monthKey)}</h2>
          <p className="text-xs text-ink-mute mt-0.5">
            {formatCurrency(total)} total · {formatCurrency(paidTotal)} paid
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold",
            allPaid ? "bg-good/50 text-good-ink" : "bg-warn/50 text-warn-ink"
          )}
        >
          {allPaid ? "All paid" : "Outstanding balance"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
              <th className="px-5 py-3 w-[110px]">Close</th>
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
                <td className="px-5 py-3.5">
                  {row.transactionId ? (
                    <Link
                      href={`/transactions/${row.transactionId}`}
                      className={cn(
                        "font-medium hover:text-brand transition-colors",
                        row.isBasePay ? "text-ink uppercase tracking-wide" : "text-ink"
                      )}
                    >
                      {row.address}
                    </Link>
                  ) : (
                    <span className="font-semibold text-ink uppercase tracking-wide">
                      {row.address}
                    </span>
                  )}
                  {row.isNickDeal && !row.isBasePay ? (
                    <span className="ml-2 text-[10px] font-semibold uppercase text-ink-mute">
                      Your deal
                    </span>
                  ) : null}
                </td>
                <td className="px-5 py-3.5 text-right font-semibold text-ink tabular-nums">
                  {formatCurrency(row.amount)}
                </td>
                <td className="px-5 py-3.5 text-ink-soft">{row.agentLabel}</td>
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
              <td className="px-5 py-3" colSpan={2}>
                Month total
              </td>
              <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(total)}</td>
              <td className="px-5 py-3" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export function IncomeTrackerView() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<IncomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

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
          summary: {
            ...prev.summary,
            ytdPaid: rows.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0),
          },
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

  const monthKeys = useMemo(
    () => [...byMonth.keys()].sort(),
    [byMonth]
  );

  const summary = data?.summary;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold text-ink tracking-tight">Income</h1>
          <p className="mt-1 text-sm text-ink-soft max-w-xl">
            Track coordinator payouts by close date. Base pay ($5,000/mo) is added from
            June 2026 onward. Mark rows paid when deposits hit your account.
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Year-to-date earned"
              value={formatCurrency(summary.ytdEarned)}
              hint="Closed deals + base pay (from June) through today"
              accent="brand"
            />
            <SummaryCard
              label="Year-to-date paid"
              value={formatCurrency(summary.ytdPaid)}
              hint="Rows you've marked as paid"
              accent="good"
            />
            <SummaryCard
              label="Under contract"
              value={formatCurrency(summary.pipelineAmount)}
              hint={`${summary.pipelineCount} deal${summary.pipelineCount === 1 ? "" : "s"} not yet closed`}
              accent="warn"
            />
            <SummaryCard
              label="Projected year total"
              value={formatCurrency(summary.projectedYearTotal)}
              hint="Closed deals + scheduled closings + full-year base pay (Jun–Dec)"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="space-y-6">
              {monthKeys.length === 0 ? (
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
                  />
                ))
              )}
            </div>

            <aside className="space-y-4">
              <div className="rounded-[20px] border border-line bg-surface p-5 shadow-card">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4 text-brand" />
                  <h3 className="text-sm font-semibold text-ink">Projection details</h3>
                </div>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">Pipeline (known)</dt>
                    <dd className="font-medium text-ink tabular-nums">
                      {formatCurrency(summary.projectedFromPipeline)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">Run-rate upside</dt>
                    <dd className="font-medium text-ink tabular-nums">
                      {formatCurrency(summary.projectedFromRunRate)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">Avg standard deal</dt>
                    <dd className="font-medium text-ink tabular-nums">
                      {formatCurrency(summary.avgStandardDeal)}
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
                  Year total counts closed deals, scheduled future closings, and base pay
                  (Jun–Dec). Run-rate upside is extra if pace continues — not added to the
                  total above.
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
                  <ul className="space-y-2">
                    {summary.agentCounts.map((a) => (
                      <li
                        key={a.agentId}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="text-ink-soft truncate">{a.agentName}</span>
                        <span className="font-semibold text-ink tabular-nums shrink-0">
                          {a.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
