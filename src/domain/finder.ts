import type { Pass } from './types';

/** Clockwise turn from current heading to target, in [-180, 180). */
export function shortestTurn(current: number, target: number): number {
  return ((((target - current + 540) % 360) + 360) % 360) - 180;
}
export function pointingInstruction(turn: number): string {
  return Math.abs(turn) <= 5
    ? 'Facing the satellite'
    : `Turn ${turn > 0 ? 'right' : 'left'} ${Math.round(Math.abs(turn))}°`;
}
/** Progress follows the real clock even when a future pass was selected. */
export function passProgress(pass: Pick<Pass, 'start' | 'end'>, now: number) {
  if (![pass.start, pass.end, now].every(Number.isFinite) || pass.end <= pass.start) return null;
  const progress = Math.max(0, Math.min(1, (now - pass.start) / (pass.end - pass.start)));
  return {
    progress,
    status:
      now < pass.start
        ? ('upcoming' as const)
        : now >= pass.end
          ? ('complete' as const)
          : ('active' as const),
    x: 40 + 320 * progress,
    y: 90 - 80 * progress * (1 - progress),
  };
}
