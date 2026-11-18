export function elapsedSecondsToMinutes(elapsedSeconds: number): number {
  if (elapsedSeconds < 15) {
    return 0;
  }

  return Math.max(1, Math.round(elapsedSeconds / 60));
}
