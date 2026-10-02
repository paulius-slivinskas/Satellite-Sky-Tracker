import { lookAngles } from './orbits';
import type { Observer, Satellite } from './types';

/** Clockwise turn from current heading to target, in [-180, 180). */
export function shortestTurn(current: number, target: number): number {
  return ((((target - current + 540) % 360) + 360) % 360) - 180;
}
export function pointingInstruction(turn: number): string {
  return Math.abs(turn) <= 5
    ? 'Facing the satellite'
    : `Turn ${turn > 0 ? 'right' : 'left'} ${Math.round(Math.abs(turn))}°`;
}
export function finderTrajectory(satellite: Satellite, observer: Observer, now: number) {
  return [0, 15, 30, 45, 60].flatMap((seconds) => {
    const look = lookAngles(satellite, now + seconds * 1000, observer);
    return look ? [{ ...look, seconds }] : [];
  });
}
/** Bounded three-hour horizon preview; independent of the map simulation. */
export function nextHorizonPreview(satellite: Satellite, observer: Observer, now: number) {
  const initial = lookAngles(satellite, now, observer);
  if (!initial || initial.elevation >= 0) return null;
  let previous = now;
  for (let at = now + 30000; at <= now + 3 * 3600000; at += 30000) {
    const look = lookAngles(satellite, at, observer);
    if (!look) return null;
    if (look.elevation >= 0) {
      let low = previous;
      let high = at;
      for (let step = 0; step < 8; step++) {
        const mid = (low + high) / 2;
        const position = lookAngles(satellite, mid, observer);
        if (!position) return null;
        if (position.elevation >= 0) high = mid;
        else low = mid;
      }
      const rise = lookAngles(satellite, high, observer);
      return rise ? { at: high, ...rise } : null;
    }
    previous = at;
  }
  return null;
}
