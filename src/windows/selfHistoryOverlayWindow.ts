import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import { callBackend } from "../backend/commands";

export const SELF_HISTORY_OVERLAY_WINDOW_LABEL = "self-history-overlay";

export function canOpenSelfHistoryOverlayWindow() {
  return callBackend<boolean>("can_open_self_history_overlay").catch(() => false);
}

export function destroySelfHistoryOverlayWindow() {
  return callBackend<void>("destroy_self_history_overlay_window").catch(() => undefined);
}

export async function openSelfHistoryOverlayWindow() {
  const canOpen = await canOpenSelfHistoryOverlayWindow();
  if (!canOpen) {
    return false;
  }

  const existing = await WebviewWindow.getByLabel(SELF_HISTORY_OVERLAY_WINDOW_LABEL);

  if (existing) {
    await existing.show();
    await existing.setFocus();
    return true;
  }

  const overlayWindow = new WebviewWindow(SELF_HISTORY_OVERLAY_WINDOW_LABEL, {
    alwaysOnTop: true,
    center: true,
    decorations: false,
    focus: true,
    height: 800,
    minHeight: 700,
    minWidth: 1200,
    resizable: true,
    title: "Self History",
    url: selfHistoryOverlayWindowUrl(),
    width: 1400,
  });
  void overlayWindow.once("tauri://error", () => {
    console.warn("Self history overlay window could not be opened.");
  });
  return true;
}

export function selfHistoryOverlayWindowUrl() {
  return "index.html#/self-history-overlay";
}

export function isSelfHistoryOverlayHash(hash: string) {
  return hash === "#/self-history-overlay";
}
