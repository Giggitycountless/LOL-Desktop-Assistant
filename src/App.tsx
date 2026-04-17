import { useState } from "react";

import { Dashboard } from "./pages/Dashboard";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";

type Page = "dashboard" | "history" | "settings";

const pages: Array<{ id: Page; label: string; icon: IconName }> = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "history", label: "History", icon: "history" },
  { id: "settings", label: "Settings", icon: "settings" },
];

export function App() {
  const [activePage, setActivePage] = useState<Page>("dashboard");

  return (
    <div className="flex h-screen min-h-0 bg-zinc-100 text-zinc-950">
      <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="flex h-20 items-center border-b border-zinc-200 px-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-rose-700 text-sm font-bold text-white">
            LoL
          </div>
          <div className="ml-3 min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-950">LoL Desktop Assistant</p>
            <p className="text-xs font-medium text-zinc-500">Milestone 1</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-2 px-3 py-4" aria-label="Primary">
          {pages.map((page) => {
            const isActive = page.id === activePage;

            return (
              <button
                key={page.id}
                type="button"
                onClick={() => setActivePage(page.id)}
                className={[
                  "flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition",
                  isActive
                    ? "bg-rose-700 text-white shadow-sm"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950",
                ].join(" ")}
              >
                <Icon name={page.icon} />
                <span>{page.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {activePage === "dashboard" && <Dashboard />}
      {activePage === "history" && <History />}
      {activePage === "settings" && <Settings />}
    </div>
  );
}

type IconName = "dashboard" | "history" | "settings";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-11h6V4h-6v5Z",
    history:
      "M12 4a8 8 0 1 1-7.45 5.08h2.18A6 6 0 1 0 8.2 6.2L10 8H4V2l1.78 1.78A7.97 7.97 0 0 1 12 4Zm1 4v4.1l3 1.78-1 1.73-4-2.38V8h2Z",
    settings:
      "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58-1.92-3.32-2.39.96a7.13 7.13 0 0 0-1.63-.94L14.87 3h-3.74l-.36 3.18c-.58.23-1.12.54-1.63.94l-2.39-.96-1.92 3.32 2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58 1.92 3.32 2.39-.96c.51.4 1.05.71 1.63.94l.36 3.18h3.74l.36-3.18c.58-.23 1.12-.54 1.63-.94l2.39.96 1.92-3.32-2.03-1.58ZM13 15.5A3.5 3.5 0 1 1 13 8a3.5 3.5 0 0 1 0 7.5Z",
  };

  return (
    <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d={paths[name]} />
    </svg>
  );
}
