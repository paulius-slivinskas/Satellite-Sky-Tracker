import { lookAngles } from './orbits';
import type { Observer, Pass, Satellite } from './types';

/** Bounded propagation at real times, including both horizon crossings. */
export function skyTrail(
  satellite: Satellite,
  observer: Observer,
  from: number,
  to: number,
  stepMs = 15000,
) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];
  const count = Math.min(4096, Math.max(2, Math.ceil((to - from) / stepMs)));
  return Array.from({ length: count + 1 }, (_, index) => {
    const time = from + ((to - from) * index) / count;
    return { time, look: lookAngles(satellite, time, observer) };
  });
}
export function passSkyTrail(satellite: Satellite, observer: Observer, pass: Pass) {
  return skyTrail(satellite, observer, pass.start, pass.end, 5000);
}
