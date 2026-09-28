import { describe, expect, it, vi } from 'vitest';
import type { Position } from '../src/domain/types';
// Keep the numeric helpers runnable in Node. This narrow Leaflet stand-in also
// checks that the custom projection preserves fractional centers and bounds calls.
vi.mock('leaflet', () => ({
  CircleMarker: class {
    static extend(methods: object) {
      return class {
        constructor(
          public latlng: unknown,
          public options: unknown,
        ) {
          Object.assign(this, methods);
        }
      };
    }
  },
}));
import { interpolatePosition, subpixelCircleMarker } from '../src/map/smoothMotion';
const position = (lon: number, elevation: number | null = 10): Position => ({
  lat: 20,
  lon,
  altKm: 400,
  elevation,
});

describe('sample interpolation', () => {
  it('moves continuously across either direction of the date line', () => {
    expect(interpolatePosition(position(179), position(-179), 0.5).lon).toBe(180);
    expect(interpolatePosition(position(179), position(-179), 1).lon).toBe(181);
    expect(interpolatePosition(position(-179), position(179), 0.5).lon).toBe(-180);
    expect(interpolatePosition(position(-179), position(179), 1).lon).toBe(-181);
    expect(interpolatePosition(position(539), position(-179), 0.5).lon).toBe(540);
  });
  it('interpolates position and altitude without changing source samples', () => {
    const from = position(30),
      to = { lat: 24, lon: 34, altKm: 420, elevation: 30 };
    expect(interpolatePosition(from, to, 0.25)).toEqual({
      lat: 21,
      lon: 31,
      altKm: 405,
      elevation: 15,
    });
    expect(from).toEqual(position(30));
    expect(to).toEqual({ lat: 24, lon: 34, altKm: 420, elevation: 30 });
  });
  it('clamps stalled or invalid frame progress instead of extrapolating', () => {
    const from = position(30),
      to = position(34);
    expect(interpolatePosition(from, to, -1)).toEqual(from);
    expect(interpolatePosition(from, to, 2)).toEqual(to);
    expect(interpolatePosition(from, to, NaN)).toEqual(from);
    expect(interpolatePosition(from, to, Infinity)).toEqual(to);
  });
  it('does not fabricate an elevation when an observer sample is unavailable', () => {
    expect(interpolatePosition(position(0, null), position(1, 10), 0.5).elevation).toBeNull();
    expect(interpolatePosition(position(0, null), position(1, 10), 1).elevation).toBe(10);
    expect(interpolatePosition(position(0, 10), position(1, null), 0).elevation).toBe(10);
    expect(interpolatePosition(position(0, 10), position(1, null), 0.5).elevation).toBeNull();
  });
});

it('projects moving marker centers without integer rounding and still updates hit bounds', () => {
  const marker = subpixelCircleMarker([20, 30], { radius: 4 }) as unknown as {
    _map: unknown;
    _latlng: unknown;
    _point: unknown;
    _project: () => void;
    _updateBounds: () => void;
  };
  const subtract = vi.fn((origin: { x: number; y: number }) => ({
    x: 123.25 - origin.x,
    y: 456.75 - origin.y,
  }));
  const project = vi.fn(() => ({ subtract }));
  const updateBounds = vi.fn();
  const latlng = { lat: 20, lng: 30 };
  marker._latlng = latlng;
  marker._map = { project, getPixelOrigin: () => ({ x: 100, y: 400 }) };
  marker._updateBounds = updateBounds;
  marker._project();
  expect(project).toHaveBeenCalledWith(latlng);
  expect(marker._point).toEqual({ x: 23.25, y: 56.75 });
  expect(updateBounds).toHaveBeenCalledOnce();
});
