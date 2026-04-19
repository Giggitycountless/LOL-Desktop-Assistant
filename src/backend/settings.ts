import { callBackend } from "./commands";
import type { AppSettings, SaveSettingsInput } from "./types";

export function fetchSettings(): Promise<AppSettings> {
  return callBackend<AppSettings>("get_settings");
}

export function fetchSettingsDefaults(): Promise<SaveSettingsInput> {
  return callBackend<SaveSettingsInput>("get_settings_defaults");
}

export function saveSettings(settings: SaveSettingsInput): Promise<AppSettings> {
  return callBackend<AppSettings>("save_settings", {
    input: { settings },
  });
}
