import { describe, expect, it } from 'vitest';
import {
  loadReceptionLogs,
  persistReceptionLogs,
  receptionDuration,
  RECEPTION_KEY,
  startReception,
  stopReception,
  receptionEquipment,
  receptionRemarks,
} from '../src/data/reception';
const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};
describe('reception logs', () => {
  it('snapshots location and computes elapsed wall-clock independently of map time', () => {
    const observer = { name: 'Vilnius', lat: 54.7, lon: 25.3, alt: 120 };
    const log = startReception({ noradId: '25544', name: 'ISS' }, observer, 10000);
    observer.lat = 0;
    expect(log.observer?.lat).toBe(54.7);
    expect(receptionDuration(log, 13000)).toBe(3000);
    const stopped = stopReception(log, 15000);
    expect(receptionDuration(stopped, 999999)).toBe(5000);
    expect(stopReception(stopped, 20000)).toBe(stopped);
    expect(log.stoppedAt).toBeNull();
  });
  it('retains active sessions, stopped drafts and notes through a storage roundtrip', () => {
    const store = storage();
    const log = startReception({ noradId: '25544', name: 'ISS' }, null, 100);
    persistReceptionLogs([log], store);
    expect(loadReceptionLogs(store)).toEqual([log]);
    const draft = stopReception(log, 6100);
    draft.notes.antenna = 'Yagi';
    draft.notes.frequencyStartMHz = '437.805';
    persistReceptionLogs([draft], store);
    expect(loadReceptionLogs(store)[0].notes.antenna).toBe('Yagi');
    expect(loadReceptionLogs(store)[0].saved).toBe(false);
  });
  it('refuses corrupt data without overwriting it and surfaces quota failures', () => {
    const store = storage();
    store.setItem(RECEPTION_KEY, '[{"unexpected":true}]');
    expect(() => loadReceptionLogs(store)).toThrow();
    expect(store.getItem(RECEPTION_KEY)).toBe('[{"unexpected":true}]');
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('Quota exceeded');
      },
    };
    expect(() => persistReceptionLogs([], full)).toThrow('Quota exceeded');
  });
  it('rejects impossible timestamps and multiple active sessions', () => {
    const log = startReception({ noradId: '25544', name: 'ISS' }, null, 100);
    expect(() => stopReception(log, 99)).toThrow('clock');
    const store = storage();
    store.setItem(RECEPTION_KEY, JSON.stringify([log, { ...log, id: 'another' }]));
    expect(() => loadReceptionLogs(store)).toThrow();
  });
  it('preserves detailed legacy observations while exposing the simplified report', () => {
    const log = stopReception(startReception({ noradId: '25544', name: 'ISS' }, null, 100), 200);
    log.notes.antenna = 'Yagi';
    log.notes.setup = 'SDR';
    log.notes.frequencyStartMHz = '437.805';
    log.notes.doppler = 'Down 10 kHz';
    expect(receptionEquipment(log)).toBe('Yagi · SDR');
    expect(receptionRemarks(log)).toContain('437.805 MHz');
    const store = storage();
    persistReceptionLogs(
      [
        {
          ...log,
          quality: 4,
          equipment: 'Handheld + Yagi',
          remarks: 'Clear signal',
          weather: {
            source: 'Open-Meteo',
            sampledAt: 100,
            temperatureC: 7,
            windKmh: null,
            cloudPercent: 50,
            precipitationMm: 0,
            description: 'Partly cloudy',
          },
        },
      ],
      store,
    );
    expect(loadReceptionLogs(store)[0].notes.doppler).toBe('Down 10 kHz');
    expect(receptionEquipment(loadReceptionLogs(store)[0])).toBe('Handheld + Yagi');
    expect(receptionRemarks(loadReceptionLogs(store)[0])).toBe('Clear signal');
    expect(() => persistReceptionLogs([{ ...log, quality: 6 }], store)).toThrow();
  });
});
