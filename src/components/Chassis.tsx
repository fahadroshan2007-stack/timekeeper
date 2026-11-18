import type { TimekeeperMode, TimekeeperStatus } from "../lib/timekeeper";

interface ChassisProps {
  mode: TimekeeperMode;
  status: TimekeeperStatus;
  displaySeconds: number;
  onModeChange: (mode: TimekeeperMode) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onStop: () => void;
  logging: boolean;
  onLog: () => void;
  onSettings: () => void;
}

function formatDisplay(seconds: number): string {
  const abs = Math.max(0, Math.floor(seconds));
  const s = abs % 60;
  const m = Math.floor(abs / 60) % 60;
  const h = Math.floor(abs / 3600);
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const key =
  "h-11 rounded-xl border border-[#a89a76] bg-[#d6c7a1] font-mono text-[11px] font-bold uppercase tracking-wider text-[#3a2f1d] shadow-[0_4px_0_#8a7d55,0_6px_10px_rgba(0,0,0,0.35)] transition-transform active:translate-y-[3px] active:shadow-[0_1px_0_#8a7d55] hover:bg-[#e3d5b0] disabled:opacity-50";

export default function Chassis({
  mode,
  status,
  displaySeconds,
  onModeChange,
  onStart,
  onPause,
  onResume,
  onReset,
  onStop,
  logging,
  onLog,
  onSettings,
}: ChassisProps) {
  return (
    <section
      data-testid="chassis"
      className="relative min-h-0 flex-1 rounded-t-2xl bg-gradient-to-b from-[#2a2f3f] via-[#1e2433] to-[#121622] p-3 shadow-2xl"
    >
      {/* small logo plate */}
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.35em] text-[#c9a959]">
          TimeKeeper
        </span>
        <button
          type="button"
          data-testid="key-settings"
          onClick={onSettings}
          title="Settings (Notion API)"
          className="rounded-full border border-[#3a415a] bg-[#171b28] px-2.5 py-1 font-mono text-[11px] text-[#c9d1e0] shadow-inner hover:text-white"
        >
          …
        </button>
      </div>

      {/* LCD */}
      <div className="mb-2 rounded-lg border-2 border-[#0a0d17] bg-black p-2 shadow-inner">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-[#3f6a4f]">
            {mode === "timer" ? "Timer" : "Stopwatch"} · {status}
          </span>
          <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-[#3f6a4f]">
            min
          </span>
        </div>
        <div
          data-testid="lcd-display"
          className="text-right font-mono text-3xl tracking-[0.2em] text-[#4ade80] [text-shadow:0_0_6px_rgba(74,222,128,0.6)]"
        >
          {formatDisplay(displaySeconds)}
        </div>
      </div>

      {/* mode toggle keys */}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="mode-timer"
          onClick={() => onModeChange("timer")}
          aria-pressed={mode === "timer"}
          className={`${key} ${
            mode === "timer" ? "bg-[#c9a959]" : "opacity-70"
          }`}
        >
          Timer
        </button>
        <button
          type="button"
          data-testid="mode-stopwatch"
          onClick={() => onModeChange("stopwatch")}
          aria-pressed={mode === "stopwatch"}
          className={`${key} ${
            mode === "stopwatch" ? "bg-[#c9a959]" : "opacity-70"
          }`}
        >
          Stopwatch
        </button>
      </div>

      {/* transport keys */}
      <div className="grid grid-cols-4 gap-2">
        {status === "idle" ? (
          <button type="button" data-testid="tk-start" onClick={onStart} className={key}>
            Start
          </button>
        ) : status === "running" ? (
          <button type="button" data-testid="tk-pause" onClick={onPause} className={key}>
            Pause
          </button>
        ) : (
          <button type="button" data-testid="tk-resume" onClick={onResume} className={key}>
            Resume
          </button>
        )}
        <button type="button" data-testid="tk-reset" onClick={onReset} className={key}>
          Reset
        </button>
        <button
          type="button"
          data-testid="tk-stop"
          onClick={onStop}
          disabled={status === "idle"}
          className={key}
        >
          Stop ✓
        </button>
        <button
          type="button"
          data-testid="key-log"
          onClick={onLog}
          disabled={logging}
          className="h-11 rounded-xl border border-[#7f1d1d] bg-[#b91c1c] font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-white shadow-[0_4px_0_#7f1d1d,0_6px_10px_rgba(0,0,0,0.4)] transition-transform active:translate-y-[3px] active:shadow-[0_1px_0_#7f1d1d] hover:bg-[#dc2626] disabled:opacity-50"
        >
          {logging ? "…" : "Log"}
        </button>
      </div>
    </section>
  );
}
