import type { Observer, Pass, PassRange, Satellite, SatellitePass } from './types';
import { footprintDelta, lookAngles } from './orbits';
const crossing = (a: number, av: number, b: number, bv: number) =>
  a + (b - a) * Math.max(0, Math.min(1, av / (av - bv || 1)));
// Preserves the original five-second elevation search and footprint-consistent LOS boundary.
function findElevationPasses(
  sat: Satellite,
  observer: Observer,
  now: number,
  range: PassRange,
  rollingWindow = false,
): Pass[] {
  if (
    !Number.isFinite(now) ||
    !['3h', '5h', '12h', '1', '2', '3', 'upcoming3', 'upcoming5'].includes(range)
  )
    return [];
  const upcoming = range.startsWith('upcoming');
  const hourly = range.endsWith('h');
  const startDate = new Date(now);
  if (!upcoming && !hourly && !rollingWindow) startDate.setHours(0, 0, 0, 0);
  const start = startDate.getTime();
  const hours = upcoming ? 72 : hourly ? Number(range.slice(0, -1)) : Number(range) * 24;
  const end = start + hours * 3600000;
  if (!Number.isFinite(start) || !Number.isFinite(new Date(end).getTime())) return [];
  const limit = upcoming ? Number(range.slice(-1)) : 512;
  const passes: Pass[] = [];
  let active: Pass | null = null;
  let previous: { time: number; elevation: number } | null = null;
  for (let time = start; time <= end; time += 5000) {
    const look = lookAngles(sat, time, observer);
    // A propagation gap cannot establish a continuous, valid pass.
    if (!look) {
      active = null;
      previous = null;
      continue;
    }
    if (!active && look.elevation >= 0) {
      const rise = previous
        ? crossing(previous.time, previous.elevation, time, look.elevation)
        : time;
      active = {
        start: rise,
        end,
        maxAt: time,
        maxElevation: look.elevation,
        losStart: rise,
        losEnd: end,
        riseAz: null,
        setAz: null,
        maxAz: null,
        ...(rollingWindow && !previous ? { startClipped: true } : {}),
      };
    }
    if (active) {
      if (look.elevation > active.maxElevation) {
        active.maxElevation = look.elevation;
        active.maxAt = time;
      }
      if (look.elevation < 0) {
        active.end = previous
          ? crossing(previous.time, previous.elevation, time, look.elevation)
          : time;
        passes.push(active);
        active = null;
        if (passes.length >= limit) break;
      }
    }
    previous = { time, elevation: look.elevation };
  }
  if (active && active.start < end) {
    if (rollingWindow) active.endClipped = true;
    passes.push(active);
  }
  return passes;
}
// The selected range chooses events; it must not masquerade as an orbital horizon crossing.
function completeWindowEdges(sat: Satellite, observer: Observer, original: Pass): Pass {
  if (!original.startClipped && !original.endClipped) return original;
  const pass = { ...original };
  const meanMotion = sat.satrec?.no;
  const period =
    Number.isFinite(meanMotion) && meanMotion > 0 ? ((2 * Math.PI) / meanMotion) * 60000 : 7200000;
  // Continuously visible/high-orbit objects must not make the worker search indefinitely.
  const extension = Math.min(86400000, Math.max(1800000, period));
  for (const direction of [-1, 1] as const) {
    const field = direction < 0 ? 'start' : 'end';
    const clipped = direction < 0 ? 'startClipped' : 'endClipped';
    if (!pass[clipped]) continue;
    let lastTime = pass[field];
    let last = lookAngles(sat, lastTime, observer);
    if (!last || last.elevation < 0) continue;
    for (let elapsed = 5000; elapsed <= extension; elapsed += 5000) {
      const time = pass[field] + direction * elapsed;
      const look = lookAngles(sat, time, observer);
      if (!look) break;
      if (look.elevation < 0) {
        pass[field] = crossing(lastTime, last.elevation, time, look.elevation);
        delete pass[clipped];
        break;
      }
      if (look.elevation > pass.maxElevation) {
        pass.maxElevation = look.elevation;
        pass.maxAt = time;
      }
      lastTime = time;
      last = look;
    }
    // Keep the known span internally, but never label this bound as an observed rise/set.
    if (pass[clipped]) pass[field] = lastTime;
  }
  return pass;
}

function withFootprintDetails(sat: Satellite, observer: Observer, pass: Pass): Pass {
  // Search outwards from the peak, stopping at the first footprint boundary.
  const findBoundary = (direction: -1 | 1) => {
    let lastTime = pass.maxAt;
    let lastDelta = footprintDelta(sat, observer, lastTime);
    const fallback = direction < 0 ? pass.start : pass.end;
    if (!Number.isFinite(lastDelta) || lastDelta < 0) return fallback;
    const bound = direction < 0 ? pass.start - 2700000 : pass.end + 2700000;
    for (
      let time = lastTime + direction * 2000;
      direction < 0 ? time >= bound : time <= bound;
      time += direction * 2000
    ) {
      const delta = footprintDelta(sat, observer, time);
      if (!Number.isFinite(delta)) return fallback;
      if (delta < 0) return crossing(lastTime, lastDelta, time, delta);
      lastDelta = delta;
      lastTime = time;
    }
    return fallback;
  };
  const losStart = findBoundary(-1),
    losEnd = findBoundary(1);
  return {
    ...pass,
    losStart,
    losEnd,
    riseAz: lookAngles(sat, losStart, observer)?.azimuth ?? null,
    setAz: lookAngles(sat, losEnd, observer)?.azimuth ?? null,
    maxAz: lookAngles(sat, pass.maxAt, observer)?.azimuth ?? null,
  };
}

// Legacy single-satellite API retains local-midnight day ranges.
export function predictPasses(
  sat: Satellite,
  observer: Observer,
  now: number,
  range: PassRange,
): Pass[] {
  return findElevationPasses(sat, observer, now, range).map((pass) =>
    withFootprintDetails(sat, observer, pass),
  );
}

export function predictWatchlistPasses(
  satellites: Satellite[],
  observer: Observer,
  now: number,
  range: PassRange,
  minElevation = 0,
): SatellitePass[] {
  if (
    !Number.isFinite(minElevation) ||
    minElevation < 0 ||
    minElevation > 90 ||
    !Number.isFinite(now) ||
    !['3h', '5h', '12h', '1', '2', '3', 'upcoming3', 'upcoming5'].includes(range)
  )
    return [];
  const unique = new Map<string, Satellite>();
  for (const satellite of satellites)
    if (!unique.has(satellite.noradId)) unique.set(satellite.noradId, satellite);
  const candidates = [...unique.values()].flatMap((sat) =>
    findElevationPasses(
      sat,
      observer,
      now,
      minElevation > 0 && range.startsWith('upcoming') ? '3' : range,
      true,
    )
      .map((pass) => completeWindowEdges(sat, observer, pass))
      .filter((pass) => pass.end > now && pass.maxElevation >= minElevation)
      .map((pass) => ({ sat, pass })),
  );
  candidates.sort(
    (a, b) =>
      a.pass.start - b.pass.start ||
      a.sat.noradId.localeCompare(b.sat.noradId, 'en', { numeric: true }) ||
      a.pass.end - b.pass.end,
  );
  const selected = range.startsWith('upcoming')
    ? candidates.slice(0, Number(range.slice(-1)))
    : candidates;
  // Resolve the more expensive footprint boundaries only for the globally selected events.
  return selected.map(({ sat, pass }) => ({
    ...withFootprintDetails(sat, observer, pass),
    noradId: sat.noradId,
    satelliteName: sat.name,
    color: sat.color,
  }));
}
