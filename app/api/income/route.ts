import { type CommissionResult } from "@/lib/commission";
import {
  buildIncomeRows,
  computeIncomeSummary,
  type TransactionIncomeInput,
} from "@/lib/income-tracker";
import {
  ensure2026PaidKeysSeeded,
  loadPaidKeys,
  manualEntriesForYear,
  savePaidKeys,
} from "@/lib/income-store";
import { supabase } from "@/lib/supabase";
import { normalizeTransactionRow } from "@/lib/transaction-lifecycle";
import {
  coerceExtractedData,
  type Transaction,
  type TransactionParty,
} from "@/lib/types";

async function loadTransactionInputs(): Promise<TransactionIncomeInput[]> {
  const [{ data: extractions, error: extError }, { data: metaRows, error: metaError }] =
    await Promise.all([
      supabase.from("extractions").select("*").order("created_at", { ascending: false }),
      supabase.from("transaction_meta").select("transaction_id, commission, worksheet"),
    ]);

  if (extError) throw new Error(extError.message);
  if (metaError) throw new Error(metaError.message);

  const metaById = new Map(
    (metaRows ?? []).map((row) => [row.transaction_id as string, row])
  );

  return (extractions ?? []).map((row) => {
    const transaction = normalizeTransactionRow(row) as Transaction;
    const meta = metaById.get(transaction.id);
    const ws = (meta?.worksheet ?? {}) as Record<string, unknown>;
    const parties = Array.isArray(ws._parties)
      ? (ws._parties as TransactionParty[])
      : [];
    return {
      transaction,
      commission: (meta?.commission as CommissionResult | null) ?? null,
      parties,
    };
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const yearParam = searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  if (!Number.isFinite(year)) {
    return Response.json({ error: "Invalid year" }, { status: 400 });
  }

  try {
    if (year === 2026) {
      await ensure2026PaidKeysSeeded();
    }

    const [inputs, paidState] = await Promise.all([
      loadTransactionInputs(),
      loadPaidKeys(),
    ]);

    const manualEntries = manualEntriesForYear(year);
    const rows = buildIncomeRows(inputs, paidState.keys, year, manualEntries);
    const summary = computeIncomeSummary(rows, year);

    const availableYears = new Set<number>([new Date().getFullYear(), 2026]);
    for (const input of inputs) {
      const close = coerceExtractedData(input.transaction.extracted_data).closingDate;
      if (close) availableYears.add(parseInt(close.slice(0, 4), 10));
    }

    return Response.json({
      year,
      rows,
      summary,
      availableYears: [...availableYears].sort((a, b) => b - a),
      manualEntryCount: manualEntries.length,
      paidKeysWritable: paidState.writable,
      warning: paidState.writable
        ? undefined
        : "Paid toggles won't save until you run supabase-income-tracker-fix.sql in Supabase.",
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load income data" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, paid } = body as { id?: string; paid?: boolean };

    if (!id || typeof paid !== "boolean") {
      return Response.json({ error: "id and paid are required" }, { status: 400 });
    }

    const paidState = await loadPaidKeys();
    if (!paidState.writable) {
      return Response.json(
        {
          error:
            "Cannot save paid status — run supabase-income-tracker-fix.sql in Supabase SQL Editor.",
        },
        { status: 503 }
      );
    }
    if (paid) paidState.keys.add(id);
    else paidState.keys.delete(id);
    await savePaidKeys(paidState.keys);

    return Response.json({ success: true, id, paid });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update paid status" },
      { status: 500 }
    );
  }
}
