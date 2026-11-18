import { describe, it, expect, afterEach, vi } from "vitest";
import { Timekeeper } from "./timekeeper";
describe("Timekeeper", () => {
  it("returns a countdown timer elapsed within bounds on stop", () => {
    const t = new Timekeeper("timer", 2);
    t.start();
    const elapsed = t.stop();
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThanOrEqual(2);
  });

  it("freezes a paused countdown timer and stops within bounds", () => {
    const t = new Timekeeper("timer", 2);
    t.start();
    t.pause();
    const elapsed = t.stop();
    expect(elapsed).toBeLessThanOrEqual(2);
    expect(t.getStatus()).toBe("idle");
  });

  describe("start() guard", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not reset a running session when start is called again", () => {
      vi.useFakeTimers();
      const t = new Timekeeper("timer", 60);
      t.start();
      vi.advanceTimersByTime(10000);

      const elapsedBefore = t.getElapsedSeconds();
      t.start();

      expect(t.getElapsedSeconds()).toBeGreaterThanOrEqual(elapsedBefore);
      expect(t.getStatus()).toBe("running");
    });

    it("does not replace a paused session with a fresh one", () => {
      vi.useFakeTimers();
      const t = new Timekeeper("timer", 60);
      t.start();
      vi.advanceTimersByTime(5000);
      t.pause();

      t.start();

      expect(t.getStatus()).toBe("paused");
      expect(t.getElapsedSeconds()).toBeGreaterThan(0);
    });
  });

  it("accumulates elapsed seconds for a stopwatch session", () => {
    const t = new Timekeeper("stopwatch");
    t.start();
    const elapsed = t.stop();
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThanOrEqual(5);
    expect(t.getStatus()).toBe("idle");
  });
});
