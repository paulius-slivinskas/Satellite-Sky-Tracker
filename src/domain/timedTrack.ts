import { positionAt } from './orbits';
import type { Satellite } from './types';

export interface TimedPoint {
  time: number;
  lat: number;
  lon: number;
}
const MAX_INTERVALS = 128;
const MAX_CHUNKS = 4096;

/** Fixed-grid samples for one bounded trajectory chunk; never bridges missing propagation. */
export function timedTrackSegments(
  sat: Satellite,
  from: number,
  to: number,
  step: number,
): TimedPoint[][] {
  if (
    ![from, to, step].every(Number.isFinite) ||
    to <= from ||
    step <= 0 ||
    Math.abs(from) > 8640000000000000 ||
    Math.abs(to) > 8640000000000000
  )
    return [];
  // Epoch-sized anchors lose sub-millisecond precision when fractional chunk
  // durations are added/subtracted. Do not mistake that roundoff for interval129.
  const roundoffMs = Number.EPSILON * Math.max(Math.abs(from), Math.abs(to), step) * 4;
  const intervals = Math.max(1, Math.ceil((to - from - roundoffMs) / step));
  if (!Number.isSafeInteger(intervals) || intervals < 1 || intervals > MAX_INTERVALS) return [];
  const segments: TimedPoint[][] = [];
  let current: TimedPoint[] = [];
  const append = (point: TimedPoint) => {
    const previous = current.at(-1);
    if (
      !previous ||
      previous.time !== point.time ||
      previous.lat !== point.lat ||
      previous.lon !== point.lon
    )
      current.push(point);
  };
  const flush = () => {
    if (current.length > 1) segments.push(current);
    current = [];
  };
  for (let index = 0; index <= intervals; index++) {
    const time = index === intervals ? to : from + index * step;
    const position = positionAt(sat, time);
    if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lon)) {
      flush();
      continue;
    }
    const point: TimedPoint = { time, lat: position.lat, lon: position.lon };
    const previous = current.at(-1);
    if (previous && Math.abs(point.lon - previous.lon) > 180) {
      const edge = previous.lon > 0 ? 180 : -180;
      const unwrappedLongitude = point.lon + (previous.lon > 0 ? 360 : -360);
      const delta = unwrappedLongitude - previous.lon;
      const fraction = delta === 0 ? 0 : Math.max(0, Math.min(1, (edge - previous.lon) / delta));
      const seam = {
        time: previous.time + (time - previous.time) * fraction,
        lat: previous.lat + (point.lat - previous.lat) * fraction,
        lon: edge,
      };
      append(seam);
      flush();
      append({ ...seam, lon: -edge });
    }
    append(point);
  }
  flush();
  return segments;
}

/** Interpolate cumulative screen distance in O(log n); inputs must be ordered by time. */
export function distanceAtTime(times: number[], cumulative: number[], time: number): number {
  const last = times.length - 1;
  if (
    last < 0 ||
    cumulative.length !== times.length ||
    Number.isNaN(time) ||
    ![times[0], times[last], cumulative[0], cumulative[last]].every(Number.isFinite)
  )
    return 0;
  if (time <= times[0]) return cumulative[0];
  if (time >= times[last]) return cumulative[last];
  let left = 0,
    right = last;
  while (left + 1 < right) {
    const middle = Math.floor((left + right) / 2);
    if (times[middle] <= time) left = middle;
    else right = middle;
  }
  const span = times[right] - times[left];
  if (
    !Number.isFinite(span) ||
    span <= 0 ||
    !Number.isFinite(cumulative[left]) ||
    !Number.isFinite(cumulative[right])
  )
    return 0;
  return (
    cumulative[left] +
    (cumulative[right] - cumulative[left]) * Math.max(0, Math.min(1, (time - times[left]) / span))
  );
}

/** Anchored integer chunks intersecting [from, to); exact end boundaries are excluded. */
export function trackChunkRange(from: number, to: number, duration: number): number[] {
  if (![from, to, duration].every(Number.isFinite) || to <= from || duration <= 0) return [];
  const nearInteger = (value: number) => {
    const rounded = Math.round(value);
    return Math.abs(value - rounded) <= Number.EPSILON * Math.abs(value) * 4 ? rounded : value;
  };
  const first = Math.floor(nearInteger(from / duration)),
    last = Math.ceil(nearInteger(to / duration)) - 1;
  const count = last - first + 1;
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    count < 1 ||
    count > MAX_CHUNKS
  )
    return [];
  return Array.from({ length: count }, (_, index) => first + index);
}
