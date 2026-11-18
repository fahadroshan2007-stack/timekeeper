import { useCallback, useEffect, useRef, useState } from "react";
import {
  Timekeeper,
  type TimekeeperMode,
  type TimekeeperStatus,
} from "../lib/timekeeper";
import { elapsedSecondsToMinutes } from "../lib/time";

export interface UseTimekeeperSessionResult {
  status: TimekeeperStatus;
  elapsedSeconds: number;
  /** Seconds shown on the LCD: remaining for a timer, elapsed for a stopwatch. */
  displaySeconds: number;
  mode: TimekeeperMode;
  initialSeconds: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => number;
  reset: () => void;
  promptOpen: boolean;
  promptMinutes: number;
  discardPrompt: () => void;
}

export interface UseTimekeeperSessionOptions {
  mode?: TimekeeperMode;
  initialSeconds?: number;
}

export function useTimekeeperSession({
  mode = "stopwatch",
  initialSeconds = 25 * 60,
}: UseTimekeeperSessionOptions = {}): UseTimekeeperSessionResult {
  const tkRef = useRef<Timekeeper>(new Timekeeper(mode, initialSeconds));

  const [status, setStatus] = useState<TimekeeperStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptMinutes, setPromptMinutes] = useState(0);

  // Recreate the engine when switching modes so each mode gets a fresh countdown/clock.
  useEffect(() => {
    tkRef.current = new Timekeeper(mode, initialSeconds);
    setStatus("idle");
    setElapsedSeconds(0);
    setPromptOpen(false);
    setPromptMinutes(0);
  }, [mode, initialSeconds]);

  // Live tick while running.
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(
      () => setElapsedSeconds(tkRef.current.getElapsedSeconds()),
      200
    );
    return () => clearInterval(id);
  }, [status]);

  const displaySeconds =
    mode === "timer" ? Math.max(0, initialSeconds - elapsedSeconds) : elapsedSeconds;

  const start = useCallback(() => {
    tkRef.current.start();
    setStatus("running");
    setElapsedSeconds(tkRef.current.getElapsedSeconds());
  }, []);

  const pause = useCallback(() => {
    tkRef.current.pause();
    setStatus("paused");
    setElapsedSeconds(tkRef.current.getElapsedSeconds());
  }, []);

  const resume = useCallback(() => {
    tkRef.current.resume();
    setStatus("running");
    setElapsedSeconds(tkRef.current.getElapsedSeconds());
  }, []);

  const stop = useCallback((): number => {
    const elapsed = tkRef.current.stop();
    const minutes = elapsedSecondsToMinutes(elapsed);
    setElapsedSeconds(0);
    setStatus("idle");
    const open = minutes > 0;
    setPromptOpen(open);
    setPromptMinutes(open ? minutes : 0);
    return elapsed;
  }, []);

  const reset = useCallback(() => {
    tkRef.current.reset();
    setElapsedSeconds(0);
    setStatus("idle");
  }, []);

  const discardPrompt = useCallback(() => {
    setPromptOpen(false);
    setPromptMinutes(0);
  }, []);

  return {
    status,
    elapsedSeconds,
    displaySeconds,
    mode,
    initialSeconds,
    start,
    pause,
    resume,
    stop,
    reset,
    promptOpen,
    promptMinutes,
    discardPrompt,
  };
}
