import { describe, it, expect, vi, afterEach } from "vitest";
import { attachChassisDrag } from "./windowDrag";

describe("attachChassisDrag", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("starts a drag when pointerdown originates on the chassis handle", () => {
    const startDragging = vi.fn().mockResolvedValue(undefined);
    const handle = document.createElement("div");
    document.body.appendChild(handle);

    const detach = attachChassisDrag(handle, { startDragging });
    handle.dispatchEvent(new Event("pointerdown"));

    expect(startDragging).toHaveBeenCalledTimes(1);
    detach();
  });

  it("does not start a drag when pointerdown originates from an interactive element", () => {
    const startDragging = vi.fn().mockResolvedValue(undefined);
    const handle = document.createElement("div");
    const button = document.createElement("button");
    handle.appendChild(button);
    document.body.appendChild(handle);

    const detach = attachChassisDrag(handle, { startDragging });
    button.dispatchEvent(new Event("pointerdown"));

    expect(startDragging).not.toHaveBeenCalled();
    detach();
  });
});
