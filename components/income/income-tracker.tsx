"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  computeIncomeSummary,
  defaultExpandedMonthKeys,
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
import { incomeRowWithCloseDate } from "@/lib/income-close-date";
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
  className,
}: {
  paid: boolean;
  disabled?: boolean;
  onToggle: () => void;
  compact?: boolean;
  className?: string;
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
            : "text-ink-mute hover:text-ink hover:bg-line/40",
          className
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
        "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 h-9 text-xs font-semibold transition-colors disabled:opacity-50",
        paid
          ? "bg-good text-good-ink hover:bg-good/80"
          : "bg-warn/80 text-warn-ink hover:bg-warn",
        className
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
    <div className="flex items-center justify-between gap-4 border-t border-line/40 px-4 py-2 xl:px-5">
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

function DealAddress({ row }: { row: IncomeRow }) {
  const linkedClassName =
    "block min-w-0 truncate font-medium text-brand underline-offset-2 hover:underline transition-colors";
  const plainClassName = "block min-w-0 truncate font-medium text-ink";

  return (
    <div className="flex min-w-0 items-baseline gap-2 overflow-hidden">
      {row.transactionId ? (
        <Link
          href={`/transactions/${row.transactionId}`}
          className={linkedClassName}
          title={`Open ${row.address} in Handled`}
        >
          {row.address}
        </Link>
      ) : (
        <span className={plainClassName} title={row.address}>
          {row.address}
        </span>
      )}
      {row.isNickDeal ? (
        <span className="shrink-0 text-[10px] font-semibold uppercase text-ink-mute">
          Your deal
        </span>
      ) : null}
    </div>
  );
}

function EditableCloseDate({
  row,
  saving,
  onSave,
  className,
}: {
  row: IncomeRow;
  saving: boolean;
  onSave: (id: string, closeDate: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(row.closeDate);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocal(row.closeDate);
  }, [row.closeDate, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    const next = inputRef.current?.value || local;
    setEditing(false);
    if (next && next !== row.closeDate) onSave(row.id, next);
  }

  if (row.isBasePay) {
    return (
      <time dateTime={row.closeDate} className={className}>
        {formatDate(row.closeDate)}
      </time>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={local}
        disabled={saving}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setLocal(row.closeDate);
            setEditing(false);
          }
        }}
        className={cn(
          "w-full max-w-[9.5rem] rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:opacity-50",
          className
        )}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={saving}
      onClick={() => setEditing(true)}
      className={cn(
        "text-left text-sm tabular-nums whitespace-nowrap transition-colors disabled:opacity-50",
        "text-ink-soft hover:text-brand hover:underline underline-offset-2",
        className
      )}
      title="Click to edit close date"
    >
      {formatDate(row.closeDate)}
    </button>
  );
}

function DealPropertyCell({ row }: { row: IncomeRow }) {
  return (
    <div className="min-w-0 overflow-hidden">
      <DealAddress row={row} />
    </div>
  );
}

/** Shared gap + proportional middle columns (property : agent ≈ 2.2 : 1.3). */
function dealTableGrid(showMonth: boolean) {
  return cn(
    "grid items-center gap-x-[clamp(0.625rem,1.25vw,1rem)]",
    showMonth
      ? "grid-cols-[6.75rem_3.25rem_minmax(0,2.2fr)_minmax(0,1.3fr)_5.5rem_minmax(6.75rem,auto)]"
      : "grid-cols-[6.75rem_minmax(0,2.2fr)_minmax(0,1.3fr)_5.5rem_minmax(6.75rem,auto)]"
  );
}

function DealAgentCell({ row }: { row: IncomeRow }) {
  return (
    <span className="block min-w-0 truncate text-sm text-ink-soft" title={row.agentLabel}>
      {row.agentLabel}
      {row.agentLabel.includes("Dual Side") ? (
        <span className="ml-1.5 text-[10px] font-semibold uppercase text-ink-mute">
          Both
        </span>
      ) : null}
    </span>
  );
}

function DealGridRow({
  row,
  togglingId,
  savingCloseDateId,
  onTogglePaid,
  onSaveCloseDate,
  showMonth,
}: {
  row: IncomeRow;
  togglingId: string | null;
  savingCloseDateId: string | null;
  onTogglePaid: (id: string, paid: boolean) => void;
  onSaveCloseDate: (id: string, closeDate: string) => void;
  showMonth: boolean;
}) {
  return (
    <div
      className={cn(
        dealTableGrid(showMonth),
        "border-b border-line/60 px-4 py-3 last:border-0 xl:px-5",
        row.paid ? "bg-good/15" : "bg-warn/10"
      )}
    >
      <EditableCloseDate
        row={row}
        saving={savingCloseDateId === row.id}
        onSave={onSaveCloseDate}
      />
      {showMonth ? (
        <span className="text-sm text-ink-soft whitespace-nowrap">
          {formatMonthLabel(row.monthKey).replace(/ \d{4}$/, "")}
        </span>
      ) : null}
      <DealPropertyCell row={row} />
      <DealAgentCell row={row} />
      <div className="text-right text-sm font-semibold tabular-nums whitespace-nowrap">
        <span className={row.amount === 0 ? "text-ink-mute" : "text-ink"}>
          {formatCurrency(row.amount)}
        </span>
        {row.amount === 0 ? (
          <span className="block text-[10px] font-medium text-ink-mute">No payout</span>
        ) : null}
      </div>
      <div className="flex justify-end">
        <PaidToggle
          paid={row.paid}
          disabled={togglingId === row.id}
          onToggle={() => onTogglePaid(row.id, !row.paid)}
          compact
          className="xl:hidden"
        />
        <PaidToggle
          paid={row.paid}
          disabled={togglingId === row.id}
          onToggle={() => onTogglePaid(row.id, !row.paid)}
          className="hidden xl:inline-flex"
        />
      </div>
    </div>
  );
}

function DealGridHeader({ showMonth }: { showMonth: boolean }) {
  return (
    <div
      className={cn(
        dealTableGrid(showMonth),
        "border-b border-line px-4 py-2.5 xl:px-5",
        "text-[11px] font-semibold uppercase tracking-wider text-ink-mute"
      )}
    >
      <span>Close</span>
      {showMonth ? <span>Month</span> : null}
      <span>Property</span>
      <span>Agent</span>
      <span className="text-right">Payout</span>
      <span className="text-right">Status</span>
    </div>
  );
}

function DealGridList({
  rows,
  togglingId,
  savingCloseDateId,
  onTogglePaid,
  onSaveCloseDate,
  showMonth = false,
  dealCount,
  total,
  basePayAmount,
}: {
  rows: IncomeRow[];
  togglingId: string | null;
  savingCloseDateId: string | null;
  onTogglePaid: (id: string, paid: boolean) => void;
  onSaveCloseDate: (id: string, closeDate: string) => void;
  showMonth?: boolean;
  dealCount: number;
  total: number;
  basePayAmount: number;
}) {
  return (
    <div className="hidden lg:block min-w-0">
      <DealGridHeader showMonth={showMonth} />

      {rows.map((row) => (
        <DealGridRow
          key={row.id}
          row={row}
          togglingId={togglingId}
          savingCloseDateId={savingCloseDateId}
          onTogglePaid={onTogglePaid}
          onSaveCloseDate={onSaveCloseDate}
          showMonth={showMonth}
        />
      ))}

      <div className="flex items-center justify-between gap-4 border-t border-line/40 bg-canvas/80 px-4 py-3 text-sm xl:px-5">
        <span className="font-normal text-ink-soft">
          {dealCount} transaction{dealCount === 1 ? "" : "s"}
          {basePayAmount > 0 ? (
            <span className="text-ink-mute"> · incl. base pay</span>
          ) : null}
        </span>
        <span className="font-semibold tabular-nums text-ink">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

function DealCardList({
  rows,
  togglingId,
  savingCloseDateId,
  onTogglePaid,
  onSaveCloseDate,
  showMonth = false,
}: {
  rows: IncomeRow[];
  togglingId: string | null;
  savingCloseDateId: string | null;
  onTogglePaid: (id: string, paid: boolean) => void;
  onSaveCloseDate: (id: string, closeDate: string) => void;
  showMonth?: boolean;
}) {
  return (
    <ul className="divide-y divide-line/60 lg:hidden">
      {rows.map((row) => (
        <li
          key={row.id}
          className={cn(
            "px-4 py-3.5",
            row.paid ? "bg-good/15" : "bg-warn/10"
          )}
        >
          <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start gap-x-[clamp(0.75rem,3vw,1.25rem)]">
            <div className="min-w-0 space-y-1">
              <DealAddress row={row} />
              <p className="truncate text-xs text-ink-soft">
                <EditableCloseDate
                  row={row}
                  saving={savingCloseDateId === row.id}
                  onSave={onSaveCloseDate}
                  className="inline text-xs"
                />
                {showMonth
                  ? ` · ${formatMonthLabel(row.monthKey).replace(/ \d{4}$/, "")}`
                  : null}
                <span className="text-ink-mute/50"> · </span>
                {row.agentLabel}
              </p>
            </div>
            <div className="flex min-w-0 flex-col items-end gap-2">
              <p
                className={cn(
                  "font-semibold tabular-nums whitespace-nowrap",
                  row.amount === 0 ? "text-ink-mute" : "text-ink"
                )}
              >
                {formatCurrency(row.amount)}
              </p>
              <PaidToggle
                paid={row.paid}
                disabled={togglingId === row.id}
                onToggle={() => onTogglePaid(row.id, !row.paid)}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DealTable({
  rows,
  togglingId,
  savingCloseDateId,
  onTogglePaid,
  onSaveCloseDate,
  showMonth = false,
  basePayAmount = 0,
}: {
  rows: IncomeRow[];
  togglingId: string | null;
  savingCloseDateId: string | null;
  onTogglePaid: (id: string, paid: boolean) => void;
  onSaveCloseDate: (id: string, closeDate: string) => void;
  showMonth?: boolean;
  basePayAmount?: number;
}) {
  const dealTotal = monthDealTotal(rows);
  const total = dealTotal + basePayAmount;
  const dealCount = monthDealCount(rows);

  if (dealCount === 0) return null;

  return (
    <>
      <DealCardList
        rows={rows}
        togglingId={togglingId}
        savingCloseDateId={savingCloseDateId}
        onTogglePaid={onTogglePaid}
        onSaveCloseDate={onSaveCloseDate}
        showMonth={showMonth}
      />

      <DealGridList
        rows={rows}
        togglingId={togglingId}
        savingCloseDateId={savingCloseDateId}
        onTogglePaid={onTogglePaid}
        onSaveCloseDate={onSaveCloseDate}
        showMonth={showMonth}
        dealCount={dealCount}
        total={total}
        basePayAmount={basePayAmount}
      />

      <div className="border-t border-line/60 bg-canvas/80 px-4 py-3 text-sm font-semibold text-ink lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink-soft font-normal">
            {dealCount} transaction{dealCount === 1 ? "" : "s"}
            {basePayAmount > 0 ? " · incl. base pay" : ""}
          </span>
          <span className="tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>
    </>
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
        ($60,000/yr). Your agent commission and team referral payouts are excluded from
        team income. Projected: {forecastDealHint(summary)}.
      </p>
    </div>
  );
}

function MonthSection({
  monthKey,
  rows,
  togglingId,
  savingCloseDateId,
  onTogglePaid,
  onSaveCloseDate,
  expanded,
  onToggleExpanded,
}: {
  monthKey: string;
  rows: IncomeRow[];
  togglingId: string | null;
  savingCloseDateId: string | null;
  onTogglePaid: (id: string, paid: boolean) => void;
  onSaveCloseDate: (id: string, closeDate: string) => void;
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
    <section className="min-w-0 overflow-hidden rounded-[20px] border border-line bg-surface shadow-card">
      <button
        type="button"
        onClick={onToggleExpanded}
        className={cn(
          "w-full bg-canvas/60 text-left transition-colors hover:bg-canvas/80",
          expanded && "border-b border-line"
        )}
        aria-expanded={expanded}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 py-4 xl:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-semibold tracking-tight text-ink">
                {formatMonthLabel(monthKey)}
              </h2>
              {dealCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft tabular-nums">
                  {dealCount}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-ink-mute tabular-nums">
              {formatCurrency(total)} total · {formatCurrency(paidTotal)} paid
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap",
                allPaid ? "bg-good/50 text-good-ink" : "bg-warn/50 text-warn-ink"
              )}
            >
              {allPaid ? "All paid" : (
                <>
                  <span className="md:hidden">Open</span>
                  <span className="hidden md:inline">Outstanding</span>
                </>
              )}
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
            savingCloseDateId={savingCloseDateId}
            onTogglePaid={onTogglePaid}
            onSaveCloseDate={onSaveCloseDate}
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
  savingCloseDateId,
  onTogglePaid,
  onSaveCloseDate,
  onBack,
}: {
  agentName: string;
  rows: IncomeRow[];
  year: number;
  togglingId: string | null;
  savingCloseDateId: string | null;
  onTogglePaid: (id: string, paid: boolean) => void;
  onSaveCloseDate: (id: string, closeDate: string) => void;
  onBack: () => void;
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const paidTotal = rows.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0);

  return (
    <section className="min-w-0 overflow-hidden rounded-[20px] border border-line bg-surface shadow-card">
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

      <DealTable
        rows={rows}
        togglingId={togglingId}
        savingCloseDateId={savingCloseDateId}
        onTogglePaid={onTogglePaid}
        onSaveCloseDate={onSaveCloseDate}
        showMonth
      />
    </section>
  );
}

export function IncomeTrackerView() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<IncomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [savingCloseDateId, setSavingCloseDateId] = useState<string | null>(null);
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

  const byMonth = useMemo(
    () => (data ? groupRowsByMonth(data.rows) : new Map<string, IncomeRow[]>()),
    [data]
  );


  useEffect(() => {
    setExpandedMonths(new Set());
  }, [year]);

  useEffect(() => {
    if (monthKeys.length === 0) return;
    setExpandedMonths((prev) =>
      prev.size === 0 ? defaultExpandedMonthKeys(monthKeys) : prev
    );
  }, [monthKeys]);

  async function saveCloseDate(id: string, closeDate: string) {
    setSavingCloseDateId(id);
    setError(null);

    setData((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((r) =>
        r.id === id ? incomeRowWithCloseDate(r, closeDate) : r
      );
      return {
        ...prev,
        rows,
        summary: computeIncomeSummary(rows, prev.year),
      };
    });

    const movedMonth = closeDate.slice(0, 7);
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      next.add(movedMonth);
      return next;
    });

    try {
      const res = await fetch("/api/income", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, closeDate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update close date");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update close date");
      await load();
    } finally {
      setSavingCloseDateId(null);
    }
  }

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

          <div className="grid gap-6 grid-cols-1 min-[1400px]:grid-cols-[minmax(0,1fr)_minmax(240px,300px)] min-w-0">
            <div className="space-y-6 min-w-0">
              {selectedAgent ? (
                <AgentDealsSection
                  agentName={selectedAgent}
                  rows={agentDeals}
                  year={year}
                  togglingId={togglingId}
                  savingCloseDateId={savingCloseDateId}
                  onTogglePaid={togglePaid}
                  onSaveCloseDate={saveCloseDate}
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
                    savingCloseDateId={savingCloseDateId}
                    onTogglePaid={togglePaid}
                    onSaveCloseDate={saveCloseDate}
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

            <aside className="space-y-4 min-w-0 min-[1400px]:sticky min-[1400px]:top-6 min-[1400px]:self-start">
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
