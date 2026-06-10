import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PropertyImage } from "@/components/ui/property-image";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  daysUntilClosing,
  formatCurrency,
  formatDate,
} from "@/lib/format";
import { propertyImageSrc } from "@/lib/property-image";
import { getTransactionStatus } from "@/lib/transaction-status";
import { coerceExtractedData, type Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

type TransactionCardProps = {
  transaction: Transaction;
  variant?: "dashboard" | "grid";
  /** Dashboard only: Team Steady agent from transaction_meta.commission */
  agentName?: string | null;
};

export function TransactionCard({
  transaction,
  variant = "dashboard",
  agentName,
}: TransactionCardProps) {
  const data = coerceExtractedData(transaction.extracted_data);
  const days = daysUntilClosing(data.closingDate);
  const status = getTransactionStatus(transaction);
  const seed = data.propertyAddress || transaction.id;
  const address = data.propertyAddress || "Address pending";
  const imageSrc = propertyImageSrc(transaction.propertyPhotoUrl, data.propertyAddress, "600x400");

  const daysLabel =
    days == null ? "—" : days < 0 ? "Closed" : `${days} day${days === 1 ? "" : "s"}`;

  return (
    <Link
      href={`/transactions/${transaction.id}`}
      className={cn(
        "group flex flex-col rounded-[20px] bg-surface border border-line shadow-card overflow-hidden transition-shadow hover:shadow-card-hover",
        variant === "dashboard" && "w-[300px] shrink-0"
      )}
    >
      {/* Property image with status pill overlay */}
      <div className="relative">
        <PropertyImage seed={seed} src={imageSrc} className="h-40 w-full" iconSize={40} />
        <div className="absolute left-3 top-3">
          <StatusBadge status={status} variant="pill" />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-[16px] font-semibold text-ink leading-snug line-clamp-1">
          {address}
        </h3>
        {agentName ? (
          <p className="mt-0.5 text-[13px] text-ink-mute">{agentName}</p>
        ) : null}

        {/* Price + closing date row */}
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-mute">
              Price
            </p>
            <p className="mt-0.5 text-[17px] font-semibold text-ink tabular-nums">
              {formatCurrency(data.purchasePrice)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-mute">
              Closing
            </p>
            <p className="mt-0.5 text-[15px] font-medium text-ink-soft">
              {formatDate(data.closingDate)}
            </p>
          </div>
        </div>

        {/* Days-to-close footer + circular arrow */}
        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold text-ink tabular-nums">
              {daysLabel}
            </span>
            {days != null && days >= 0 && (
              <span className="text-[12px] text-ink-mute">to close</span>
            )}
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white transition-transform group-hover:-translate-y-0.5">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
