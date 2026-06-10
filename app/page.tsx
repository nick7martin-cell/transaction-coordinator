"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { TransactionCard } from "@/components/transactions/transaction-card";
import { UploadZone } from "@/components/upload/upload-zone";
import { isActiveTransaction } from "@/lib/transaction-lifecycle";
import { usePropertyPhotoSync } from "@/lib/use-property-photo-sync";
import type { Transaction } from "@/lib/types";
import { Loader2 } from "lucide-react";

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const activeTransactions = transactions.filter(isActiveTransaction);

  const recent = activeTransactions.slice(0, 8);

  return (
    <AppShell>
      <main className="p-6 md:p-8">
        <header className="mb-7">
          <h1 className="text-[30px] leading-tight font-semibold text-ink tracking-tight">
            Dashboard
          </h1>
          <p className="mt-1.5 text-[15px] text-ink-soft">
            Upload an agreement or jump back into a recent transaction.
          </p>
        </header>

        <UploadZone
          variant="dashboard"
          onSuccess={loadTransactions}
        />

        <section className="mt-10">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[18px] font-semibold text-ink tracking-tight">
              Recent transactions
            </h2>
            {activeTransactions.length > 0 && (
              <Link
                href="/transactions"
                className="text-sm font-semibold text-ink-soft hover:text-ink transition-colors"
              >
                View all
              </Link>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16 text-ink-mute">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading transactions…
            </div>
          )}

          {error && !loading && (
            <div className="rounded-xl border border-danger bg-danger/40 px-5 py-4 text-sm text-danger-ink">
              {error}
            </div>
          )}

          {!loading && !error && recent.length === 0 && (
            <div className="rounded-[20px] border border-dashed border-line bg-surface px-8 py-14 text-center shadow-card">
              <p className="font-semibold text-ink">No transactions yet</p>
              <p className="text-sm text-ink-soft mt-1 max-w-sm mx-auto">
                Upload a purchase agreement above to create your first
                transaction.
              </p>
            </div>
          )}

          {!loading && !error && recent.length > 0 && (
            <div className="flex gap-5 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-thin">
              {recent.map((transaction) => (
                <TransactionCard
                  key={transaction.id}
                  transaction={transaction}
                  variant="dashboard"
                  agentName={transaction.teamSteadyAgentName}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
