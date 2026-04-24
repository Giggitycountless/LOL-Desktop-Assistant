import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export const SELF_HISTORY_OVERLAY_WINDOW_LABEL = "self-history-overlay";

export async function openSelfHistoryOverlayWindow() {
  const existing = await WebviewWindow.getByLabel(SELF_HISTORY_OVERLAY_WINDOW_LABEL);

  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }

  const overlayWindow = new WebviewWindow(SELF_HISTORY_OVERLAY_WINDOW_LABEL, {
    alwaysOnTop: true,
    center: false,
    decorations: true,
    focus: true,
    height: 560,
    minHeight: 440,
    minWidth: 320,
    resizable: true,
    title: "Self History",
    url: selfHistoryOverlayWindowUrl(),
    width: 380,
  });
  void overlayWindow.once("tauri://error", () => {
    console.warn("Self history overlay window could not be opened.");
  });
}

export function selfHistoryOverlayWindowUrl() {
  return "index.html#/self-history-overlay";
}

export function isSelfHistoryOverlayHash(hash: string) {
  return hash === "#/self-history-overlay";
}
