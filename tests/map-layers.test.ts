import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { basemapStyle } from '../src/map/basemapStyle';
import { normalizeMapLayer } from '../src/state/mapLayer';

const layers = ['minimal', 'atlas', 'blueprint', 'satellite'] as const;
const themes = ['dark', 'light'] as const;

describe('map-layer style contracts', () => {
  for (const layer of layers) {
    for (const theme of themes) {
      it(`${theme} ${layer} is a valid MapLibre style with attributed imagery only when requested`, () => {
        const style = basemapStyle(theme, layer);
        expect(validateStyleMin(style)).toEqual([]);
        const rasters = Object.values(style.sources).filter((source) => source.type === 'raster');
        if (layer === 'satellite') {
          expect(rasters.length).toBeGreaterThan(0);
          expect(rasters.map((source) => source.attribution).join(' ')).toMatch(/EOX/i);
          expect(rasters.flatMap((source) => source.tiles ?? []).join(' ')).toContain(
            'tiles.maps.eox.at',
          );
          expect(style.layers.some((item) => item.type === 'raster')).toBe(true);
        } else {
          expect(rasters).toEqual([]);
          expect(style.layers.some((item) => item.type === 'raster')).toBe(false);
        }
      });
    }
    it(`${layer} changes its painted colors with the application theme`, () => {
      const paints = (theme: 'dark' | 'light') =>
        basemapStyle(theme, layer).layers.map((item) => item.paint);
      expect(paints('light')).not.toEqual(paints('dark'));
    });
  }
  it('defaults to Minimal and gives the vector alternatives distinct appearances', () => {
    expect(basemapStyle('dark')).toEqual(basemapStyle('dark', 'minimal'));
    const variants = layers
      .slice(0, 3)
      .map((layer) => JSON.stringify(basemapStyle('dark', layer).layers));
    expect(new Set(variants).size).toBe(3);
  });
});

describe('map-layer preference validation', () => {
  it.each(layers)('accepts the %s layer', (layer) => {
    expect(normalizeMapLayer(layer)).toBe(layer);
  });
  it.each([undefined, null, '', 'Minimal', 'terrain', 1, false, {}, ['atlas']])(
    'falls back to Minimal for invalid value %j',
    (value) => {
      expect(normalizeMapLayer(value)).toBe('minimal');
    },
  );
});
