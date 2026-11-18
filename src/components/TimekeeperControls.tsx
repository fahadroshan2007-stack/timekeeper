import type { TimekeeperStatus } from "../lib/timekeeper";

interface TimekeeperControlsProps {
  status: TimekeeperStatus;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
}

export default function TimekeeperControls({
  status,
  onStart,
  onPause,
  onResume,
  onReset,
}: TimekeeperControlsProps) {
  return (
    <div data-testid="timekeeper-controls">
      {status === "idle" && <button data-testid="tk-start" onClick={onStart}>Start</button>}
      {status === "running" && <button data-testid="tk-pause" onClick={onPause}>Pause</button>}
      {status === "paused" && <button data-testid="tk-resume" onClick={onResume}>Resume</button>}
      <button data-testid="tk-reset" onClick={onReset}>Reset</button>
    </div>
  );
}
