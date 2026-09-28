import type { Satellite, SatellitePass } from './types';

export type PassNotificationKind = 'entering' | 'peak';

type Sample = { satellite: Satellite; elevation: number | null };
type Previous = { elevation: number | null; time: number; alertedAt: number };

// Observe real horizon crossings, independently of the displayed prediction range.
export class PassStartDetector {
  private previous = new Map<string, Previous>();

  sample(samples: Sample[], now: number): Satellite[] {
    const present = new Set(samples.map(({ satellite }) => satellite.noradId));
    for (const id of this.previous.keys()) if (!present.has(id)) this.previous.delete(id);
    const started: Satellite[] = [];
    for (const { satellite, elevation } of samples) {
      const before = this.previous.get(satellite.noradId);
      const valid = elevation !== null && Number.isFinite(elevation);
      const crossed =
        valid &&
        before?.elevation != null &&
        before.elevation < 0 &&
        elevation >= 0 &&
        now > before.time &&
        now - before.time <= 90000 &&
        now - before.alertedAt > 10 * 60000;
      if (crossed) started.push(satellite);
      this.previous.set(satellite.noradId, {
        elevation: valid ? elevation : null,
        time: now,
        alertedAt: crossed ? now : (before?.alertedAt ?? -Infinity),
      });
    }
    return started;
  }
}

// Keep the displayed marker's exact timestamp for the same pass. Rolling live
// predictions cover events outside the user's selected range or simulation date.
export function notificationPasses(live: SatellitePass[], displayed: SatellitePass[]) {
  return live.map(
    (pass) =>
      displayed.find(
        (candidate) =>
          candidate.noradId === pass.noradId &&
          Math.abs(candidate.start - pass.start) < 60000 &&
          Math.abs(candidate.end - pass.end) < 60000 &&
          !candidate.startClipped &&
          !candidate.endClipped,
      ) ?? pass,
  );
}

export class PassPeakDetector {
  private previousTime: number | null = null;
  private notified: SatellitePass[] = [];

  sample(passes: SatellitePass[], now: number): SatellitePass[] {
    const previous = this.previousTime;
    this.previousTime = now;
    this.notified = this.notified.filter((pass) => pass.end + 60000 > now);
    if (previous === null || now <= previous || now - previous > 90000) return [];
    const peaks: SatellitePass[] = [];
    for (const pass of passes) {
      // A clipped search can only report a provisional highest point, not a peak.
      if (
        pass.startClipped ||
        pass.endClipped ||
        !Number.isFinite(pass.maxAt) ||
        pass.maxAt <= previous ||
        pass.maxAt > now ||
        pass.end <= now ||
        this.notified.some(
          (seen) => seen.noradId === pass.noradId && seen.start < pass.end && seen.end > pass.start,
        )
      )
        continue;
      peaks.push(pass);
      this.notified.push(pass);
    }
    return peaks;
  }
}
