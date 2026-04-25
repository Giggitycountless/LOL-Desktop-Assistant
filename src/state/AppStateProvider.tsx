import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { clearActivityEntries, createActivityNote, listActivityEntries } from "../backend/activity";
import { isCommandError } from "../backend/commands";
import { exportLocalData, importLocalData } from "../backend/dataTools";
import {
  clearPlayerNote as clearPlayerNoteCommand,
  fetchChampSelectSnapshot,
  fetchLeagueChampionDetails,
  fetchLeagueChampionIcon,
  fetchLeagueGameAsset,
  fetchLeagueProfileIcon,
  fetchLeagueSelfSnapshot,
  fetchPostMatchDetail,
  fetchPostMatchParticipantProfile,
  fetchRankedChampionStats,
  refreshRankedChampionStats,
  savePlayerNote as savePlayerNoteCommand,
} from "../backend/leagueClient";
import { saveSettings } from "../backend/settings";
import { createTranslator, resolveEffectiveLanguage, type EffectiveLanguage, type TranslationKey } from "../i18n";
import { fetchAppState } from "../backend/system";
import type {
  ActivityEntry,
  ActivityListInput,
  ActivityNoteInput,
  AppSnapshot,
  AppLanguagePreference,
  ChampSelectSnapshot,
  Feedback,
  LeagueChampionAbility,
  LeagueChampionDetails,
  LeagueGameAsset,
  LeagueGameAssetKind,
  LeagueImageAsset,
  LeagueSelfSnapshot,
  LeagueSelfSnapshotInput,
  ParticipantPublicProfile,
  ParticipantPublicProfileInput,
  PlayerNoteView,
  PostMatchDetail,
  RankedChampionRefreshInput,
  RankedChampionStatsInput,
  RankedChampionStatsResponse,
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

export type LeagueChampionAbilityView = Omit<LeagueChampionAbility, "icon"> & {
  iconUrl: string | null;
};

export type LeagueChampionDetailsView = Omit<LeagueChampionDetails, "squarePortrait" | "abilities"> & {
  squarePortraitUrl: string | null;
  abilities: LeagueChampionAbilityView[];
};

type AppStateContextValue = {
  snapshot: AppSnapshot | null;
  activityEntries: ActivityEntry[];
  leagueSelfSnapshot: LeagueSelfSnapshot | null;
  champSelectSnapshot: ChampSelectSnapshot | null;
  rankedChampionStats: RankedChampionStatsResponse | null;
  postMatchDetails: Record<number, PostMatchDetail>;
  participantProfiles: Record<string, ParticipantPublicProfile>;
  championDetailsById: Record<number, LeagueChampionDetailsView>;
  leagueImages: LeagueImageUrls;
  isLoading: boolean;
  isActivityLoading: boolean;
  isLeagueClientLoading: boolean;
  isRankedChampionStatsLoading: boolean;
  feedback: Feedback | null;
  languagePreference: AppLanguagePreference;
  effectiveLanguage: EffectiveLanguage;
  t: (key: TranslationKey) => string;
  clearFeedback: () => void;
  refresh: () => Promise<boolean>;
  loadActivityEntries: (input: ActivityListInput) => Promise<boolean>;
  refreshLeagueClient: (input?: LeagueSelfSnapshotInput) => Promise<boolean>;
  loadRankedChampionStats: (input: RankedChampionStatsInput) => Promise<boolean>;
  refreshRankedChampionStats: (input: RankedChampionRefreshInput) => Promise<boolean>;
  saveSettings: (settings: SaveSettingsInput) => Promise<boolean>;
  setLanguagePreference: (language: AppLanguagePreference) => Promise<boolean>;
  createActivityNote: (input: ActivityNoteInput) => Promise<boolean>;
  clearActivityEntries: (confirm: boolean) => Promise<boolean>;
  exportLocalData: () => Promise<string | null>;
  importLocalData: (json: string) => Promise<boolean>;
  loadLeagueProfileIcon: (profileIconId: number | null | undefined) => Promise<boolean>;
  loadLeagueChampionIcon: (championId: number | null | undefined) => Promise<boolean>;
  loadLeagueChampionDetails: (championId: number | null | undefined) => Promise<boolean>;
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
  const [champSelectSnapshot, setChampSelectSnapshot] = useState<ChampSelectSnapshot | null>(null);
  const [rankedChampionStats, setRankedChampionStats] = useState<RankedChampionStatsResponse | null>(null);
  const [postMatchDetails, setPostMatchDetails] = useState<Record<number, PostMatchDetail>>({});
  const [participantProfiles, setParticipantProfiles] = useState<Record<string, ParticipantPublicProfile>>({});
  const [championDetailsById, setChampionDetailsById] = useState<Record<number, LeagueChampionDetailsView>>({});
  const imageUrlsRef = useRef<LeagueImageUrls>({ profileIcons: {}, championIcons: {}, gameAssets: {} });
  const championDetailsRef = useRef<Record<number, LeagueChampionDetailsView>>({});
  const pendingImageKeysRef = useRef(new Set<string>());
  const champSelectFingerprintRef = useRef("");
  const [leagueImages, setLeagueImages] = useState<LeagueImageUrls>(imageUrlsRef.current);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivityLoading, setIsActivityLoading] = useState(false);
  const [isLeagueClientLoading, setIsLeagueClientLoading] = useState(false);
  const [isRankedChampionStatsLoading, setIsRankedChampionStatsLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const languagePreference = snapshot?.settings.language ?? "system";
  const effectiveLanguage = useMemo(() => resolveEffectiveLanguage(languagePreference), [languagePreference]);
  const t = useMemo(() => createTranslator(effectiveLanguage), [effectiveLanguage]);

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

  const loadRankedChampionStatsAction = useCallback(async (input: RankedChampionStatsInput) => {
    setIsRankedChampionStatsLoading(true);

    try {
      setRankedChampionStats(await fetchRankedChampionStats(input));
      return true;
    } catch (caught: unknown) {
      setFeedback({ kind: "error", message: errorMessage(caught) });
      return false;
    } finally {
      setIsRankedChampionStatsLoading(false);
    }
  }, []);

  const refreshRankedChampionStatsAction = useCallback(async (input: RankedChampionRefreshInput) => {
    setIsRankedChampionStatsLoading(true);

    try {
      const response = await refreshRankedChampionStats(input);
      setRankedChampionStats(response);
      setFeedback({
        kind: response.dataStatus === "staleCache" ? "error" : "success",
        message: response.statusMessage ?? "Ranked champion data refreshed",
      });
      return true;
    } catch (caught: unknown) {
      setFeedback({ kind: "error", message: errorMessage(caught) });
      return false;
    } finally {
      setIsRankedChampionStatsLoading(false);
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
      for (const details of Object.values(championDetailsRef.current)) {
        if (details.squarePortraitUrl) {
          URL.revokeObjectURL(details.squarePortraitUrl);
        }
        for (const ability of details.abilities) {
          if (ability.iconUrl) {
            URL.revokeObjectURL(ability.iconUrl);
          }
        }
      }
    };
  }, []);

  const saveSettingsAction = useCallback(
    async (settings: SaveSettingsInput) => {
      try {
        await saveSettings(settings);
        await refresh();
        setFeedback({ kind: "success", message: t("feedback.settingsSaved") });
        return true;
      } catch (caught: unknown) {
        setFeedback({ kind: "error", message: errorMessage(caught) });
        return false;
      }
    },
    [refresh, t],
  );

  const setLanguagePreferenceAction = useCallback(
    async (language: AppLanguagePreference) => {
      const current = snapshot?.settings ?? snapshot?.settingsDefaults;
      if (!current) {
        return false;
      }

      return saveSettingsAction({
        startupPage: current.startupPage,
        language,
        compactMode: current.compactMode,
        activityLimit: current.activityLimit,
        autoAcceptEnabled: current.autoAcceptEnabled,
        autoPickEnabled: current.autoPickEnabled,
        autoPickChampionId: current.autoPickChampionId,
        autoBanEnabled: current.autoBanEnabled,
        autoBanChampionId: current.autoBanChampionId,
      });
    },
    [saveSettingsAction, snapshot?.settings, snapshot?.settingsDefaults],
  );

  const createActivityNoteAction = useCallback(
    async (input: ActivityNoteInput) => {
      try {
        await createActivityNote(input);
        await refresh();
        setFeedback({ kind: "success", message: t("feedback.activityNoteSaved") });
        return true;
      } catch (caught: unknown) {
        setFeedback({ kind: "error", message: errorMessage(caught) });
        return false;
      }
    },
    [refresh, t],
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
      setFeedback({ kind: "success", message: t("feedback.localDataExported") });
      return JSON.stringify(data, null, 2);
    } catch (caught: unknown) {
      setFeedback({ kind: "error", message: errorMessage(caught) });
      return null;
    }
  }, [t]);

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

  const loadLeagueChampionDetailsAction = useCallback(async (championId: number | null | undefined) => {
    if (!championId || championDetailsRef.current[championId]) {
      return true;
    }

    const key = `champion-details:${championId}`;
    if (pendingImageKeysRef.current.has(key)) {
      return true;
    }

    pendingImageKeysRef.current.add(key);
    try {
      const details = await fetchLeagueChampionDetails(championId);
      const view = championDetailsView(details);
      championDetailsRef.current = {
        ...championDetailsRef.current,
        [championId]: view,
      };
      setChampionDetailsById(championDetailsRef.current);
      return true;
    } catch {
      return false;
    } finally {
      pendingImageKeysRef.current.delete(key);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let isRefreshing = false;

    async function refreshChampSelectSnapshot() {
      if (isRefreshing) {
        return;
      }

      isRefreshing = true;
      try {
        const snapshot = await fetchChampSelectSnapshot(6);
        if (!isMounted) {
          return;
        }
        const nextFingerprint = champSelectFingerprint(snapshot);
        if (champSelectFingerprintRef.current === nextFingerprint) {
          return;
        }
        champSelectFingerprintRef.current = nextFingerprint;
        setChampSelectSnapshot(snapshot);
        for (const player of snapshot.players) {
          void loadLeagueChampionIconAction(player.championId);
        }
      } catch {
        if (isMounted && champSelectFingerprintRef.current) {
          champSelectFingerprintRef.current = "";
          setChampSelectSnapshot(null);
        }
      } finally {
        isRefreshing = false;
      }
    }

    void refreshChampSelectSnapshot();
    const intervalId = window.setInterval(() => {
      void refreshChampSelectSnapshot();
    }, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [loadLeagueChampionIconAction]);

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
      setFeedback({ kind: "success", message: t("feedback.playerNoteSaved") });
      return note;
    } catch (caught: unknown) {
      setFeedback({ kind: "error", message: errorMessage(caught) });
      return null;
    }
  }, [loadParticipantProfileAction, loadPostMatchDetailAction, t]);

  const clearPlayerNoteAction = useCallback(async (gameId: number, participantId: number) => {
    try {
      await clearPlayerNoteCommand({ gameId, participantId });
      await loadPostMatchDetailAction(gameId);
      await loadParticipantProfileAction({ gameId, participantId, recentLimit: 6 });
      setFeedback({ kind: "success", message: t("feedback.playerNoteCleared") });
      return true;
    } catch (caught: unknown) {
      setFeedback({ kind: "error", message: errorMessage(caught) });
      return false;
    }
  }, [loadParticipantProfileAction, loadPostMatchDetailAction, t]);

  const value = useMemo<AppStateContextValue>(
    () => ({
      snapshot,
      activityEntries,
      leagueSelfSnapshot,
      champSelectSnapshot,
      rankedChampionStats,
      postMatchDetails,
      participantProfiles,
      championDetailsById,
      leagueImages,
      isLoading,
      isActivityLoading,
      isLeagueClientLoading,
      isRankedChampionStatsLoading,
      feedback,
      languagePreference,
      effectiveLanguage,
      t,
      clearFeedback: () => setFeedback(null),
      refresh,
      loadActivityEntries: loadActivityEntriesAction,
      refreshLeagueClient: refreshLeagueClientAction,
      loadRankedChampionStats: loadRankedChampionStatsAction,
      refreshRankedChampionStats: refreshRankedChampionStatsAction,
      saveSettings: saveSettingsAction,
      setLanguagePreference: setLanguagePreferenceAction,
      createActivityNote: createActivityNoteAction,
      clearActivityEntries: clearActivityEntriesAction,
      exportLocalData: exportLocalDataAction,
      importLocalData: importLocalDataAction,
      loadLeagueProfileIcon: loadLeagueProfileIconAction,
      loadLeagueChampionIcon: loadLeagueChampionIconAction,
      loadLeagueChampionDetails: loadLeagueChampionDetailsAction,
      loadLeagueGameAsset: loadLeagueGameAssetAction,
      loadPostMatchDetail: loadPostMatchDetailAction,
      loadParticipantProfile: loadParticipantProfileAction,
      savePlayerNote: savePlayerNoteAction,
      clearPlayerNote: clearPlayerNoteAction,
    }),
    [
      activityEntries,
      champSelectSnapshot,
      championDetailsById,
      clearActivityEntriesAction,
      clearPlayerNoteAction,
      createActivityNoteAction,
      exportLocalDataAction,
      feedback,
      languagePreference,
      effectiveLanguage,
      importLocalDataAction,
      isActivityLoading,
      isLeagueClientLoading,
      isRankedChampionStatsLoading,
      isLoading,
      leagueImages,
      leagueSelfSnapshot,
      loadRankedChampionStatsAction,
      loadLeagueChampionIconAction,
      loadLeagueChampionDetailsAction,
      loadLeagueGameAssetAction,
      loadActivityEntriesAction,
      loadLeagueProfileIconAction,
      loadParticipantProfileAction,
      loadPostMatchDetailAction,
      participantProfiles,
      postMatchDetails,
      rankedChampionStats,
      refresh,
      refreshLeagueClientAction,
      refreshRankedChampionStatsAction,
      savePlayerNoteAction,
      saveSettingsAction,
      setLanguagePreferenceAction,
      snapshot,
      t,
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

function championDetailsView(details: LeagueChampionDetails): LeagueChampionDetailsView {
  return {
    championId: details.championId,
    championName: details.championName,
    title: details.title,
    squarePortraitUrl: details.squarePortrait ? imageAssetUrl(details.squarePortrait) : null,
    abilities: details.abilities.map((ability) => ({
      slot: ability.slot,
      name: ability.name,
      description: ability.description,
      cooldown: ability.cooldown,
      cost: ability.cost,
      range: ability.range,
      iconUrl: ability.icon ? imageAssetUrl(ability.icon) : null,
    })),
  };
}

function participantProfileKey(gameId: number, participantId: number) {
  return `${gameId}:${participantId}`;
}

export function leagueGameAssetKey(kind: LeagueGameAssetKind, assetId: number) {
  return `${kind}:${assetId}`;
}

function champSelectFingerprint(snapshot: ChampSelectSnapshot) {
  return snapshot.players
    .map((player) => {
      const recentMatchIds = player.recentStats?.recentMatches.map((match) => match.gameId).join(",") ?? "";
      return [
        player.summonerId,
        player.puuid,
        player.displayName,
        player.championId ?? "",
        player.team,
        recentMatchIds,
      ].join(":");
    })
    .join("|");
}
