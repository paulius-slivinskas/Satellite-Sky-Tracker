import { describe, expect, it } from 'vitest';
import { searchSatellites } from '../src/domain/search';
import { satelliteAliases } from '../src/domain/satelliteNames';
import { isAmateurSelectedName } from '../src/domain/config';
import type { Satellite } from '../src/domain/types';

const satellite = (noradId: string, name: string) => ({ noradId, name }) as Satellite;
const catalog = [
  satellite('27607', 'SAUDISAT 1C (SO-50)'),
  satellite('61781', 'ASRTU-1 (AO-123)'),
  satellite('43017', 'RADFXSAT (FOX-1B)'),
  satellite('40908', 'LILACSAT-2'),
];

describe('satellite identity search', () => {
  it.each([
    ['SO-50', '27607'],
    ['SaudiSat-1C', '27607'],
    ['AO-123 / ASRTU-1', '61781'],
    ['ASRTU Friendship', '61781'],
    ['Дружба АТУРК', '61781'],
    ['AO-91', '43017'],
    ['ao91', '43017'],
    ['fox 1b', '43017'],
    ['CAS-3H / LilacSat-2', '40908'],
    ['XW-2H', '40908'],
    ['43017', '43017'],
    ['RADFXSAT (FOX-1B) (43017)', '43017'],
  ])('finds %s by the same NORAD identity', (query, noradId) => {
    expect(searchSatellites(catalog, query).map((sat) => sat.noradId)).toEqual([noradId]);
  });

  it('shows additional names without duplicating the canonical label or its parentheses', () => {
    expect(satelliteAliases(catalog[2])).toEqual(['AO-91']);
    expect(satelliteAliases(catalog[3])).toEqual(expect.arrayContaining(['CAS-3H', 'XW-2H']));
  });

  it('resolves names by ID even after a provider renames a satellite, without borrowing another ID', () => {
    expect(searchSatellites([satellite('43017', 'OBJECT A')], 'AO-91')).toHaveLength(1);
    expect(searchSatellites([satellite('99999', 'RADFXSAT')], 'AO-91')).toHaveLength(0);
    expect(isAmateurSelectedName('OBJECT A', '43017')).toBe(true);
  });

  it('requires all pasted names to refer to the same satellite', () => {
    expect(searchSatellites(catalog, 'AO-91 / SO-50')).toEqual([]);
  });

  it('does not attach SatNOGS provisional identities to catalog objects', () => {
    expect(satelliteAliases(satellite('90002', 'OBJECT A'))).toEqual([]);
  });

  it('keeps ordinary name search, ranking, empty queries and result limits', () => {
    const rows = [satellite('90001', 'STARLINK-1000'), satellite('90002', 'STARLINK-100')];
    expect(searchSatellites(rows, 'starlink100', 1)[0].noradId).toBe('90002');
    expect(searchSatellites(rows, '', 1)).toEqual([rows[0]]);
    expect(searchSatellites(rows, 'unknown')).toEqual([]);
  });
});
