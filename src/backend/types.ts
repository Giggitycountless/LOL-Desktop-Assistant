export type ServiceStatus = "ok" | "degraded";
export type DatabaseStatus = "ok" | "unavailable";
export type StartupPage = "dashboard" | "activity" | "settings";
export type ActivityKind = "note" | "settings" | "system";

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
  code: "validation" | "storage" | "internal";
  message: string;
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
