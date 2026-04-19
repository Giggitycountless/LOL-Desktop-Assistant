import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { clearActivityEntries, createActivityNote, listActivityEntries } from "../backend/activity";
import { isCommandError } from "../backend/commands";
import { exportLocalData, importLocalData } from "../backend/dataTools";
import { fetchLeagueChampionIcon, fetchLeagueProfileIcon, fetchLeagueSelfSnapshot } from "../backend/leagueClient";
import { saveSettings } from "../backend/settings";
import { fetchAppState } from "../backend/system";
import type {
  ActivityEntry,
  ActivityListInput,
  ActivityNoteInput,
  AppSnapshot,
  Feedback,
  LeagueImageAsset,
  LeagueSelfSnapshot,
  LeagueSelfSnapshotInput,
  SaveSettingsInput,
} from "../backend/types";

type LeagueImageUrls = {
  profileIcons: Record<number, string>;
  championIcons: Record<number, string>;
};

type AppStateContextValue = {
  snapshot: AppSnapshot | null;
  activityEntries: ActivityEntry[];
  leagueSelfSnapshot: LeagueSelfSnapshot | null;
  leagueImages: LeagueImageUrls;
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
  loadLeagueProfileIcon: (profileIconId: number | null | undefined) => Promise<boolean>;
  loadLeagueChampionIcon: (championId: number | null | undefined) => Promise<boolean>;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [leagueSelfSnapshot, setLeagueSelfSnapshot] = useState<LeagueSelfSnapshot | null>(null);
  const imageUrlsRef = useRef<LeagueImageUrls>({ profileIcons: {}, championIcons: {} });
  const pendingImageKeysRef = useRef(new Set<string>());
  const [leagueImages, setLeagueImages] = useState<LeagueImageUrls>(imageUrlsRef.current);
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

  useEffect(() => {
    return () => {
      for (const url of Object.values(imageUrlsRef.current.profileIcons)) {
        URL.revokeObjectURL(url);
      }
      for (const url of Object.values(imageUrlsRef.current.championIcons)) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

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

  const loadLeagueProfileIconAction = useCallback(async (profileIconId: number | null | undefined) => {
    if (!profileIconId || imageUrlsRef.current.profileIcons[profileIconId]) {
      return true;
    }

    const key = `profile:${profileIconId}`;
    if (pendingImageKeysRef.current.has(key)) {
      return true;
    }

    pendingImageKeysRef.current.add(key);
    try {
      const asset = await fetchLeagueProfileIcon(profileIconId);
      const url = imageAssetUrl(asset);
      imageUrlsRef.current = {
        ...imageUrlsRef.current,
        profileIcons: {
          ...imageUrlsRef.current.profileIcons,
          [profileIconId]: url,
        },
      };
      setLeagueImages(imageUrlsRef.current);
      return true;
    } catch {
      return false;
    } finally {
      pendingImageKeysRef.current.delete(key);
    }
  }, []);

  const loadLeagueChampionIconAction = useCallback(async (championId: number | null | undefined) => {
    if (!championId || imageUrlsRef.current.championIcons[championId]) {
      return true;
    }

    const key = `champion:${championId}`;
    if (pendingImageKeysRef.current.has(key)) {
      return true;
    }

    pendingImageKeysRef.current.add(key);
    try {
      const asset = await fetchLeagueChampionIcon(championId);
      const url = imageAssetUrl(asset);
      imageUrlsRef.current = {
        ...imageUrlsRef.current,
        championIcons: {
          ...imageUrlsRef.current.championIcons,
          [championId]: url,
        },
      };
      setLeagueImages(imageUrlsRef.current);
      return true;
    } catch {
      return false;
    } finally {
      pendingImageKeysRef.current.delete(key);
    }
  }, []);

  const value = useMemo<AppStateContextValue>(
    () => ({
      snapshot,
      activityEntries,
      leagueSelfSnapshot,
      leagueImages,
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
      loadLeagueProfileIcon: loadLeagueProfileIconAction,
      loadLeagueChampionIcon: loadLeagueChampionIconAction,
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
      leagueImages,
      leagueSelfSnapshot,
      loadLeagueChampionIconAction,
      loadActivityEntriesAction,
      loadLeagueProfileIconAction,
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

function imageAssetUrl(asset: LeagueImageAsset) {
  return URL.createObjectURL(new Blob([Uint8Array.from(asset.bytes)], { type: asset.mimeType }));
}
