import { describe, expect, it, vi } from 'vitest';
import type * as L from 'leaflet';
import {
  enforceMapBounds,
  MERCATOR_MAX_LATITUDE,
  minimumWorldZoom,
  verticalMercatorBounds,
} from '../src/map/mapBounds';

describe('vertical world zoom limits', () => {
  it.each([240, 512, 768, 900, 1080, 2160])(
    'covers a %spx viewport after Leaflet 0.1 snapping',
    (height) => {
      const minimum = minimumWorldZoom(height);
      const snapped = Math.round(minimum / 0.1) * 0.1;
      expect(256 * 2 ** snapped).toBeGreaterThanOrEqual(height + 4);
      if (minimum > 0) expect(256 * 2 ** (minimum - 0.1)).toBeLessThan(height + 4);
    },
  );
  it('supports continuous zoom and ignores hidden/invalid viewport sizes', () => {
    expect(256 * 2 ** minimumWorldZoom(900, 0)).toBeCloseTo(904, 8);
    expect(minimumWorldZoom(0)).toBe(0);
    expect(minimumWorldZoom(NaN)).toBe(0);
    expect(minimumWorldZoom(-100)).toBe(0);
  });
  it.each([0, 1.6, 3, 12])(
    'allows every horizontal world copy while keeping a two-pixel polar inset at zoom %s',
    (zoom) => {
      const bounds = verticalMercatorBounds(zoom) as [[number, number], [number, number]];
      expect(bounds[0][1]).toBe(-Infinity);
      expect(bounds[1][1]).toBe(Infinity);
      expect(bounds[0][0]).toBe(-bounds[1][0]);
      expect(bounds[1][0]).toBeLessThan(MERCATOR_MAX_LATITUDE);
      const north = (bounds[1][0] * Math.PI) / 180;
      const northY =
        ((1 - Math.log(Math.tan(Math.PI / 4 + north / 2)) / Math.PI) / 2) * 256 * 2 ** zoom;
      expect(northY).toBeCloseTo(2, 6);
    },
  );
});

it('corrects initial/resize zoom without animation and prevents recursive moveend updates', () => {
  let zoom = 0,
    minZoom = 0,
    height = 900;
  const options: { zoomSnap: number; maxBounds?: L.LatLngBoundsExpression } = { zoomSnap: 0.1 };
  const target = {
    options,
    getSize: () => ({ y: height }),
    getPixelWorldBounds: () => ({ getSize: () => ({ y: 256 }) }),
    getZoom: () => zoom,
    getMinZoom: () => minZoom,
    getCenter: () => ({ lat: 50, lng: 1085 }),
    setView: vi.fn((_center: unknown, next: number) => {
      zoom = next;
      enforceMapBounds(target as unknown as L.Map);
    }),
    setMinZoom: vi.fn((next: number) => {
      minZoom = next;
    }),
    setMaxBounds: vi.fn((bounds: L.LatLngBoundsExpression) => {
      options.maxBounds = bounds;
    }),
    panInsideBounds: vi.fn(),
  };
  enforceMapBounds(target as unknown as L.Map);
  expect(target.setView).toHaveBeenCalledWith({ lat: 50, lng: 1085 }, minimumWorldZoom(900), {
    animate: false,
  });
  expect(target.setView).toHaveBeenCalledOnce();
  expect(target.setMaxBounds).toHaveBeenCalledOnce();
  expect(target.panInsideBounds).toHaveBeenCalledWith(options.maxBounds, { animate: false });
  enforceMapBounds(target as unknown as L.Map);
  expect(target.setMaxBounds).toHaveBeenCalledOnce();
  height = 400;
  enforceMapBounds(target as unknown as L.Map);
  expect(minZoom).toBe(minimumWorldZoom(400));
  expect(target.setView).toHaveBeenCalledOnce();
});
