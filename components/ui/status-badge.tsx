import { statusConfig, type StatusTone, type TransactionStatus } from "@/lib/transaction-status";
import { cn } from "@/lib/utils";

const toneStyles: Record<StatusTone, { pill: string; dot: string; text: string }> = {
  good: {
    pill: "bg-good text-good-ink",
    dot: "bg-good-ink",
    text: "text-good-ink",
  },
  warn: {
    pill: "bg-warn text-warn-ink",
    dot: "bg-warn-ink",
    text: "text-warn-ink",
  },
  neutral: {
    pill: "bg-line text-ink-soft",
    dot: "bg-ink-mute",
    text: "text-ink-soft",
  },
};

type StatusBadgeProps = {
  status: TransactionStatus;
  /** "pill" = solid tinted pill with dot (default, works on light surfaces and image overlays)
   *  "inline" = dot + text, no background (for compact rows) */
  variant?: "pill" | "inline";
  className?: string;
};

export function StatusBadge({ status, variant = "pill", className }: StatusBadgeProps) {
  const { label, tone } = statusConfig[status];
  const styles = toneStyles[tone];

  if (variant === "inline") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", styles.text, className)}>
        <span className={cn("h-1.5 w-1.5 rounded-full", styles.dot)} />
        {label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        styles.pill,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", styles.dot)} />
      {label}
    </span>
  );
}
