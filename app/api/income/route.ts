import { type CommissionResult } from "@/lib/commission";
import {
  buildIncomeRows,
  computeIncomeSummary,
  type TransactionIncomeInput,
} from "@/lib/income-tracker";
import {
  ensure2026PaidKeysSeeded,
  loadIncomeTrackerState,
  loadPaidKeys,
  manualEntriesForYear,
  saveCloseDateOverride,
  savePaidKeys,
} from "@/lib/income-store";
import {
  isHandledIncomeRowId,
  isIsoCloseDate,
  updateHandledTransactionCloseDate,
} from "@/lib/income-close-date";
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

    const [inputs, trackerState] = await Promise.all([
      loadTransactionInputs(),
      loadIncomeTrackerState(),
    ]);

    const manualEntries = manualEntriesForYear(year);
    const rows = buildIncomeRows(
      inputs,
      trackerState.keys,
      year,
      manualEntries,
      trackerState.closeDateOverrides
    );
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
      paidKeysWritable: trackerState.writable,
      warning: trackerState.writable
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
    const { id, paid, closeDate } = body as {
      id?: string;
      paid?: boolean;
      closeDate?: string;
    };

    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const hasPaid = typeof paid === "boolean";
    const hasCloseDate = typeof closeDate === "string";

    if (!hasPaid && !hasCloseDate) {
      return Response.json(
        { error: "paid and/or closeDate is required" },
        { status: 400 }
      );
    }

    if (hasCloseDate) {
      if (!isIsoCloseDate(closeDate)) {
        return Response.json({ error: "Invalid closeDate" }, { status: 400 });
      }
      if (id.startsWith("base-pay-")) {
        return Response.json({ error: "Cannot edit base pay close date" }, { status: 400 });
      }

      if (isHandledIncomeRowId(id)) {
        await updateHandledTransactionCloseDate(id, closeDate);
      } else {
        const trackerState = await loadIncomeTrackerState();
        if (!trackerState.writable) {
          return Response.json(
            {
              error:
                "Cannot save close date — run supabase-income-tracker-fix.sql in Supabase SQL Editor.",
            },
            { status: 503 }
          );
        }
        await saveCloseDateOverride(id, closeDate, trackerState.closeDateOverrides);
      }
    }

    if (hasPaid) {
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
    }

    return Response.json({
      success: true,
      id,
      ...(hasPaid ? { paid } : {}),
      ...(hasCloseDate ? { closeDate } : {}),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update income row" },
      { status: 500 }
    );
  }
}
