import { invoke } from "@tauri-apps/api/core";

export type HealthcheckResult = {
  status: "ok" | "degraded";
  databaseStatus: "ok" | "unavailable";
  schemaVersion: number | null;
};

export async function fetchHealthcheck(): Promise<HealthcheckResult> {
  return invoke<HealthcheckResult>("healthcheck");
}
