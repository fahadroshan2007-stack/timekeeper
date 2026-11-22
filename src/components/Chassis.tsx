import type { ReactNode } from "react";
import type { TimekeeperMode, TimekeeperStatus } from "../lib/timekeeper";

interface ChassisProps {
  mode: TimekeeperMode;
  status: TimekeeperStatus;
  displaySeconds: number;
  elapsedSeconds: number;
  timerPreset: number;
  activeLabel: string | null;
  sessionPrompt?: ReactNode;
  onModeChange: (mode: TimekeeperMode) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onStop: () => void;
  onOpenNotion: () => void;
  onSettings: () => void;
  onMinimize: () => void;
  onClose: () => void;
  onTimerPreset: (minutes: number) => void;
  theme: "espresso" | "late";
  onToggleTheme: () => void;
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

export default function Chassis({
  mode,
  status,
  displaySeconds,
  elapsedSeconds,
  timerPreset,
  activeLabel,
  sessionPrompt,
  onModeChange,
  onStart,
  onPause,
  onResume,
  onReset,
  onStop,
  onOpenNotion,
  onSettings,
  onMinimize,
  onClose,
  onTimerPreset,
  theme,
  onToggleTheme,
}: ChassisProps) {
  const isStopwatch = mode === "stopwatch";
  const startPauseLabel = status === "running" ? "PAUSE" : status === "paused" ? "RESUME" : "START";
  const stopResetLabel = isStopwatch ? (elapsedSeconds > 0 ? "STOP" : "RESET") : "RESET";

  const modeLabel = isStopwatch
    ? status === "running"
      ? "STOPWATCH // LIVE"
      : "STOPWATCH // STANDBY"
    : status === "running"
      ? "TIMER // RUNNING"
      : status === "paused"
        ? "TIMER // PAUSED"
        : "TIMER // READY";

  const handleStartPause = () => {
    if (status === "running") onPause();
    else if (status === "paused") onResume();
    else onStart();
  };

  const handleStopReset = () => {
    if (isStopwatch && elapsedSeconds > 0) {
      onStop();
    } else {
      onReset();
    }
  };

  return (
    <section data-testid="chassis" className="typewriter-chassis">
      {/* Header: brand plate + focus indicator + window controls */}
      <div className="chassis-header">
        <span className="brand-plate">TIMEKEEPER // MK-I</span>
        <div className="chassis-header-right">
          <span
            data-testid="active-focus"
            className={`active-focus ${activeLabel ? "is-set" : ""}`}
            title={activeLabel ?? "No focus selected"}
          >
            {activeLabel ? `FOCUS: ${activeLabel.toUpperCase()}` : "NO FOCUS SET"}
          </span>
          <button
            type="button"
            data-testid="key-theme"
            onClick={onToggleTheme}
            title={theme === "late" ? "Switch to Olivetti Espresso" : "Switch to Noir & Brass (late night)"}
            className="icon-key"
            aria-pressed={theme === "late"}
          >
            {theme === "late" ? "◑" : "◐"}
          </button>
          <button
            type="button"
            data-testid="key-minimize"
            onClick={onMinimize}
            title="Minimize"
            className="icon-key"
          >
            –
          </button>
          <button
            type="button"
            data-testid="key-close"
            onClick={onClose}
            title="Close"
            className="icon-key close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Session-end label-maker ribbon (only when open) */}
      {sessionPrompt}

      {/* LCD deck */}
      <div className="lcd-deck">
        <div className="lcd-row">
          <div className="lcd-screen">
            <div className="lcd-meta">
              <span className={`lcd-mode-label ${isStopwatch ? "is-stopwatch" : ""}`}>
                {modeLabel}
              </span>
              <span className="lcd-badge">
                {isStopwatch ? "COUNT UP" : `${timerPreset}M TARGET`}
              </span>
            </div>
            <div
              data-testid="lcd-display"
              className={`lcd-digits ${isStopwatch ? "is-stopwatch" : ""}`}
            >
              {formatDisplay(displaySeconds)}
            </div>
          </div>

          <div className="lcd-side">
            <div className="mode-rocker" title="Countdown timer vs stopwatch">
              <button
                type="button"
                data-testid="mode-timer"
                aria-pressed={!isStopwatch}
                className={!isStopwatch ? "active" : ""}
                onClick={() => onModeChange("timer")}
              >
                TMR
              </button>
              <button
                type="button"
                data-testid="mode-stopwatch"
                aria-pressed={isStopwatch}
                className={isStopwatch ? "active" : ""}
                onClick={() => onModeChange("stopwatch")}
              >
                SW
              </button>
            </div>

            {!isStopwatch && (
              <div className="preset-row">
                {[15, 25, 45].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    data-testid={`preset-${mins}`}
                    onClick={() => onTimerPreset(mins)}
                    className={`preset-btn ${timerPreset === mins ? "active" : ""}`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Keycaps */}
      <div className="key-row">
        <button type="button" data-testid="tk-start" onClick={handleStartPause} className="tw-key tw-key-cream">
          <span id="key-start-label">{startPauseLabel}</span>
        </button>
        <button type="button" data-testid="tk-stop-reset" onClick={handleStopReset} className="tw-key tw-key-cream">
          <span>{stopResetLabel}</span>
        </button>
        <button
          type="button"
          data-testid="key-notion"
          onClick={onOpenNotion}
          title="Open the Notion database"
          className="tw-key tw-key-red"
        >
          <span>NOTION ↗</span>
        </button>
        <button
          type="button"
          data-testid="key-settings"
          onClick={onSettings}
          title="Notion API settings"
          className="tw-key tw-key-dark"
        >
          <span>•••</span>
        </button>
      </div>
    </section>
  );
}
