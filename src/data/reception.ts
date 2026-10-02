import type { Observer, Satellite } from '../domain/types';
import type { ReceptionWeather } from './receptionWeather';

export const RECEPTION_KEY = 'satapp_reception_v1';
export interface ReceptionNotes {
  frequencyStartMHz: string;
  frequencyEndMHz: string;
  doppler: string;
  reception: string;
  conditions: string;
  antenna: string;
  setup: string;
}
export interface ReceptionLog {
  id: string;
  noradId: string;
  satelliteName: string;
  startedAt: number;
  stoppedAt: number | null;
  observer: Observer | null;
  saved: boolean;
  notes: ReceptionNotes;
  quality?: number | null;
  equipment?: string;
  remarks?: string;
  weather?: ReceptionWeather;
}
export const emptyReceptionNotes = (): ReceptionNotes => ({
  frequencyStartMHz: '',
  frequencyEndMHz: '',
  doppler: '',
  reception: '',
  conditions: '',
  antenna: '',
  setup: '',
});
export interface ReceptionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
function validLog(value: unknown): value is ReceptionLog {
  if (!value || typeof value !== 'object') return false;
  const log = value as ReceptionLog;
  const obs = log.observer;
  return (
    typeof log.id === 'string' &&
    typeof log.noradId === 'string' &&
    typeof log.satelliteName === 'string' &&
    Number.isFinite(log.startedAt) &&
    (log.stoppedAt === null ||
      (Number.isFinite(log.stoppedAt) && log.stoppedAt >= log.startedAt)) &&
    typeof log.saved === 'boolean' &&
    (log.quality === undefined ||
      log.quality === null ||
      (Number.isInteger(log.quality) && log.quality >= 1 && log.quality <= 5)) &&
    (log.equipment === undefined || typeof log.equipment === 'string') &&
    (log.remarks === undefined || typeof log.remarks === 'string') &&
    (log.weather === undefined ||
      (log.weather !== null &&
        log.weather.source === 'Open-Meteo' &&
        Number.isFinite(log.weather.sampledAt) &&
        typeof log.weather.description === 'string' &&
        ['temperatureC', 'windKmh', 'cloudPercent', 'precipitationMm'].every(
          (key) =>
            log.weather![key as 'temperatureC'] === null ||
            Number.isFinite(log.weather![key as 'temperatureC']),
        ))) &&
    (!log.saved || log.stoppedAt !== null) &&
    (obs === null ||
      (!!obs &&
        Number.isFinite(obs.lat) &&
        Math.abs(obs.lat) <= 90 &&
        Number.isFinite(obs.lon) &&
        Math.abs(obs.lon) <= 180 &&
        Number.isFinite(obs.alt) &&
        typeof obs.name === 'string')) &&
    !!log.notes &&
    Object.keys(emptyReceptionNotes()).every(
      (key) => typeof log.notes[key as keyof ReceptionNotes] === 'string',
    )
  );
}
export function loadReceptionLogs(storage: ReceptionStorage = localStorage): ReceptionLog[] {
  const raw = storage.getItem(RECEPTION_KEY);
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (
    !Array.isArray(value) ||
    !value.every(validLog) ||
    new Set(value.map((log) => log.id)).size !== value.length ||
    value.filter((log) => log.stoppedAt === null).length > 1
  )
    throw new Error('Stored reception logs could not be read. Existing data has been preserved.');
  return value;
}
export function persistReceptionLogs(
  logs: ReceptionLog[],
  storage: ReceptionStorage = localStorage,
) {
  if (!logs.every(validLog)) throw new Error('Invalid reception log.');
  storage.setItem(RECEPTION_KEY, JSON.stringify(logs));
}
export function startReception(
  sat: Pick<Satellite, 'noradId' | 'name'>,
  observer: Observer | null,
  now = Date.now(),
): ReceptionLog {
  return {
    id: crypto.randomUUID(),
    noradId: sat.noradId,
    satelliteName: sat.name,
    startedAt: now,
    stoppedAt: null,
    observer: observer ? { ...observer } : null,
    saved: false,
    notes: emptyReceptionNotes(),
  };
}
export function stopReception(log: ReceptionLog, now = Date.now()): ReceptionLog {
  if (log.stoppedAt !== null) return log;
  if (now < log.startedAt)
    throw new Error(
      'Your system clock moved backwards. Correct the clock before stopping reception.',
    );
  return { ...log, stoppedAt: now };
}
export function receptionDuration(log: ReceptionLog, now = Date.now()) {
  return Math.max(0, (log.stoppedAt ?? now) - log.startedAt);
}
/** Display older detailed reports in the simplified form without losing observations. */
export function receptionEquipment(log: ReceptionLog) {
  return log.equipment ?? [log.notes.antenna, log.notes.setup].filter(Boolean).join(' · ');
}
export function receptionRemarks(log: ReceptionLog) {
  return (
    log.remarks ??
    [
      log.notes.reception,
      log.notes.doppler && `Doppler: ${log.notes.doppler}`,
      log.notes.frequencyStartMHz && `Start frequency: ${log.notes.frequencyStartMHz} MHz`,
      log.notes.frequencyEndMHz && `End frequency: ${log.notes.frequencyEndMHz} MHz`,
      log.notes.conditions && `Conditions: ${log.notes.conditions}`,
    ]
      .filter(Boolean)
      .join('\n')
  );
}
