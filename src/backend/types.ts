export type ServiceStatus = "ok" | "degraded";
export type DatabaseStatus = "ok" | "unavailable";
export type StartupPage = "dashboard" | "activity" | "settings";
export type ActivityKind = "note" | "settings" | "system";
export type LeagueClientConnection = "connected" | "unavailable";
export type LeagueClientPhase =
  | "notRunning"
  | "lockfileMissing"
  | "connecting"
  | "connected"
  | "unauthorized"
  | "unavailable";
export type RankedQueue = "soloDuo" | "flex" | "other";
export type MatchResult = "win" | "loss" | "unknown";
export type KdaTag = "high" | "standard" | "unavailable";

export type HealthcheckResult = {
  status: ServiceStatus;
  databaseStatus: DatabaseStatus;
  schemaVersion: number | null;
};

export type AppSettings = {
  startupPage: StartupPage;
  compactMode: boolean;
  activityLimit: number;
  updatedAt: string;
};

export type SaveSettingsInput = {
  startupPage: StartupPage;
  compactMode: boolean;
  activityLimit: number;
};

export type ActivityEntry = {
  id: number;
  kind: ActivityKind;
  title: string;
  body: string | null;
  createdAt: string;
};

export type ActivityEntriesResponse = {
  records: ActivityEntry[];
};

export type ActivityListInput = {
  limit?: number;
  kind?: ActivityKind | null;
};

export type ActivityNoteInput = {
  title: string;
  body?: string | null;
};

export type AppSnapshot = {
  health: HealthcheckResult;
  settings: AppSettings;
  settingsDefaults: SaveSettingsInput;
  recentActivity: ActivityEntry[];
};

export type CommandError = {
  code: "validation" | "storage" | "clientUnavailable" | "clientAccess" | "integration" | "internal";
  message: string;
};

export type LeagueClientStatus = {
  isRunning: boolean;
  lockfileFound: boolean;
  connection: LeagueClientConnection;
  phase: LeagueClientPhase;
  message: string | null;
};

export type CurrentSummonerProfile = {
  displayName: string;
  summonerLevel: number;
  profileIconId: number | null;
};

export type RankedQueueSummary = {
  queue: RankedQueue;
  tier: string | null;
  division: string | null;
  leaguePoints: number | null;
  wins: number;
  losses: number;
  isRanked: boolean;
};

export type RecentMatchSummary = {
  gameId: number;
  championName: string;
  queueName: string | null;
  result: MatchResult;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
  playedAt: string | null;
};

export type RecentPerformanceSummary = {
  matchCount: number;
  averageKda: number | null;
  kdaTag: KdaTag;
  recentChampions: string[];
};

export type LeagueSelfSnapshot = {
  status: LeagueClientStatus;
  summoner: CurrentSummonerProfile | null;
  rankedQueues: RankedQueueSummary[];
  recentMatches: RecentMatchSummary[];
  recentPerformance: RecentPerformanceSummary;
  refreshedAt: string;
};

export type LeagueSelfSnapshotInput = {
  matchLimit?: number;
};

export type LocalDataExport = {
  formatVersion: 1;
  settings: SaveSettingsInput;
  activityEntries: Array<{
    kind: ActivityKind;
    title: string;
    body: string | null;
    createdAt: string;
  }>;
};

export type ImportLocalDataResult = {
  settings: AppSettings;
  importedActivityCount: number;
};

export type ClearActivityResult = {
  deletedCount: number;
};

export type Feedback = {
  kind: "success" | "error";
  message: string;
};
