import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { Activity } from "./pages/Activity";
import { Dashboard } from "./pages/Dashboard";
import { Matches } from "./pages/Matches";
import { ParticipantProfileWindow } from "./pages/ParticipantProfileWindow";
import { Profile } from "./pages/Profile";
import { RankedChampions } from "./pages/RankedChampions";
import { SelfHistoryOverlay } from "./pages/SelfHistoryOverlay";
import { Settings } from "./pages/Settings";
import { AppStateProvider, useAppCore, type AppWindowMode } from "./state/AppStateProvider";
import type { StartupPage } from "./backend/types";
import { oppositeLanguage, type TranslationKey } from "./i18n";
import { selectionFromParticipantProfileHash } from "./windows/participantProfileWindow";
import { isSelfHistoryOverlayHash } from "./windows/selfHistoryOverlayWindow";

type Page = StartupPage | "profile" | "matches" | "ranked";

const pages: Array<{ id: Page; labelKey: TranslationKey; icon: IconName }> = [
  { id: "dashboard", labelKey: "nav.dashboard", icon: "dashboard" },
  { id: "profile", labelKey: "nav.profile", icon: "profile" },
  { id: "matches", labelKey: "nav.matches", icon: "matches" },
  { id: "ranked", labelKey: "nav.ranked", icon: "ranked" },
  { id: "activity", labelKey: "nav.activity", icon: "activity" },
  { id: "settings", labelKey: "nav.settings", icon: "settings" },
];

export function App() {
  const participantProfileSelection = selectionFromParticipantProfileHash(window.location.hash);
  const isSelfHistoryOverlay = isSelfHistoryOverlayHash(window.location.hash);
  const mode: AppWindowMode = participantProfileSelection ? "participant" : isSelfHistoryOverlay ? "overlay" : "main";

  return (
    <AppStateProvider mode={mode}>
      {participantProfileSelection ? (
        <ParticipantProfileWindow initialSelection={participantProfileSelection} />
      ) : isSelfHistoryOverlay ? (
        <SelfHistoryOverlay />
      ) : (
        <AppShell />
      )}
    </AppStateProvider>
  );
}

function AppShell() {
  const { snapshot, feedback, clearFeedback, isLoading, effectiveLanguage, setLanguagePreference, t } = useAppCore();
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const didApplyStartupPage = useRef(false);
  const compactMode = snapshot?.settings.compactMode ?? false;
  const navigateTo = useCallback((page: Page) => {
    startTransition(() => {
      setActivePage(page);
    });
  }, []);

  useEffect(() => {
    if (snapshot && !didApplyStartupPage.current) {
      navigateTo(snapshot.settings.startupPage);
      didApplyStartupPage.current = true;
    }
  }, [navigateTo, snapshot]);

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
              <p className="truncate text-sm font-semibold text-zinc-950">{t("app.name")}</p>
              <p className="text-xs font-medium text-zinc-500">{t("app.milestone")}</p>
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-2 px-3 py-4" aria-label="Primary">
          {pages.map((page) => {
            const isActive = page.id === activePage;
            const label = t(page.labelKey);

            return (
              <button
                key={page.id}
                type="button"
                title={compactMode ? label : undefined}
                aria-label={label}
                onClick={() => navigateTo(page.id)}
                className={[
                  "flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition",
                  compactMode ? "justify-center" : "",
                  isActive
                    ? "bg-rose-700 text-white shadow-sm"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950",
                ].join(" ")}
              >
                <Icon name={page.icon} />
                {!compactMode && <span>{label}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center justify-end border-b border-zinc-200 bg-white px-8">
          <button
            type="button"
            onClick={() => void setLanguagePreference(oppositeLanguage(effectiveLanguage))}
            className="inline-flex h-8 min-w-12 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            {t("app.languageToggle")}
          </button>
        </div>
        {feedback && (
          <div
            className={[
              "flex items-center justify-between gap-4 border-b px-8 py-3 text-sm font-medium",
              feedback.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800",
            ].join(" ")}
          >
            <span>{feedback.message}</span>
            <button type="button" className="font-semibold underline-offset-4 hover:underline" onClick={clearFeedback}>
              {t("app.dismiss")}
            </button>
          </div>
        )}
        {isLoading && !snapshot && (
          <div className="border-b border-zinc-200 bg-white px-8 py-3 text-sm font-medium text-zinc-600">
            {t("app.loadingState")}
          </div>
        )}
        {activePage === "dashboard" && <Dashboard />}
        {activePage === "profile" && <Profile />}
        {activePage === "matches" && <Matches />}
        {activePage === "ranked" && <RankedChampions />}
        {activePage === "activity" && <Activity />}
        {activePage === "settings" && <Settings />}
      </div>
    </div>
  );
}

type IconName = "dashboard" | "profile" | "matches" | "ranked" | "activity" | "settings";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-11h6V4h-6v5Z",
    profile:
      "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0v1H4v-1Z",
    matches:
      "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 4v3h4V8H7Zm0 5v3h4v-3H7Zm6-5v2h4V8h-4Zm0 5v2h4v-2h-4Z",
    ranked:
      "M6 20V9h3v11H6Zm5 0V4h3v16h-3Zm5 0v-7h3v7h-3ZM4 20h17v2H4v-2Z",
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
