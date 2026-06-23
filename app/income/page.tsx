import { AppShell } from "@/components/layout/app-shell";
import { IncomeTrackerView } from "@/components/income/income-tracker";

export default function IncomePage() {
  return (
    <AppShell>
      <main className="p-6 md:p-8">
        <IncomeTrackerView />
      </main>
    </AppShell>
  );
}
