import { callBackend } from "./commands";
import type { LeagueClientStatus, LeagueImageAsset, LeagueSelfSnapshot, LeagueSelfSnapshotInput } from "./types";

export function fetchLeagueClientStatus(): Promise<LeagueClientStatus> {
  return callBackend<LeagueClientStatus>("get_league_client_status");
}

export function fetchLeagueSelfSnapshot(input: LeagueSelfSnapshotInput = { matchLimit: 6 }): Promise<LeagueSelfSnapshot> {
  return callBackend<LeagueSelfSnapshot>("get_league_self_snapshot", {
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
