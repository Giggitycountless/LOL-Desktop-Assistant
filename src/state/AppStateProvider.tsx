import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { clearActivityEntries, createActivityNote, listActivityEntries } from "../backend/activity";
import { isCommandError } from "../backend/commands";
import { exportLocalData, importLocalData } from "../backend/dataTools";
import {
  clearPlayerNote as clearPlayerNoteCommand,
  fetchLeagueChampionIcon,
  fetchLeagueGameAsset,
  fetchLeagueProfileIcon,
  fetchLeagueSelfSnapshot,
  fetchPostMatchDetail,
  fetchPostMatchParticipantProfile,
  savePlayerNote as savePlayerNoteCommand,
} from "../backend/leagueClient";
import { saveSettings } from "../backend/settings";
import { fetchAppState } from "../backend/system";
import type {
  ActivityEntry,
  ActivityListInput,
  ActivityNoteInput,
  AppSnapshot,
  Feedback,
  LeagueGameAsset,
  LeagueGameAssetKind,
  LeagueImageAsset,
  LeagueSelfSnapshot,
  LeagueSelfSnapshotInput,
  ParticipantPublicProfile,
  ParticipantPublicProfileInput,
  PlayerNoteView,
  PostMatchDetail,
  SavePlayerNoteInput,
  SaveSettingsInput,
} from "../backend/types";

type LeagueImageUrls = {
  profileIcons: Record<number, string>;
  championIcons: Record<number, string>;
  gameAssets: Record<string, LeagueGameAssetView>;
};

export type LeagueGameAssetView = Omit<LeagueGameAsset, "image"> & {
  imageUrl: string;
};

type AppStateContextValue = {
  snapshot: AppSnapshot | null;
  activityEntries: ActivityEntry[];
  leagueSelfSnapshot: LeagueSelfSnapshot | null;
  postMatchDetails: Record<number, PostMatchDetail>;
  participantProfiles: Record<string, ParticipantPublicProfile>;
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
  loadLeagueGameAsset: (kind: LeagueGameAssetKind, assetId: number | null | undefined) => Promise<boolean>;
  loadPostMatchDetail: (gameId: number) => Promise<boolean>;
  loadParticipantProfile: (input: ParticipantPublicProfileInput) => Promise<boolean>;
  savePlayerNote: (input: SavePlayerNoteInput) => Promise<PlayerNoteView | null>;
  clearPlayerNote: (gameId: number, participantId: number) => Promise<boolean>;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [leagueSelfSnapshot, setLeagueSelfSnapshot] = useState<LeagueSelfSnapshot | null>(null);
  const [postMatchDetails, setPostMatchDetails] = useState<Record<number, PostMatchDetail>>({});
  const [participantProfiles, setParticipantProfiles] = useState<Record<string, ParticipantPublicProfile>>({});
  const imageUrlsRef = useRef<LeagueImageUrls>({ profileIcons: {}, championIcons: {}, gameAssets: {} });
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
      for (const asset of Object.values(imageUrlsRef.current.gameAssets)) {
        URL.revokeObjectURL(asset.imageUrl);
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

  const loadLeagueGameAssetAction = useCallback(async (kind: LeagueGameAssetKind, assetId: number | null | undefined) => {
    if (!assetId) {
      return true;
    }

    const key = leagueGameAssetKey(kind, assetId);
    if (imageUrlsRef.current.gameAssets[key] || pendingImageKeysRef.current.has(key)) {
      return true;
    }

    pendingImageKeysRef.current.add(key);
    try {
      const asset = await fetchLeagueGameAsset(kind, assetId);
      const imageUrl = imageAssetUrl(asset.image);
      imageUrlsRef.current = {
        ...imageUrlsRef.current,
        gameAssets: {
          ...imageUrlsRef.current.gameAssets,
          [key]: {
            kind: asset.kind,
            assetId: asset.assetId,
            name: asset.name,
            description: asset.description,
            imageUrl,
          },
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

  const loadPostMatchDetailAction = useCallback(async (gameId: number) => {
    try {
      const detail = await fetchPostMatchDetail(gameId);
      setPostMatchDetails((current) => ({ ...current, [gameId]: detail }));
      return true;
    } catch (caught: unknown) {
      setFeedback({ kind: "error", message: errorMessage(caught) });
      return false;
    }
  }, []);

  const loadParticipantProfileAction = useCallback(async (input: ParticipantPublicProfileInput) => {
    try {
      const profile = await fetchPostMatchParticipantProfile(input);
      setParticipantProfiles((current) => ({ ...current, [participantProfileKey(input.gameId, input.participantId)]: profile }));
      return true;
    } catch (caught: unknown) {
      setFeedback({ kind: "error", message: errorMessage(caught) });
      return false;
    }
  }, []);

  const savePlayerNoteAction = useCallback(async (input: SavePlayerNoteInput) => {
    try {
      const note = await savePlayerNoteCommand(input);
      await loadPostMatchDetailAction(input.gameId);
      await loadParticipantProfileAction({ gameId: input.gameId, participantId: input.participantId, recentLimit: 6 });
      setFeedback({ kind: "success", message: "Player note saved" });
      return note;
    } catch (caught: unknown) {
      setFeedback({ kind: "error", message: errorMessage(caught) });
      return null;
    }
  }, [loadParticipantProfileAction, loadPostMatchDetailAction]);

  const clearPlayerNoteAction = useCallback(async (gameId: number, participantId: number) => {
    try {
      await clearPlayerNoteCommand({ gameId, participantId });
      await loadPostMatchDetailAction(gameId);
      await loadParticipantProfileAction({ gameId, participantId, recentLimit: 6 });
      setFeedback({ kind: "success", message: "Player note cleared" });
      return true;
    } catch (caught: unknown) {
      setFeedback({ kind: "error", message: errorMessage(caught) });
      return false;
    }
  }, [loadParticipantProfileAction, loadPostMatchDetailAction]);

  const value = useMemo<AppStateContextValue>(
    () => ({
      snapshot,
      activityEntries,
      leagueSelfSnapshot,
      postMatchDetails,
      participantProfiles,
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
      loadLeagueGameAsset: loadLeagueGameAssetAction,
      loadPostMatchDetail: loadPostMatchDetailAction,
      loadParticipantProfile: loadParticipantProfileAction,
      savePlayerNote: savePlayerNoteAction,
      clearPlayerNote: clearPlayerNoteAction,
    }),
    [
      activityEntries,
      clearActivityEntriesAction,
      clearPlayerNoteAction,
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
      loadLeagueGameAssetAction,
      loadActivityEntriesAction,
      loadLeagueProfileIconAction,
      loadParticipantProfileAction,
      loadPostMatchDetailAction,
      participantProfiles,
      postMatchDetails,
      refresh,
      refreshLeagueClientAction,
      savePlayerNoteAction,
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

function participantProfileKey(gameId: number, participantId: number) {
  return `${gameId}:${participantId}`;
}

export function leagueGameAssetKey(kind: LeagueGameAssetKind, assetId: number) {
  return `${kind}:${assetId}`;
}
