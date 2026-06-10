"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ExtractionDetail } from "@/components/transactions/extraction-detail";
import type { Transaction } from "@/lib/types";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function TransactionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/transactions/${id}`);
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Transaction not found"); return; }
        setTransaction(data.transaction);
      } catch {
        setError("Could not load transaction");
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id]);

  return (
    <AppShell>
      <main className="p-6 md:p-8">
        <div className="mb-6">
          <Link
            href="/transactions"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to transactions
          </Link>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24 text-ink-mute">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading transaction…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-danger bg-danger/40 px-5 py-4 text-sm text-danger-ink">
            {error}
          </div>
        )}

        {transaction && !loading && (
          <ExtractionDetail
            transaction={transaction}
            onTransactionChange={setTransaction}
          />
        )}
      </main>
    </AppShell>
  );
}
