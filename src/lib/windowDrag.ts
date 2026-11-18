import { getCurrentWindow } from "@tauri-apps/api/window";

const INTERACTIVE_SELECTOR = [
  "button",
  "input",
  "textarea",
  "select",
  "a",
  "[contenteditable]",
  "[data-tauri-interactive]",
].join(",");

export interface AttachChassisDragOptions {
  startDragging?: () => Promise<void>;
  onError?: (error: unknown) => void;
}

export function attachChassisDrag(
  handle: HTMLElement,
  options?: AttachChassisDragOptions
): () => void {
  const startDragging =
    options?.startDragging ?? (() => getCurrentWindow().startDragging());

  const onPointerDown = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (target && target.closest(INTERACTIVE_SELECTOR)) {
      return;
    }
    // Surface failures (e.g. missing Tauri permission) instead of dying silently.
    startDragging().catch((error) => {
      if (options?.onError) {
        options.onError(error);
      } else {
        console.error("startDragging failed:", error);
      }
    });
  };

  handle.addEventListener("pointerdown", onPointerDown);
  return () => handle.removeEventListener("pointerdown", onPointerDown);
}
