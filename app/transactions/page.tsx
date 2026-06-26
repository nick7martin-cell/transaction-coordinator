"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { TopBar } from "@/components/layout/top-bar";
import { TransactionCard } from "@/components/transactions/transaction-card";
import { PropertyAddressLabel } from "@/components/transactions/property-address-label";
import { TransactionSearch } from "@/components/transactions/transaction-search";
import { UploadZone } from "@/components/upload/upload-zone";
import { PropertyImage } from "@/components/ui/property-image";
import {
  daysUntilClosing,
  formatCurrency,
  formatDate,
  matchesPropertyAddressSearch,
} from "@/lib/format";
import { propertyImageSrc } from "@/lib/property-image";
import { matchesFilter, type TransactionFilter } from "@/lib/transaction-status";
import { resolveStatus } from "@/lib/transaction-lifecycle";
import { usePropertyPhotoSync } from "@/lib/use-property-photo-sync";
import { coerceExtractedData, type Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LayoutGrid, List, Loader2, Plus } from "lucide-react";

const filters: { id: TransactionFilter; label: string }[] = [
  { id: "all", label: "All Active" },
  { id: "needs_review", label: "Needs Review" },
  { id: "closed", label: "Closed" },
  { id: "cancelled", label: "Cancelled" },
];

type ViewMode = "grid" | "list";

const LIST_ROW_GRID =
  "grid grid-cols-[48px_minmax(0,2fr)_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)] gap-x-4 items-center px-5";

function sortByClosingDate(a: Transaction, b: Transaction): number {
  const da = a.extracted_data.closingDate;
  const db = b.extracted_data.closingDate;
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return new Date(da + "T12:00:00").getTime() - new Date(db + "T12:00:00").getTime();
}

function daysToCloseLabel(transaction: Transaction, days: number | null): string {
  const persisted = resolveStatus(transaction);
  if (persisted === "cancelled") return "Cancelled";
  if (persisted === "closed") return "Closed";
  if (days == null) return "—";
  if (days < 0) return "Closed";
  if (days === 0) return "0 days";
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<TransactionFilter>("all");
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [agentFilter, setAgentFilter] = useState("");

  const loadTransactions = useCallback(async () => {
    try {
      const res = await fetch("/api/transactions");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load transactions");
        return;
      }
      setTransactions(data.transactions);
      setError(null);
    } catch {
      setError("Could not load transactions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  usePropertyPhotoSync(setTransactions);

  const counts = useMemo(
    () => ({
      all: transactions.filter((t) => matchesFilter(t, "all")).length,
      needs_review: transactions.filter((t) => matchesFilter(t, "needs_review"))
        .length,
      closed: transactions.filter((t) => matchesFilter(t, "closed")).length,
      cancelled: transactions.filter((t) => matchesFilter(t, "cancelled"))
        .length,
    }),
    [transactions]
  );

  const agentOptions = useMemo(() => {
    const names = new Set<string>();
    for (const t of transactions) {
      if (!matchesFilter(t, activeFilter)) continue;
      if (!matchesPropertyAddressSearch(t.extracted_data.propertyAddress, search)) continue;
      const name = t.teamSteadyAgentName?.trim();
      if (name) names.add(name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [transactions, activeFilter, search]);

  useEffect(() => {
    if (agentFilter && !agentOptions.includes(agentFilter)) {
      setAgentFilter("");
    }
  }, [agentFilter, agentOptions]);

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => {
        if (!matchesFilter(t, activeFilter)) return false;
        if (agentFilter && (t.teamSteadyAgentName?.trim() ?? "") !== agentFilter) {
          return false;
        }
        return matchesPropertyAddressSearch(t.extracted_data.propertyAddress, search);
      })
      .sort(sortByClosingDate);
  }, [transactions, activeFilter, search, agentFilter]);

  return (
    <AppShell topBar={<TopBar showSearch={false} />}>
      <main className="p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-7">
          <div>
            <h1 className="text-[30px] leading-tight font-semibold text-ink tracking-tight">
              Transactions
            </h1>
            <p className="text-[15px] text-ink-soft mt-1.5 max-w-lg">
              Manage and monitor every ongoing real estate transaction.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="inline-flex rounded-xl border border-line bg-surface p-1">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="Card view"
                className={cn(
                  "inline-flex items-center justify-center h-9 w-9 rounded-lg transition-colors",
                  viewMode === "grid"
                    ? "bg-brand text-white"
                    : "text-ink-mute hover:text-ink"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-label="List view"
                className={cn(
                  "inline-flex items-center justify-center h-9 w-9 rounded-lg transition-colors",
                  viewMode === "list"
                    ? "bg-brand text-white"
                    : "text-ink-mute hover:text-ink"
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowUpload((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 h-11 text-sm font-semibold text-white shadow-card transition-colors hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" />
              Quick upload
            </button>
          </div>
        </div>

        {showUpload && (
          <div className="mb-8 max-w-2xl">
            <UploadZone
              onSuccess={() => {
                loadTransactions();
                setShowUpload(false);
              }}
            />
          </div>
        )}

        <div className="mb-7 space-y-4">
          <TransactionSearch
            value={search}
            onChange={setSearch}
            className="w-full max-w-md"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors border",
                  activeFilter === f.id
                    ? "bg-brand text-white border-brand"
                    : "bg-surface text-ink-soft border-line hover:border-ink-mute/40 hover:text-ink"
                )}
              >
                {f.label}{" "}
                <span
                  className={cn(
                    "tabular-nums",
                    activeFilter === f.id ? "text-white/70" : "text-ink-mute"
                  )}
                >
                  ({counts[f.id]})
                </span>
              </button>
            ))}
          </div>
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            aria-label="Filter by agent"
            className={cn(
              "shrink-0 max-w-[14rem] truncate rounded-full border px-4 py-2 text-sm font-medium transition-colors cursor-pointer focus:outline-none",
              agentFilter
                ? "bg-brand text-white border-brand"
                : "bg-surface text-ink-soft border-line hover:border-ink-mute/40 hover:text-ink"
            )}
          >
            <option value="">All Agents</option>
            {agentOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-ink-mute">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-danger bg-danger/40 px-5 py-4 text-sm text-danger-ink">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="rounded-[20px] border border-dashed border-line bg-surface px-8 py-14 text-center shadow-card">
            <p className="font-semibold text-ink">No matching transactions</p>
            <p className="text-sm text-ink-soft mt-1">
              {search.trim() ? (
                <>
                  No addresses match &ldquo;{search.trim()}&rdquo;.{" "}
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="text-ink font-semibold underline"
                  >
                    Clear search
                  </button>
                  .
                </>
              ) : (
                <>
                  Try a different filter or{" "}
                  <Link href="/" className="text-ink font-semibold underline">
                    upload a new agreement
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && viewMode === "grid" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((transaction) => (
                <TransactionCard
                  key={transaction.id}
                  transaction={transaction}
                  variant="grid"
                  agentName={transaction.teamSteadyAgentName}
                />
              ))}
            </div>
            <p className="text-center text-sm text-ink-mute mt-8">
              Showing {filtered.length} transaction
              {filtered.length !== 1 ? "s" : ""}
            </p>
          </>
        )}

        {!loading && !error && filtered.length > 0 && viewMode === "list" && (
          <>
            <div className="rounded-[20px] border border-line bg-surface shadow-card overflow-hidden">
              <div
                className={cn(
                  LIST_ROW_GRID,
                  "py-2.5 border-b border-line bg-canvas/60"
                )}
              >
                <span aria-hidden="true" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
                  Address
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
                  Agent
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
                  Price
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
                  Close Date
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
                  Days to Close
                </span>
              </div>
              {filtered.map((transaction, index) => {
                const data = coerceExtractedData(transaction.extracted_data);
                const days = daysUntilClosing(data.closingDate);
                const seed = data.propertyAddress || transaction.id;
                const imageSrc = propertyImageSrc(
                  transaction.propertyPhotoUrl,
                  data.propertyAddress,
                  "96x96"
                );

                return (
                  <Link
                    key={transaction.id}
                    href={`/transactions/${transaction.id}`}
                    className={cn(
                      LIST_ROW_GRID,
                      "py-3 transition-colors hover:bg-canvas",
                      index > 0 && "border-t border-line"
                    )}
                  >
                    <PropertyImage
                      seed={seed}
                      src={imageSrc}
                      className="h-12 w-12 shrink-0 rounded-lg"
                      iconSize={18}
                    />
                    <PropertyAddressLabel
                      address={data.propertyAddress}
                      streetClassName="text-sm"
                      cityClassName="text-xs"
                    />
                    <p className="min-w-0 text-sm text-ink-soft truncate">
                      {transaction.teamSteadyAgentName ?? ""}
                    </p>
                    <p className="text-sm font-semibold text-ink tabular-nums">
                      {formatCurrency(data.purchasePrice)}
                    </p>
                    <p className="text-sm text-ink-soft">
                      {formatDate(data.closingDate)}
                    </p>
                    <p className="text-sm font-medium text-ink tabular-nums">
                      {daysToCloseLabel(transaction, days)}
                    </p>
                    <span className="sr-only">View transaction</span>
                  </Link>
                );
              })}
            </div>
            <p className="text-center text-sm text-ink-mute mt-8">
              Showing {filtered.length} transaction
              {filtered.length !== 1 ? "s" : ""}
            </p>
          </>
        )}
      </main>
    </AppShell>
  );
}
