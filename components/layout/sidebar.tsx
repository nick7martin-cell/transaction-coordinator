"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleDollarSign,
  FileStack,
  LayoutDashboard,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: FileStack },
  { href: "/income", label: "Income", icon: CircleDollarSign },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-rail">
      {/* Brand */}
      <div className="flex items-center px-5 pt-6 pb-6">
        <img
          src="/handled-logo.png"
          alt="Handled"
          className="block h-9 w-auto"
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.href.includes("#")
              ? false
              : item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand text-white shadow-card"
                  : "text-ink-soft hover:bg-line/60 hover:text-ink"
              )}
            >
              <item.icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0",
                  isActive ? "text-white" : "text-ink-mute"
                )}
                strokeWidth={2}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Profile anchored at bottom */}
      <div className="mt-auto border-t border-line p-3">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-line/60"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white shrink-0">
            TC
          </div>
          <div className="min-w-0 leading-tight">
            <p className="text-[13px] font-semibold text-ink truncate">Coordinator</p>
            <p className="text-[11px] text-ink-mute truncate">View profile</p>
          </div>
        </button>
      </div>
    </aside>
  );
}
