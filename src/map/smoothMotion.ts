import * as L from 'leaflet';
import type { Position } from '../domain/types';

// Leaflet 1.9's standard projection rounds centers to integer pixels. Keep this
// override local to moving dots; the inherited bounds/hit-testing stay intact.
type CircleMarkerInternals = L.CircleMarker & {
  _map: L.Map;
  _latlng: L.LatLng;
  _point: L.Point;
  _updateBounds: () => void;
};
const SubpixelCircleMarker = L.CircleMarker.extend({
  _project(this: CircleMarkerInternals) {
    this._point = this._map.project(this._latlng).subtract(this._map.getPixelOrigin());
    this._updateBounds();
  },
}) as new (latlng: L.LatLngExpression, options: L.CircleMarkerOptions) => L.CircleMarker;

export function subpixelCircleMarker(
  latlng: L.LatLngExpression,
  options: L.CircleMarkerOptions = {},
): L.CircleMarker {
  return new SubpixelCircleMarker(latlng, options);
}

/**
 * Interpolate adjacent propagation samples without crossing the long way around
 * the globe. Longitude is deliberately continuous relative to `from`, so 179 to
 * -179 ends at 181. The caller can choose the appropriate visible world copy.
 */
export function interpolatePosition(from: Position, to: Position, progress: number): Position {
  const fraction = Number.isNaN(progress) ? 0 : Math.max(0, Math.min(1, progress));
  const longitudeDelta = ((((to.lon - from.lon) % 360) + 540) % 360) - 180;
  const lerp = (start: number, end: number) => start + (end - start) * fraction;
  return {
    lat: lerp(from.lat, to.lat),
    lon: from.lon + longitudeDelta * fraction,
    altKm: lerp(from.altKm, to.altKm),
    elevation:
      fraction === 0
        ? from.elevation
        : fraction === 1
          ? to.elevation
          : from.elevation === null || to.elevation === null
            ? null
            : lerp(from.elevation, to.elevation),
  };
}
