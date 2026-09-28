import type * as L from 'leaflet';

export const MERCATOR_MAX_LATITUDE = 85.0511287798066;
const EDGE_GUARD_PX = 2;

/** The whole viewport must fit vertically inside one Mercator world. */
export function minimumWorldZoom(
  viewportHeight: number,
  zoomSnap = 0.1,
  worldHeightAtZoomZero = 256,
): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0;
  const base =
    Number.isFinite(worldHeightAtZoomZero) && worldHeightAtZoomZero > 0
      ? worldHeightAtZoomZero
      : 256;
  const required = Math.max(0, Math.log2((viewportHeight + 2 * EDGE_GUARD_PX) / base));
  if (!Number.isFinite(zoomSnap) || zoomSnap <= 0) return required;
  // Never round down as Leaflet's normal zoom snapping would: that exposes poles.
  return Math.ceil(required / zoomSnap) * zoomSnap;
}

/** Small inset prevents Leaflet's one-pixel bounds tolerance exposing blank edges. */
export function verticalMercatorBounds(
  zoom: number,
  worldHeightAtZoomZero = 256,
): L.LatLngBoundsExpression {
  const worldHeight = worldHeightAtZoomZero * 2 ** zoom;
  const north =
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * EDGE_GUARD_PX) / worldHeight))) * 180) / Math.PI;
  // Leaflet accepts unbounded longitude. Its projection and drag-limit math keep
  // +/-Infinity as horizontal limits without restricting repeated world copies.
  return [
    [-north, -Infinity],
    [north, Infinity],
  ];
}

const enforcing = new WeakSet<L.Map>();
const applied = new WeakMap<L.Map, { zoom: number; worldHeight: number }>();

/** Call after initial setView, after invalidateSize, and on moveend/zoomend. */
export function enforceMapBounds(map: L.Map): void {
  if (enforcing.has(map) || map.getSize().y <= 0) return;
  enforcing.add(map);
  try {
    const worldHeight = map.getPixelWorldBounds(0).getSize().y;
    const minZoom = minimumWorldZoom(map.getSize().y, map.options.zoomSnap ?? 0.1, worldHeight);
    // Set the undersized view immediately before changing the limit; setMinZoom
    // alone may animate from a zoom where empty vertical space is still visible.
    if (map.getZoom() < minZoom) map.setView(map.getCenter(), minZoom, { animate: false });
    if (map.getMinZoom() !== minZoom) map.setMinZoom(minZoom);
    const zoom = map.getZoom();
    const previous = applied.get(map);
    if (!previous || previous.zoom !== zoom || previous.worldHeight !== worldHeight) {
      applied.set(map, { zoom, worldHeight });
      map.setMaxBounds(verticalMercatorBounds(zoom, worldHeight));
    }
    map.panInsideBounds(map.options.maxBounds!, { animate: false });
  } finally {
    enforcing.delete(map);
  }
}
