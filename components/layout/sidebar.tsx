"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CircleDollarSign,
  FileStack,
  LayoutDashboard,
  LogOut,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: FileStack },
  { href: "/income", label: "Income", icon: CircleDollarSign },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      await fetch("/api/auth/logout", { method: "POST" });
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-line bg-rail transition-[width] duration-200 ease-out",
        "w-[68px] xl:w-[216px]"
      )}
    >
      {/* Brand */}
      <div className="flex items-center justify-center px-2.5 pt-5 pb-5 xl:justify-start xl:px-4">
        <img
          src="/handled-logo.png"
          alt="Handled"
          className="block h-7 w-7 object-contain object-left xl:h-8 xl:w-auto"
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-2 xl:px-3">
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
              title={item.label}
              aria-label={item.label}
              className={cn(
                "flex items-center justify-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors",
                "px-0 xl:justify-start xl:px-3",
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
              <span className="hidden xl:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="mt-auto border-t border-line p-2 xl:p-3">
        <button
          type="button"
          title="Sign out"
          onClick={() => void signOut()}
          className={cn(
            "flex w-full items-center rounded-xl py-2 text-left transition-colors hover:bg-line/60",
            "justify-center px-0 xl:justify-start xl:gap-3 xl:px-2 text-ink-soft hover:text-ink"
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-line/80">
            <LogOut className="h-4 w-4 text-ink-mute" aria-hidden />
          </div>
          <div className="hidden min-w-0 leading-tight xl:block">
            <p className="truncate text-[13px] font-semibold text-ink">Sign out</p>
            <p className="truncate text-[11px] text-ink-mute">End session</p>
          </div>
        </button>
      </div>
    </aside>
  );
}
