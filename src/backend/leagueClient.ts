import { callBackend } from "./commands";
import type { LeagueClientStatus, LeagueSelfSnapshot, LeagueSelfSnapshotInput } from "./types";

export function fetchLeagueClientStatus(): Promise<LeagueClientStatus> {
  return callBackend<LeagueClientStatus>("get_league_client_status");
}

export function fetchLeagueSelfSnapshot(input: LeagueSelfSnapshotInput = { matchLimit: 6 }): Promise<LeagueSelfSnapshot> {
  return callBackend<LeagueSelfSnapshot>("get_league_self_snapshot", {
    input,
  });
}
