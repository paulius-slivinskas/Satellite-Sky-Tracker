import index from '../data/satellite-names.json';
import type { Satellite } from './types';

type Identity = Pick<Satellite, 'name' | 'noradId'>;
const namesByNorad: Record<string, string[]> = index.names;
export const normalizeSatelliteName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = normalizeSatelliteName(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const cache = new WeakMap<Identity, { names: string[]; aliases: string[] }>();
function identity(satellite: Identity) {
  const cached = cache.get(satellite);
  if (cached) return cached;
  const primaryNames = uniqueNames([
    satellite.name,
    ...satellite.name.split(/[(),;/]+/).map((name) => name.trim()),
  ]);
  const names = uniqueNames([
    ...primaryNames,
    ...(namesByNorad[String(Number(satellite.noradId))] ?? []),
  ]);
  const primaryKeys = new Set(primaryNames.map(normalizeSatelliteName));
  const value = {
    names,
    aliases: names.filter((name) => !primaryKeys.has(normalizeSatelliteName(name))),
  };
  cache.set(satellite, value);
  return value;
}

export const satelliteNames = (satellite: Identity) => identity(satellite).names;
// The main label already shows the canonical name and any aliases in parentheses.
export const satelliteAliases = (satellite: Identity) => identity(satellite).aliases;
