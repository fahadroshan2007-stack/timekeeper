import { describe, it, expect } from "vitest";
import { elapsedSecondsToMinutes } from "./time";

describe("elapsedSecondsToMinutes", () => {
  it("converts elapsed seconds to rounded minutes", () => {
    expect(elapsedSecondsToMinutes(1500)).toBe(25);
  });

  it("uses a minimum of one minute for sessions at or above the threshold", () => {
    expect(elapsedSecondsToMinutes(15)).toBe(1);
    expect(elapsedSecondsToMinutes(20)).toBe(1);
  });

  it("discards sessions under 15 seconds", () => {
    expect(elapsedSecondsToMinutes(14)).toBe(0);
    expect(elapsedSecondsToMinutes(0)).toBe(0);
  });
});
