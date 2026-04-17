import { useEffect, useRef, useState } from "react";

import { Activity } from "./pages/Activity";
import { Dashboard } from "./pages/Dashboard";
import { Settings } from "./pages/Settings";
import { AppStateProvider, useAppState } from "./state/AppStateProvider";
import type { StartupPage } from "./backend/types";

type Page = StartupPage;

const pages: Array<{ id: Page; label: string; icon: IconName }> = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "activity", label: "Activity", icon: "activity" },
  { id: "settings", label: "Settings", icon: "settings" },
];

export function App() {
  return (
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
  );
}

function AppShell() {
  const { snapshot, error } = useAppState();
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const didApplyStartupPage = useRef(false);
  const compactMode = snapshot?.settings.compactMode ?? false;

  useEffect(() => {
    if (snapshot && !didApplyStartupPage.current) {
      setActivePage(snapshot.settings.startupPage);
      didApplyStartupPage.current = true;
    }
  }, [snapshot]);

  return (
    <div className="flex h-screen min-h-0 bg-zinc-100 text-zinc-950">
      <aside
        className={[
          "flex shrink-0 flex-col border-r border-zinc-200 bg-white transition-[width]",
          compactMode ? "w-20" : "w-64",
        ].join(" ")}
      >
        <div className={["flex h-20 items-center border-b border-zinc-200", compactMode ? "justify-center px-3" : "px-5"].join(" ")}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-rose-700 text-sm font-bold text-white">
            LoL
          </div>
          {!compactMode && (
            <div className="ml-3 min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-950">LoL Desktop Assistant</p>
              <p className="text-xs font-medium text-zinc-500">Milestone 2</p>
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-2 px-3 py-4" aria-label="Primary">
          {pages.map((page) => {
            const isActive = page.id === activePage;

            return (
              <button
                key={page.id}
                type="button"
                title={compactMode ? page.label : undefined}
                aria-label={page.label}
                onClick={() => setActivePage(page.id)}
                className={[
                  "flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition",
                  compactMode ? "justify-center" : "",
                  isActive
                    ? "bg-rose-700 text-white shadow-sm"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950",
                ].join(" ")}
              >
                <Icon name={page.icon} />
                {!compactMode && <span>{page.label}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {error && (
          <div className="border-b border-amber-200 bg-amber-50 px-8 py-3 text-sm font-medium text-amber-800">
            {error}
          </div>
        )}
        {activePage === "dashboard" && <Dashboard />}
        {activePage === "activity" && <Activity />}
        {activePage === "settings" && <Settings />}
      </div>
    </div>
  );
}

type IconName = "dashboard" | "activity" | "settings";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-11h6V4h-6v5Z",
    activity:
      "M5 4h14v2H5V4Zm0 4h9v2H5V8Zm0 4h14v2H5v-2Zm0 4h9v2H5v-2Zm12-8 4 4-4 4v-3h-5v-2h5V8Z",
    settings:
      "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58-1.92-3.32-2.39.96a7.13 7.13 0 0 0-1.63-.94L14.87 3h-3.74l-.36 3.18c-.58.23-1.12.54-1.63.94l-2.39-.96-1.92 3.32 2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58 1.92 3.32 2.39-.96c.51.4 1.05.71 1.63.94l.36 3.18h3.74l.36-3.18c.58-.23 1.12-.54 1.63-.94l2.39.96 1.92-3.32-2.03-1.58ZM13 15.5A3.5 3.5 0 1 1 13 8a3.5 3.5 0 0 1 0 7.5Z",
  };

  return (
    <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d={paths[name]} />
    </svg>
  );
}
