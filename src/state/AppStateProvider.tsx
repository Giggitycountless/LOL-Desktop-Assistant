import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { createActivityNote } from "../backend/activity";
import { isCommandError } from "../backend/commands";
import { saveSettings } from "../backend/settings";
import { fetchAppState } from "../backend/system";
import type { ActivityNoteInput, AppSnapshot, SaveSettingsInput } from "../backend/types";

type AppStateContextValue = {
  snapshot: AppSnapshot | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  saveSettings: (settings: SaveSettingsInput) => Promise<void>;
  createActivityNote: (input: ActivityNoteInput) => Promise<void>;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);

    try {
      setSnapshot(await fetchAppState());
      setError(null);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveSettingsAction = useCallback(
    async (settings: SaveSettingsInput) => {
      try {
        await saveSettings(settings);
        await reload();
      } catch (caught: unknown) {
        setError(errorMessage(caught));
      }
    },
    [reload],
  );

  const createActivityNoteAction = useCallback(
    async (input: ActivityNoteInput) => {
      try {
        await createActivityNote(input);
        await reload();
      } catch (caught: unknown) {
        setError(errorMessage(caught));
      }
    },
    [reload],
  );

  const value = useMemo<AppStateContextValue>(
    () => ({
      snapshot,
      isLoading,
      error,
      reload,
      saveSettings: saveSettingsAction,
      createActivityNote: createActivityNoteAction,
    }),
    [createActivityNoteAction, error, isLoading, reload, saveSettingsAction, snapshot],
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
