import type { Satellite } from './types';
import { normalizeSatelliteName as normalize, satelliteNames } from './satelliteNames';
export function searchSatellites(satellites: Satellite[], query: string, limit = 16): Satellite[] {
  const q = normalize(query);
  if (!q) return satellites.slice(0, limit);
  const terms = query
    .split(/[\s/(),;]+/)
    .map(normalize)
    .filter(Boolean);
  return satellites
    .map((sat) => {
      const names = [...satelliteNames(sat).map(normalize), normalize(sat.noradId)];
      const score = names.some((name) => name === q)
        ? 0
        : names.some((name) => name.startsWith(q))
          ? 1
          : names.some((name) => name.includes(q))
            ? 2
            : terms.every((term) => names.some((name) => name.includes(term)))
              ? 3
              : 99;
      return { sat, score };
    })
    .filter((row) => row.score < 99)
    .sort((a, b) => a.score - b.score || a.sat.name.localeCompare(b.sat.name))
    .slice(0, limit)
    .map((row) => row.sat);
}
