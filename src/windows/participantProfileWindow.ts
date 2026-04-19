import { emit, emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import type { SelectedParticipant } from "../components/ParticipantProfilePanel";

export const PARTICIPANT_PROFILE_WINDOW_LABEL = "participant-profile";
export const PARTICIPANT_PROFILE_SELECTED_EVENT = "participant-profile-selected";
export const PARTICIPANT_PROFILE_CHANGED_EVENT = "participant-profile-changed";

export async function openParticipantProfileWindow(selection: SelectedParticipant) {
  const existing = await WebviewWindow.getByLabel(PARTICIPANT_PROFILE_WINDOW_LABEL);

  if (existing) {
    await emitTo(PARTICIPANT_PROFILE_WINDOW_LABEL, PARTICIPANT_PROFILE_SELECTED_EVENT, selection);
    await existing.show();
    await existing.setFocus();
    return;
  }

  const profileWindow = new WebviewWindow(PARTICIPANT_PROFILE_WINDOW_LABEL, {
    center: true,
    focus: true,
    height: 720,
    minHeight: 560,
    minWidth: 380,
    resizable: true,
    title: "Participant Profile",
    url: participantProfileWindowUrl(selection),
    width: 420,
  });
  void profileWindow.once("tauri://error", () => {
    console.warn("Participant profile window could not be opened.");
  });
}

export function emitParticipantProfileChanged(selection: SelectedParticipant) {
  return emit(PARTICIPANT_PROFILE_CHANGED_EVENT, selection);
}

export function participantProfileHash(selection: SelectedParticipant) {
  return `#/participant-profile?gameId=${encodeURIComponent(selection.gameId)}&participantId=${encodeURIComponent(selection.participantId)}`;
}

export function participantProfileWindowUrl(selection: SelectedParticipant) {
  return `index.html${participantProfileHash(selection)}`;
}

export function selectionFromParticipantProfileHash(hash: string): SelectedParticipant | null {
  const prefix = "#/participant-profile";

  if (!hash.startsWith(prefix)) {
    return null;
  }

  const query = hash.slice(prefix.length);
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const gameId = Number(params.get("gameId"));
  const participantId = Number(params.get("participantId"));

  if (!Number.isSafeInteger(gameId) || gameId <= 0 || !Number.isSafeInteger(participantId) || participantId <= 0) {
    return null;
  }

  return { gameId, participantId };
}

export function isSelectedParticipant(value: unknown): value is SelectedParticipant {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SelectedParticipant>;
  return (
    Number.isSafeInteger(candidate.gameId) &&
    Number.isSafeInteger(candidate.participantId) &&
    Number(candidate.gameId) > 0 &&
    Number(candidate.participantId) > 0
  );
}

export function sameParticipant(left: SelectedParticipant | null, right: SelectedParticipant) {
  return left?.gameId === right.gameId && left.participantId === right.participantId;
}
