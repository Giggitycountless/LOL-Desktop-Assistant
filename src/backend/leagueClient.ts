import { callBackend } from "./commands";
import type {
  ChampSelectSnapshot,
  ClearPlayerNoteInput,
  ClearPlayerNoteResult,
  LeagueGameAsset,
  LeagueGameAssetKind,
  LeagueChampionSummary,
  LeagueClientStatus,
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
} from "./types";

export function fetchLeagueClientStatus(): Promise<LeagueClientStatus> {
  return callBackend<LeagueClientStatus>("get_league_client_status");
}

export function fetchLeagueChampionCatalog(): Promise<LeagueChampionSummary[]> {
  return callBackend<LeagueChampionSummary[]>("get_league_champion_catalog");
}

export function fetchLeagueSelfSnapshot(input: LeagueSelfSnapshotInput = { matchLimit: 6 }): Promise<LeagueSelfSnapshot> {
  return callBackend<LeagueSelfSnapshot>("get_league_self_snapshot", {
    input,
  });
}

export function fetchChampSelectSnapshot(recentLimit: number = 6): Promise<ChampSelectSnapshot> {
  return callBackend<ChampSelectSnapshot>("get_champ_select_snapshot", {
    input: { recentLimit },
  });
}

export function fetchRankedChampionStats(input: RankedChampionStatsInput): Promise<RankedChampionStatsResponse> {
  return callBackend<RankedChampionStatsResponse>("get_ranked_champion_stats", {
    input,
  });
}

export function refreshRankedChampionStats(input: RankedChampionRefreshInput): Promise<RankedChampionStatsResponse> {
  return callBackend<RankedChampionStatsResponse>("refresh_ranked_champion_stats", {
    input,
  });
}

export function fetchLeagueProfileIcon(profileIconId: number): Promise<LeagueImageAsset> {
  return callBackend<LeagueImageAsset>("get_league_profile_icon", {
    input: { profileIconId },
  });
}

export function fetchLeagueChampionIcon(championId: number): Promise<LeagueImageAsset> {
  return callBackend<LeagueImageAsset>("get_league_champion_icon", {
    input: { championId },
  });
}

export function fetchLeagueGameAsset(kind: LeagueGameAssetKind, assetId: number): Promise<LeagueGameAsset> {
  return callBackend<LeagueGameAsset>("get_league_game_asset", {
    input: { kind, assetId },
  });
}

export function fetchPostMatchDetail(gameId: number): Promise<PostMatchDetail> {
  return callBackend<PostMatchDetail>("get_post_match_detail", {
    input: { gameId },
  });
}

export function fetchPostMatchParticipantProfile(input: ParticipantPublicProfileInput): Promise<ParticipantPublicProfile> {
  return callBackend<ParticipantPublicProfile>("get_post_match_participant_profile", {
    input,
  });
}

export function savePlayerNote(input: SavePlayerNoteInput): Promise<PlayerNoteView> {
  return callBackend<PlayerNoteView>("save_player_note", {
    input,
  });
}

export function clearPlayerNote(input: ClearPlayerNoteInput): Promise<ClearPlayerNoteResult> {
  return callBackend<ClearPlayerNoteResult>("clear_player_note", {
    input,
  });
}
