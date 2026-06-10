import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

type AppShellProps = {
  children: React.ReactNode;
  topBar?: React.ReactNode;
};

export function AppShell({ children, topBar }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        {topBar ?? <TopBar />}
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
