import { twoline2satrec } from 'satellite.js';
import { CATEGORY_CONFIG, FLEET_SATCOM_TARGETS } from '../domain/config';
import { parseTLE } from '../domain/orbits';
import type { Category, Satellite, TleRecord } from '../domain/types';
import { HttpError, request } from './http';
import { readStored, writeStored } from './storage';
const CACHE_KEY = 'satapp_catalog_v2';
const BLOCK_KEY = 'satapp_celestrak_blocked_until';
const PROVIDER_UPDATE_MS = 7 * 86400000;
const ATTEMPTS_KEY = 'satapp_celestrak_attempts_v1';
const BLOCK_REASON =
  'CelesTrak requests are paused after HTTP 403 or 429; retained data remains available.';
const FRESH_MS = PROVIDER_UPDATE_MS;
interface CachedGroup {
  key: string;
  savedAt: number;
  records: TleRecord[];
  nextRefreshAt?: number;
  warning?: string | null;
}
export interface Catalog {
  satellites: Satellite[];
  stale: boolean;
  unavailable: string[];
  refreshedAt: number | null;
  issues: { category: string; reason: string }[];
  outdatedCount: number;
  staleGroups: string[];
  blockedUntil: number | null;
}
function isRecord(value: unknown): value is TleRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as TleRecord;
  return (
    typeof r.name === 'string' &&
    typeof r.line1 === 'string' &&
    typeof r.line2 === 'string' &&
    r.line1.startsWith('1 ') &&
    r.line2.startsWith('2 ')
  );
}
export function hydrate(records: TleRecord[], category: Category): Satellite[] {
  return records.flatMap((rec) => {
    try {
      const satrec = twoline2satrec(rec.line1, rec.line2);
      if (satrec.error || !Number.isFinite(satrec.no) || satrec.no <= 0) return [];
      const noradId = rec.line1.slice(2, 7).trim();
      return [
        {
          ...rec,
          name: noradId === '25544' ? 'ISS' : rec.name,
          id: `NORAD-${noradId}`,
          noradId,
          category: category.key,
          color: category.color,
          satrec,
        },
      ];
    } catch {
      return [];
    }
  });
}
function combine(groups: CachedGroup[]): Satellite[] {
  const byId = new Map<string, Satellite>();
  // Stable category order retains the previous category precedence regardless of response order.
  for (const category of CATEGORY_CONFIG) {
    let records = groups.find((group) => group.key === category.key)?.records ?? [];
    if (category.key === 'iss')
      records = records.filter((rec) => rec.line1.slice(2, 7).trim() === '25544');
    else if (category.include) records = records.filter((rec) => category.include!(rec.name));
    if (category.maxItems) records = records.slice(0, category.maxItems);
    for (const sat of hydrate(records, category)) if (!byId.has(sat.id)) byId.set(sat.id, sat);
  }
  return [...byId.values()];
}
function cachedGroups(): CachedGroup[] {
  const now = Date.now();
  const raw = readStored<unknown>(CACHE_KEY);
  if (Array.isArray(raw))
    return raw.filter(
      (group): group is CachedGroup =>
        group &&
        typeof group.key === 'string' &&
        Number.isFinite(group.savedAt) &&
        group.savedAt <= now + 60000 &&
        Array.isArray(group.records) &&
        group.records.every(isRecord),
    );
  // Keep the last valid data indefinitely; age remains visible in catalog diagnostics.
  return CATEGORY_CONFIG.flatMap((category) => {
    const old = readStored<{ savedAt: number; text: string }>(`satapp_tle_cache_${category.key}`);
    return old &&
      typeof old.text === 'string' &&
      Number.isFinite(old.savedAt) &&
      old.savedAt <= now + 60000 &&
      old.savedAt >= 0
      ? [{ key: category.key, savedAt: old.savedAt, records: parseTLE(old.text) }]
      : [];
  });
}
function readBlockedUntil(): number | null {
  const value = readStored<unknown>(BLOCK_KEY);
  return typeof value === 'number' && Number.isFinite(value) && value > Date.now() ? value : null;
}
class InvalidOrbitalDataError extends Error {}
function failureReason(error: unknown): string {
  if (error instanceof HttpError) return `Orbital data source returned HTTP ${error.status}`;
  if (error instanceof InvalidOrbitalDataError) return 'No valid orbital elements returned';
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
    return 'Request timed out';
  return 'Network request failed';
}
function describe(
  groups: CachedGroup[],
  issues: Catalog['issues'],
  blockedUntil = readBlockedUntil(),
): Catalog {
  const satellites = combine(groups);
  const now = Date.now();
  const outdatedCount = satellites.filter(
    (sat) => Math.abs(now - (sat.satrec.jdsatepoch - 2440587.5) * 86400000) > FRESH_MS,
  ).length;
  const staleGroups = groups
    .filter((g) => now - g.savedAt > FRESH_MS)
    .map((g) => CATEGORY_CONFIG.find((category) => category.key === g.key)?.label ?? g.key);
  return {
    satellites,
    stale: outdatedCount > 0 || staleGroups.length > 0 || issues.length > 0,
    unavailable: issues.map((issue) => issue.category),
    issues: issues.map((issue) => ({ ...issue })),
    outdatedCount,
    staleGroups,
    blockedUntil,
    refreshedAt: groups.length ? Math.min(...groups.map((g) => g.savedAt)) : null,
  };
}
export function readCatalog(): Catalog {
  const groups = cachedGroups();
  return describe(
    groups,
    groups
      .filter((group) => group.warning)
      .map((group) => ({
        category:
          CATEGORY_CONFIG.find((category) => category.key === group.key)?.label ?? group.key,
        reason: group.warning!,
      })),
  );
}
interface Attempt {
  nextRefreshAt: number;
  warning: string | null;
}
export async function loadCatalog(
  signal: AbortSignal,
  onProgress: (catalog: Catalog) => void,
): Promise<Catalog> {
  signal.throwIfAborted();
  const groups = cachedGroups();
  const rawAttempts = readStored<Record<string, Attempt>>(ATTEMPTS_KEY);
  const attempts: Record<string, Attempt> =
    rawAttempts && typeof rawAttempts === 'object' && !Array.isArray(rawAttempts)
      ? rawAttempts
      : {};
  const issues: Catalog['issues'] = [];
  let blockedUntil = readBlockedUntil();
  const issue = (category: string, reason: string) => {
    const existing = issues.find((item) => item.category === category);
    if (existing) existing.reason = reason;
    else issues.push({ category, reason });
  };
  const publish = () => {
    if (!signal.aborted) {
      writeStored(CACHE_KEY, groups);
      writeStored(ATTEMPTS_KEY, attempts);
      onProgress(
        describe(groups, issues, blockedUntil && blockedUntil > Date.now() ? blockedUntil : null),
      );
    }
  };
  const save = (
    key: string,
    records: TleRecord[],
    savedAt: number,
    nextRefreshAt: number,
    warning: string | null,
  ) => {
    const idx = groups.findIndex((group) => group.key === key);
    const group = { key, records, savedAt, nextRefreshAt, warning };
    if (idx >= 0) groups[idx] = group;
    else groups.push(group);
  };
  const getCelestrak = async (url: string) => {
    signal.throwIfAborted();
    const prior = attempts[url];
    if (prior && Number.isFinite(prior.nextRefreshAt) && prior.nextRefreshAt > Date.now())
      throw new Error(prior.warning || BLOCK_REASON);
    let savedAt = Date.now(),
      nextRefreshAt = savedAt + PROVIDER_UPDATE_MS,
      warning: string | null = null;
    let serverDeadline = false;
    const timestamp = (response: Response, header: string) => {
      const parsed = Date.parse(response.headers.get(header) || '');
      return Number.isFinite(parsed) ? parsed : null;
    };
    const query = url.includes('?')
      ? url.slice(url.indexOf('?') + 1)
      : `GROUP=${encodeURIComponent(url)}&FORMAT=tle`;
    try {
      const text = await request<string>(`/api/celestrak/elements?${query}`, {
        signal,
        type: 'text',
        attempts: 1,
        timeoutMs: 60000,
        onResponse: (response) => {
          savedAt = timestamp(response, 'X-Celestrak-Updated-At') ?? savedAt;
          const next = timestamp(response, 'X-Celestrak-Next-Refresh-At');
          serverDeadline = next !== null;
          nextRefreshAt = next ?? nextRefreshAt;
          warning = response.headers.get('X-Celestrak-Warning');
          const blocked = timestamp(response, 'X-Celestrak-Blocked-Until');
          if (blocked && blocked > Date.now()) {
            blockedUntil = blocked;
            writeStored(BLOCK_KEY, blocked);
          }
        },
      });
      delete attempts[url];
      return { text, savedAt, nextRefreshAt, warning };
    } catch (error) {
      if (signal.aborted) throw error;
      // Shared backend controls the upstream schedule; the browser also avoids repeated proxy requests.
      attempts[url] = {
        nextRefreshAt: serverDeadline ? nextRefreshAt : Date.now() + 60000,
        warning: warning || failureReason(error),
      };
      throw new Error(warning || failureReason(error));
    }
  };
  const urls = [...new Set(CATEGORY_CONFIG.map((category) => category.url))];
  let cursor = 0;
  const fetchGroup = async (url: string) => {
    signal.throwIfAborted();
    const categories = CATEGORY_CONFIG.filter((category) => category.url === url);
    const recent = groups
      .filter(
        (group) =>
          categories.some((category) => category.key === group.key) &&
          group.records.length > 0 &&
          (group.nextRefreshAt ?? group.savedAt + PROVIDER_UPDATE_MS) > Date.now(),
      )
      .sort((a, b) => b.savedAt - a.savedAt)[0];
    if (recent) {
      for (const category of categories) {
        const existing = groups.find((group) => group.key === category.key);
        if (!existing || (existing.savedAt < recent.savedAt && category.key !== 'fltsatcom'))
          save(
            category.key,
            recent.records,
            recent.savedAt,
            recent.nextRefreshAt ?? recent.savedAt + PROVIDER_UPDATE_MS,
            recent.warning ?? null,
          );
        const warning = existing?.warning ?? recent.warning;
        if (warning) issue(category.label, warning);
      }
      publish();
      return;
    }
    const priorFleet = groups.find((group) => group.key === 'fltsatcom');
    let freshRecords: TleRecord[] | null = null;
    let savedAt = Date.now(),
      nextRefreshAt = savedAt + PROVIDER_UPDATE_MS,
      warning: string | null = null;
    try {
      let records: TleRecord[];
      try {
        const result = await getCelestrak(url);
        ({ savedAt, nextRefreshAt, warning } = result);
        records = parseTLE(result.text);
        if (
          !records.length ||
          (categories.some((category) => category.key === 'iss') &&
            !records.some((record) => record.line1.slice(2, 7).trim() === '25544'))
        )
          throw new InvalidOrbitalDataError();
      } catch (error) {
        if (signal.aborted) throw error;
        if (!categories.some((category) => category.key === 'iss')) throw error;
        const existing = groups.find((group) => group.key === 'iss');
        // A failed refresh never discards a usable saved ISS orbit.
        if (existing?.records.length) throw error;
        const rows = await request<Array<{ tle0: string; tle1: string; tle2: string }>>(
          'https://db.satnogs.org/api/tle/?format=json&norad_cat_id=25544',
          { signal, attempts: 1 },
        );
        records = Array.isArray(rows)
          ? rows
              .filter((row) => row.tle1 && row.tle2 && row.tle1.slice(2, 7).trim() === '25544')
              .map((row) => ({ name: row.tle0 || 'ISS', line1: row.tle1, line2: row.tle2 }))
          : [];
        if (!records.length) throw new InvalidOrbitalDataError();
        savedAt = Date.now();
        nextRefreshAt = savedAt + PROVIDER_UPDATE_MS;
        warning = null;
      }
      freshRecords = records;
      for (const category of categories) {
        const retainedFleet =
          category.key === 'fltsatcom'
            ? (priorFleet?.records ?? []).filter(
                (old) =>
                  FLEET_SATCOM_TARGETS.some(
                    (target) => target.noradId === old.line1.slice(2, 7).trim(),
                  ) &&
                  !records.some((record) => record.line1.slice(2, 7) === old.line1.slice(2, 7)),
              )
            : [];
        save(
          category.key,
          [...records, ...retainedFleet],
          retainedFleet.length && priorFleet ? Math.min(savedAt, priorFleet.savedAt) : savedAt,
          nextRefreshAt,
          warning,
        );
        if (warning) issue(category.label, warning);
      }
    } catch (error) {
      if (signal.aborted) throw error;
      const reason = error instanceof Error && error.message ? error.message : failureReason(error);
      for (const category of categories) {
        issue(
          category.label,
          error instanceof InvalidOrbitalDataError ? failureReason(error) : reason,
        );
        const existing = groups.find((group) => group.key === category.key);
        if (existing) {
          existing.warning = reason;
          existing.nextRefreshAt = attempts[url]?.nextRefreshAt ?? nextRefreshAt;
        }
      }
    }
    publish();
    const fleetCategory = categories.find((category) => category.key === 'fltsatcom');
    if (!fleetCategory || !freshRecords || warning || (blockedUntil && blockedUntil > Date.now()))
      return;
    const fleetRecords = [
      ...(groups.find((group) => group.key === 'fltsatcom')?.records ?? freshRecords),
    ];
    const fetchedIds = new Set(freshRecords.map((record) => record.line1.slice(2, 7).trim()));
    let fleetWarning: string | null = null;
    for (const target of FLEET_SATCOM_TARGETS) {
      signal.throwIfAborted();
      const existing = fleetRecords.find(
        (record) => record.line1.slice(2, 7).trim() === target.noradId,
      );
      if (fetchedIds.has(target.noradId)) {
        if (existing)
          fleetRecords[fleetRecords.indexOf(existing)] = { ...existing, name: target.name };
        continue;
      }
      if (blockedUntil && blockedUntil > Date.now()) {
        fleetWarning = BLOCK_REASON;
        for (const old of priorFleet?.records ?? [])
          if (!fleetRecords.some((record) => record.line1.slice(2, 7) === old.line1.slice(2, 7)))
            fleetRecords.push(old);
        if (priorFleet) savedAt = Math.min(savedAt, priorFleet.savedAt);
        break;
      }
      try {
        const result = await getCelestrak(
          `https://celestrak.org/NORAD/elements/gp.php?CATNR=${target.noradId}&FORMAT=tle`,
        );
        const record = parseTLE(result.text).find(
          (row) => row.line1.slice(2, 7).trim() === target.noradId,
        );
        if (!record) throw new InvalidOrbitalDataError();
        if (existing) fleetRecords.splice(fleetRecords.indexOf(existing), 1);
        fleetRecords.push({ ...record, name: target.name });
        savedAt = Math.min(savedAt, result.savedAt);
        nextRefreshAt = Math.max(nextRefreshAt, result.nextRefreshAt);
        if (result.warning) fleetWarning = result.warning;
      } catch (error) {
        if (signal.aborted) throw error;
        const old = priorFleet?.records.find(
          (record) => record.line1.slice(2, 7).trim() === target.noradId,
        );
        if (old) {
          if (!existing) fleetRecords.push(old);
          savedAt = Math.min(savedAt, priorFleet!.savedAt);
        }
        fleetWarning =
          error instanceof InvalidOrbitalDataError
            ? failureReason(error)
            : error instanceof Error
              ? error.message
              : failureReason(error);
      }
    }
    save('fltsatcom', fleetRecords, savedAt, nextRefreshAt, fleetWarning);
    if (fleetWarning) issue(fleetCategory.label, fleetWarning);
    publish();
  };
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (cursor < urls.length && !signal.aborted) await fetchGroup(urls[cursor++]);
    }),
  );
  signal.throwIfAborted();
  return describe(groups, issues, blockedUntil && blockedUntil > Date.now() ? blockedUntil : null);
}
export { FLEET_SATCOM_TARGETS };
