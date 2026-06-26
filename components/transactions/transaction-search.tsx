"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type TransactionSearchProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function TransactionSearch({
  value,
  onChange,
  className,
}: TransactionSearchProps) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink-mute"
        strokeWidth={2}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by address"
        aria-label="Search transactions by address"
        className="w-full h-11 rounded-[14px] border border-line bg-surface pl-10 pr-10 text-[15px] text-ink placeholder:text-ink-mute shadow-card transition-[box-shadow,border-color] focus:outline-none focus:border-brand/30 focus:ring-[3px] focus:ring-brand/10"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-ink-mute transition-colors hover:bg-line/60 hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
