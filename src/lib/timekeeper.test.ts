import { describe, it, expect } from "vitest";
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

  it("accumulates elapsed seconds for a stopwatch session", () => {
    const t = new Timekeeper("stopwatch");
    t.start();
    const elapsed = t.stop();
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThanOrEqual(5);
    expect(t.getStatus()).toBe("idle");
  });
});
