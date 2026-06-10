import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AgentsSection } from "@/components/settings/agents-section";
import { ContactsSection } from "@/components/settings/contacts-section";
import { GmailSection } from "@/components/settings/gmail-section";

export default function SettingsPage() {
  return (
    <AppShell>
      <main className="p-6 md:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage agent rosters, splits, and preferred contacts used across all transactions.
          </p>
        </div>

        <div className="space-y-8">
          <Suspense fallback={null}>
            <GmailSection />
          </Suspense>
          <AgentsSection />
          <ContactsSection />
        </div>
      </main>
    </AppShell>
  );
}
