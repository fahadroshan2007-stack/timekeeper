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
    void startDragging();
  };

  handle.addEventListener("pointerdown", onPointerDown);
  return () => handle.removeEventListener("pointerdown", onPointerDown);
}
