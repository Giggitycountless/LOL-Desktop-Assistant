import { listen, type EventCallback } from "@tauri-apps/api/event";

export function listenWithCleanup<T>(eventName: string, handler: EventCallback<T>) {
  let isDisposed = false;
  let unlisten: (() => void) | undefined;

  void listen<T>(eventName, handler).then((handlerCleanup) => {
    if (isDisposed) {
      handlerCleanup();
      return;
    }

    unlisten = handlerCleanup;
  });

  return () => {
    isDisposed = true;
    unlisten?.();
  };
}
