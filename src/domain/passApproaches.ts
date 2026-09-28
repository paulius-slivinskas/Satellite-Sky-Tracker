import type { SatellitePass } from './types';

/** One incoming route per satellite; never draw ahead of an ongoing pass. */
export function nextPassApproaches(passes: SatellitePass[], time: number) {
  if (!Number.isFinite(time)) return [];
  const ongoing = new Set<string>();
  const next = new Map<string, { pass: SatellitePass; index: number }>();
  passes.forEach((pass, index) => {
    if (
      !pass.noradId ||
      ![pass.start, pass.end, pass.losStart, pass.losEnd].every(Number.isFinite) ||
      pass.start >= pass.end ||
      pass.losStart >= pass.losEnd
    )
      return;
    if (pass.losStart <= time && time < pass.losEnd) ongoing.add(pass.noradId);
    if (pass.losStart <= time) return;
    const previous = next.get(pass.noradId);
    if (!previous || pass.losStart < previous.pass.losStart)
      next.set(pass.noradId, { pass, index });
  });
  return [...next.values()]
    .filter(({ pass }) => !ongoing.has(pass.noradId))
    .sort((a, b) => a.pass.losStart - b.pass.losStart || a.index - b.index);
}
