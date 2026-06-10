"use client";

import { Bell, Search } from "lucide-react";

type TopBarProps = {
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  searchValue?: string;
};

export function TopBar({
  searchPlaceholder = "Search transactions, addresses, parties...",
  onSearch,
  searchValue = "",
}: TopBarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 px-6 md:px-8">
      <div className="relative max-w-sm w-full">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearch?.(e.target.value)}
          className="w-full h-10 rounded-xl border border-line bg-surface pl-10 pr-4 text-sm text-ink placeholder:text-ink-mute shadow-card focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-line"
        />
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-ink-soft shadow-card hover:text-ink transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
          TC
        </div>
      </div>
    </header>
  );
}
