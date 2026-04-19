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
  | "notLoggedIn"
  | "patching"
  | "partialData"
  | "unavailable";
export type LeagueDataSection = "champions" | "ranked" | "matches" | "participants" | "recentStats";
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
  championId: number | null;
  championName: string;
  queueName: string | null;
  result: MatchResult;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
  playedAt: string | null;
  gameDurationSeconds: number | null;
};

export type RecentChampionSummary = {
  championId: number | null;
  championName: string;
  games: number;
};

export type RecentPerformanceSummary = {
  matchCount: number;
  averageKda: number | null;
  kdaTag: KdaTag;
  recentChampions: string[];
  topChampions: RecentChampionSummary[];
};

export type LeagueDataWarning = {
  section: LeagueDataSection;
  message: string;
};

export type LeagueSelfSnapshot = {
  status: LeagueClientStatus;
  summoner: CurrentSummonerProfile | null;
  rankedQueues: RankedQueueSummary[];
  recentMatches: RecentMatchSummary[];
  recentPerformance: RecentPerformanceSummary;
  dataWarnings: LeagueDataWarning[];
  refreshedAt: string;
};

export type LeagueSelfSnapshotInput = {
  matchLimit?: number;
};

export type LeagueImageAsset = {
  mimeType: string;
  bytes: number[];
};

export type LeagueGameAssetKind = "item" | "rune" | "spell";

export type LeagueGameAsset = {
  kind: LeagueGameAssetKind;
  assetId: number;
  name: string;
  description: string | null;
  image: LeagueImageAsset;
};

export type PlayerNoteSummary = {
  hasNote: boolean;
  tags: string[];
};

export type PlayerNoteView = {
  gameId: number;
  participantId: number;
  note: string | null;
  tags: string[];
  updatedAt: string | null;
};

export type ClearPlayerNoteResult = {
  cleared: boolean;
};

export type PostMatchDetail = {
  gameId: number;
  queueName: string | null;
  playedAt: string | null;
  gameDurationSeconds: number | null;
  result: MatchResult;
  teams: PostMatchTeam[];
  comparison: PostMatchComparison;
  warnings: LeagueDataWarning[];
};

export type PostMatchTeam = {
  teamId: number;
  result: MatchResult;
  participants: PostMatchParticipant[];
  totals: PostMatchTeamTotals;
};

export type PostMatchParticipant = {
  participantId: number;
  teamId: number;
  displayName: string;
  championId: number | null;
  championName: string;
  role: string | null;
  lane: string | null;
  profileIconId: number | null;
  result: MatchResult;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
  performanceScore: number;
  cs: number;
  goldEarned: number;
  damageToChampions: number;
  visionScore: number;
  items: number[];
  runes: number[];
  spells: number[];
  noteSummary: PlayerNoteSummary;
};

export type PostMatchTeamTotals = {
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  damageToChampions: number;
  visionScore: number;
};

export type PostMatchComparison = {
  highestKda: ParticipantMetricLeader | null;
  mostCs: ParticipantMetricLeader | null;
  mostGold: ParticipantMetricLeader | null;
  mostDamage: ParticipantMetricLeader | null;
  highestVision: ParticipantMetricLeader | null;
};

export type ParticipantMetricLeader = {
  participantId: number;
  displayName: string;
  value: number;
};

export type ParticipantRecentStats = {
  matchCount: number;
  averageKda: number | null;
  recentChampions: string[];
};

export type ParticipantPublicProfile = {
  gameId: number;
  participantId: number;
  displayName: string;
  profileIconId: number | null;
  recentStats: ParticipantRecentStats | null;
  note: PlayerNoteView | null;
  warnings: LeagueDataWarning[];
};

export type ParticipantPublicProfileInput = {
  gameId: number;
  participantId: number;
  recentLimit?: number;
};

export type SavePlayerNoteInput = {
  gameId: number;
  participantId: number;
  note: string | null;
  tags: string[];
};

export type ClearPlayerNoteInput = {
  gameId: number;
  participantId: number;
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
