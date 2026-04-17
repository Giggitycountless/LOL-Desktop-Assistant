import { invoke } from "@tauri-apps/api/core";

import type { CommandError } from "./types";

export async function callBackend<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error: unknown) {
    throw normalizeCommandError(error);
  }
}

export function isCommandError(error: unknown): error is CommandError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as CommandError).code === "string" &&
    typeof (error as CommandError).message === "string"
  );
}

function normalizeCommandError(error: unknown): CommandError {
  if (isCommandError(error)) {
    return error;
  }

  return {
    code: "internal",
    message: error instanceof Error ? error.message : "Command failed",
  };
}
