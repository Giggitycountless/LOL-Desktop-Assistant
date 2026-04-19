import { callBackend } from "./commands";
import type { ActivityEntriesResponse, ActivityEntry, ActivityListInput, ActivityNoteInput, ClearActivityResult } from "./types";

export function listActivityEntries(input: ActivityListInput = {}): Promise<ActivityEntriesResponse> {
  return callBackend<ActivityEntriesResponse>("list_activity_entries", {
    input,
  });
}

export function createActivityNote(input: ActivityNoteInput): Promise<ActivityEntry> {
  return callBackend<ActivityEntry>("create_activity_note", {
    input,
  });
}

export function clearActivityEntries(confirm: boolean): Promise<ClearActivityResult> {
  return callBackend<ClearActivityResult>("clear_activity_entries", {
    input: { confirm },
  });
}
