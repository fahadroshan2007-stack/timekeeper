import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimekeeperSession } from "./useTimekeeperSession";

describe("useTimekeeperSession", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts idle with no prompt and zero elapsed", () => {
    const { result } = renderHook(() =>
      useTimekeeperSession({ mode: "stopwatch", initialSeconds: 60 })
    );

    expect(result.current.status).toBe("idle");
    expect(result.current.elapsedSeconds).toBe(0);
    expect(result.current.promptOpen).toBe(false);
  });

  it("auto-discards short sessions without opening the prompt", () => {
    const { result } = renderHook(() =>
      useTimekeeperSession({ mode: "timer", initialSeconds: 2 })
    );

    act(() => result.current.start());
    let elapsed = 0;
    act(() => {
      elapsed = result.current.stop();
    });

    expect(elapsed).toBeLessThanOrEqual(2);
    expect(result.current.status).toBe("idle");
    expect(result.current.promptOpen).toBe(false);
  });

  it("opens the session-end prompt for sessions that yield minutes", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useTimekeeperSession({ mode: "timer", initialSeconds: 20 })
    );

    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(16000);
    });
    let elapsed = 0;
    act(() => {
      elapsed = result.current.stop();
    });

    expect(elapsed).toBeGreaterThanOrEqual(15);
    expect(result.current.promptOpen).toBe(true);
    expect(result.current.promptMinutes).toBeGreaterThan(0);
  });
});
