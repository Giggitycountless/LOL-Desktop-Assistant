import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { clearActivityEntries, createActivityNote, listActivityEntries } from "../backend/activity";
import { isCommandError } from "../backend/commands";
import { exportLocalData, importLocalData } from "../backend/dataTools";
import { fetchLeagueSelfSnapshot } from "../backend/leagueClient";
import { saveSettings } from "../backend/settings";
import { fetchAppState } from "../backend/system";
import type {
  ActivityEntry,
  ActivityListInput,
  ActivityNoteInput,
  AppSnapshot,
  Feedback,
  LeagueSelfSnapshot,
  LeagueSelfSnapshotInput,
  SaveSettingsInput,
} from "../backend/types";

type AppStateContextValue = {
  snapshot: AppSnapshot | null;
  activityEntries: ActivityEntry[];
  leagueSelfSnapshot: LeagueSelfSnapshot | null;
  isLoading: boolean;
  isActivityLoading: boolean;
  isLeagueClientLoading: boolean;
  feedback: Feedback | null;
  clearFeedback: () => void;
  refresh: () => Promise<boolean>;
  loadActivityEntries: (input: ActivityListInput) => Promise<boolean>;
  refreshLeagueClient: (input?: LeagueSelfSnapshotInput) => Promise<boolean>;
  saveSettings: (settings: SaveSettingsInput) => Promise<boolean>;
  createActivityNote: (input: ActivityNoteInput) => Promise<boolean>;
  clearActivityEntries: (confirm: boolean) => Promise<boolean>;
  exportLocalData: () => Promise<string | null>;
  importLocalData: (json: string) => Promise<boolean>;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [leagueSelfSnapshot, setLeagueSelfSnapshot] = useState<LeagueSelfSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivityLoading, setIsActivityLoading] = useState(false);
  const [isLeagueClientLoading, setIsLeagueClientLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);

    try {
      setSnapshot(await fetchAppState());
      return true;
    } catch (caught: unknown) {
      setFeedback({ kind: "error", message: errorMessage(caught) });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadActivityEntriesAction = useCallback(async (input: ActivityListInput) => {
    setIsActivityLoading(true);

    try {
      const response = await listActivityEntries(input);
      setActivityEntries(response.records);
      return true;
    } catch (caught: unknown) {
      setFeedback({ kind: "error", message: errorMessage(caught) });
      return false;
    } finally {
      setIsActivityLoading(false);
    }
  }, []);

  const refreshLeagueClientAction = useCallback(async (input: LeagueSelfSnapshotInput = { matchLimit: 6 }) => {
    setIsLeagueClientLoading(true);

    try {
      setLeagueSelfSnapshot(await fetchLeagueSelfSnapshot(input));
      return true;
    } catch (caught: unknown) {
      setFeedback({ kind: "error", message: errorMessage(caught) });
      return false;
    } finally {
      setIsLeagueClientLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshLeagueClientAction({ matchLimit: 6 });
  }, [refresh, refreshLeagueClientAction]);

  const saveSettingsAction = useCallback(
    async (settings: SaveSettingsInput) => {
      try {
        await saveSettings(settings);
        await refresh();
        setFeedback({ kind: "success", message: "Settings saved" });
        return true;
      } catch (caught: unknown) {
        setFeedback({ kind: "error", message: errorMessage(caught) });
        return false;
      }
    },
    [refresh],
  );

  const createActivityNoteAction = useCallback(
    async (input: ActivityNoteInput) => {
      try {
        await createActivityNote(input);
        await refresh();
        setFeedback({ kind: "success", message: "Activity note saved" });
        return true;
      } catch (caught: unknown) {
        setFeedback({ kind: "error", message: errorMessage(caught) });
        return false;
      }
    },
    [refresh],
  );

  const clearActivityEntriesAction = useCallback(
    async (confirm: boolean) => {
      try {
        const result = await clearActivityEntries(confirm);
        setActivityEntries([]);
        await refresh();
        setFeedback({
          kind: "success",
          message: `Cleared ${result.deletedCount} activity ${result.deletedCount === 1 ? "entry" : "entries"}`,
        });
        return true;
      } catch (caught: unknown) {
        setFeedback({ kind: "error", message: errorMessage(caught) });
        return false;
      }
    },
    [refresh],
  );

  const exportLocalDataAction = useCallback(async () => {
    try {
      const data = await exportLocalData();
      setFeedback({ kind: "success", message: "Local data exported" });
      return JSON.stringify(data, null, 2);
    } catch (caught: unknown) {
      setFeedback({ kind: "error", message: errorMessage(caught) });
      return null;
    }
  }, []);

  const importLocalDataAction = useCallback(
    async (json: string) => {
      try {
        const result = await importLocalData(json);
        await refresh();
        setFeedback({
          kind: "success",
          message: `Imported settings and ${result.importedActivityCount} activity ${
            result.importedActivityCount === 1 ? "entry" : "entries"
          }`,
        });
        return true;
      } catch (caught: unknown) {
        setFeedback({ kind: "error", message: errorMessage(caught) });
        return false;
      }
    },
    [refresh],
  );

  const value = useMemo<AppStateContextValue>(
    () => ({
      snapshot,
      activityEntries,
      leagueSelfSnapshot,
      isLoading,
      isActivityLoading,
      isLeagueClientLoading,
      feedback,
      clearFeedback: () => setFeedback(null),
      refresh,
      loadActivityEntries: loadActivityEntriesAction,
      refreshLeagueClient: refreshLeagueClientAction,
      saveSettings: saveSettingsAction,
      createActivityNote: createActivityNoteAction,
      clearActivityEntries: clearActivityEntriesAction,
      exportLocalData: exportLocalDataAction,
      importLocalData: importLocalDataAction,
    }),
    [
      activityEntries,
      clearActivityEntriesAction,
      createActivityNoteAction,
      exportLocalDataAction,
      feedback,
      importLocalDataAction,
      isActivityLoading,
      isLeagueClientLoading,
      isLoading,
      leagueSelfSnapshot,
      loadActivityEntriesAction,
      refresh,
      refreshLeagueClientAction,
      saveSettingsAction,
      snapshot,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);

  if (!context) {
    throw new Error("AppStateProvider is missing");
  }

  return context;
}

function errorMessage(error: unknown) {
  if (isCommandError(error)) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Unexpected error";
}
