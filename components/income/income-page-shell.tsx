"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { TopBar } from "@/components/layout/top-bar";
import { IncomeTrackerView } from "@/components/income/income-tracker";

export function IncomePageShell() {
  const [search, setSearch] = useState("");

  return (
    <AppShell
      topBar={
        <TopBar
          searchValue={search}
          onSearch={setSearch}
          searchPlaceholder="Search income by address..."
        />
      }
    >
      <main className="p-4 sm:p-6 md:p-8 min-w-0">
        <IncomeTrackerView addressSearch={search} />
      </main>
    </AppShell>
  );
}
