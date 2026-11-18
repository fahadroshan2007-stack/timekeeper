export type TimekeeperMode = "timer" | "stopwatch";
export type TimekeeperStatus = "idle" | "running" | "paused";

export class Timekeeper {
  readonly mode: TimekeeperMode;
  private status: TimekeeperStatus = "idle";
  private initialSeconds: number;
  private endsAtMs: number | null = null;
  private consumedSeconds: number;
  private startedAtMs: number | null = null;

  constructor(mode: TimekeeperMode, initialSeconds = 25 * 60) {
    this.mode = mode;
    this.initialSeconds = initialSeconds;
    this.consumedSeconds = 0;
  }

  getStatus(): TimekeeperStatus {
    return this.status;
  }

  start(): void {
    if (this.mode === "timer") {
      this.endsAtMs = Date.now() + this.initialSeconds * 1000;
    } else {
      this.startedAtMs = Date.now();
    }
    this.status = "running";
  }

  pause(): void {
    if (this.status !== "running") return;
    if (this.mode === "timer") {
      const remainingMs = this.endsAtMs ? Math.max(0, this.endsAtMs - Date.now()) : 0;
      this.consumedSeconds = Math.max(0, this.initialSeconds - remainingMs / 1000);
      this.endsAtMs = null;
    } else {
      this.consumedSeconds += this.startedAtMs ? Date.now() - this.startedAtMs : 0;
      this.startedAtMs = null;
    }
    this.status = "paused";
  }

  resume(): void {
    if (this.status !== "paused") return;
    if (this.mode === "timer") {
      this.endsAtMs = Date.now() + Math.max(0, this.initialSeconds - this.consumedSeconds) * 1000;
    } else {
      this.startedAtMs = Date.now();
    }
    this.status = "running";
  }

  reset(): void {
    this.status = "idle";
    this.endsAtMs = null;
    this.startedAtMs = null;
    this.consumedSeconds = 0;
  }

  stop(): number {
    const elapsed =
      this.mode === "stopwatch"
        ? this.consumedSeconds + (this.startedAtMs ? Date.now() - this.startedAtMs : 0)
        : this.getElapsedSeconds();
    this.reset();
    return elapsed;
  }

  getElapsedSeconds(): number {
    if (this.status === "idle") return 0;
    if (this.mode === "stopwatch") {
      return this.consumedSeconds + (this.startedAtMs ? Date.now() - this.startedAtMs : 0);
    }
    if (this.endsAtMs === null) return this.consumedSeconds;
    const remainingMs = Math.max(0, this.endsAtMs - Date.now());
    return Math.max(0, this.initialSeconds - remainingMs / 1000);
  }
}
