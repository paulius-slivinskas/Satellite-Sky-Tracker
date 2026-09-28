import type { Radio } from '../domain/types';
import { request } from './http';
const cache = new Map<string, { at: number; value: SatelliteInfo }>();
export interface SatelliteInfo {
  radio: Radio | null;
  satcat: Record<string, unknown> | null;
  warning: string | null;
}
export async function loadSatelliteInfo(
  norad: string,
  signal: AbortSignal,
): Promise<SatelliteInfo> {
  signal.throwIfAborted();
  const cached = cache.get(norad);
  if (cached && Date.now() - cached.at < 10 * 60000) return cached.value;
  let catalogWarning: string | null = null;
  const [radio, satcat] = await Promise.allSettled([
    request<Radio>(`/api/sat/${encodeURIComponent(norad)}/radio`, {
      signal,
      timeoutMs: 30000,
      attempts: 1,
    }),
    request<Array<Record<string, unknown>>>(
      `/api/celestrak/satcat?CATNR=${encodeURIComponent(norad)}&FORMAT=json`,
      {
        signal,
        attempts: 1,
        onResponse: (response) => {
          catalogWarning = response.headers.get('X-Celestrak-Warning');
        },
      },
    ),
  ]);
  signal.throwIfAborted();
  const value: SatelliteInfo = {
    radio: radio.status === 'fulfilled' ? radio.value : null,
    satcat: satcat.status === 'fulfilled' ? (satcat.value[0] ?? null) : null,
    warning:
      radio.status === 'rejected'
        ? 'Radio data is temporarily unavailable. Try again.'
        : satcat.status === 'rejected'
          ? 'Some catalog details are temporarily unavailable.'
          : catalogWarning,
  };
  if (!value.warning) {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(norad, { at: Date.now(), value });
  }
  return value;
}
