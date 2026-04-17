import { callBackend } from "./commands";
import type { ActivityEntriesResponse, ActivityEntry, ActivityNoteInput } from "./types";

export function listActivityEntries(limit?: number): Promise<ActivityEntriesResponse> {
  return callBackend<ActivityEntriesResponse>("list_activity_entries", {
    input: { limit },
  });
}

export function createActivityNote(input: ActivityNoteInput): Promise<ActivityEntry> {
  return callBackend<ActivityEntry>("create_activity_note", {
    input,
  });
}
