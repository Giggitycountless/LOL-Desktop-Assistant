import { callBackend } from "./commands";
import type { AppSnapshot, HealthcheckResult } from "./types";

export function fetchHealthcheck(): Promise<HealthcheckResult> {
  return callBackend<HealthcheckResult>("healthcheck");
}

export function fetchAppState(): Promise<AppSnapshot> {
  return callBackend<AppSnapshot>("get_app_state");
}
