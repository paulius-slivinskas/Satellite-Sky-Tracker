import type { Category } from './types';
import { satelliteNames } from './satelliteNames';
const normalizeRadioName = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, '');
function isFleetSatcomName(name: string) {
  const normalized = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

  return (
    /\bOPS\s*6391\b/.test(normalized) ||
    /\bOPS\s*6392\b/.test(normalized) ||
    /\bOPS\s*6393\b/.test(normalized) ||
    /\bOPS\s*6394\b/.test(normalized) ||
    /\bFLTSATCOM\s*5\b/.test(normalized) ||
    /\bFLTSATCOM\s*7\b/.test(normalized) ||
    /\bFLTSATCOM\s*8\b/.test(normalized)
  );
}

export const FLEET_SATCOM_TARGETS = [
  { noradId: '10669', name: 'OPS 6391 (FLTSATCOM 1)' },
  { noradId: '11353', name: 'OPS 6392 (FLTSATCOM 2)' },
  { noradId: '11669', name: 'OPS 6393 (FLTSATCOM 3)' },
  { noradId: '12046', name: 'OPS 6394 (FLTSATCOM 4)' },
  { noradId: '12635', name: 'FLTSATCOM 5' },
  { noradId: '17181', name: 'FLTSATCOM 7 (USA 20)' },
  { noradId: '20253', name: 'FLTSATCOM 8 (USA 46)' },
];

const AMATEUR_SELECTED_ALIASES = [
  'AO-91',
  'RADFXSAT',
  'FOX-1B',
  'AO-123',
  'ASRTU-1',
  'CAS-3H',
  'LILACSAT-2',
  'IO-86',
  'LAPAN-A2',
  'ISS',
  'PO-101',
  'DIWATA-2',
  'QMR-KWT-2',
  'RS95S',
  'SO-50',
  'SAUDISAT-1C',
  'SO-125',
  'HADES-ICM',
];

export function isAmateurSelectedName(name: string, noradId: string | null = null) {
  if (String(noradId || '').trim() === '25544') {
    return true;
  }
  const rawUpper = String(name || '').toUpperCase();
  if (/\bISS\b/.test(rawUpper)) {
    return true;
  }
  const normalized = satelliteNames({ name, noradId: noradId ?? '' }).map(normalizeRadioName);
  if (!normalized.length) {
    return false;
  }
  return AMATEUR_SELECTED_ALIASES.some((alias) => {
    if (String(alias).toUpperCase() === 'ISS') {
      return false;
    }
    const aliasKey = normalizeRadioName(alias);
    return aliasKey && normalized.some((value) => value.includes(aliasKey));
  });
}

const TRACKED_FILTER_CONFIG = {
  key: 'tracked',
  label: 'Tracked',
  color: '#94a3b8',
};

const AMATEUR_SELECTED_FILTER_CONFIG = {
  key: 'amateur_selected',
  label: 'Amateur Radio Selected',
  color: '#22c55e',
};

export const CATEGORY_CONFIG: Category[] = [
  {
    key: 'iss',
    label: 'ISS',
    color: '#ff6b00',
    group: 'stations',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
    include: (name) => name.toUpperCase().includes('ISS'),
  },
  {
    key: 'amateur',
    label: 'Amateur Radio',
    color: '#2a9d8f',
    group: 'amateur',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle',
  },
  {
    key: 'starlink',
    label: 'Starlink',
    color: '#3a86ff',
    group: 'starlink',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
  },
  {
    key: 'weather',
    label: 'Weather',
    color: '#8338ec',
    group: 'weather',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle',
  },
  {
    key: 'fltsatcom',
    label: 'FLTSATCOM',
    color: '#f59e0b',
    group: 'active',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
    include: (name) => isFleetSatcomName(name),
  },
  {
    key: 'military',
    label: 'Military',
    color: '#ef4444',
    group: 'military',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=military&FORMAT=tle',
    include: (name) => !isFleetSatcomName(name),
  },
  {
    key: 'other',
    label: 'Other Active',
    color: '#6c757d',
    group: 'active',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
    maxItems: 350,
  },
];
export const FILTER_CONFIG = [
  TRACKED_FILTER_CONFIG,
  AMATEUR_SELECTED_FILTER_CONFIG,
  ...CATEGORY_CONFIG,
];
