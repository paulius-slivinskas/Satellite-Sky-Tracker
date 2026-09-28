import { useCallback, useEffect, useState } from 'react';

export type MapLayer = 'minimal' | 'atlas' | 'blueprint' | 'satellite';
export const MAP_LAYERS = [
  { id: 'minimal', name: 'Minimal', description: 'Quiet & clear' },
  { id: 'atlas', name: 'Atlas', description: 'Paper & ink' },
  { id: 'blueprint', name: 'Blueprint', description: 'Technical lines' },
  { id: 'satellite', name: 'Satellite', description: 'Sentinel-2 · 2016' },
] as const satisfies ReadonlyArray<{ id: MapLayer; name: string; description: string }>;
const STORAGE_KEY = 'satapp_map_layer';

export function normalizeMapLayer(value: unknown): MapLayer {
  return MAP_LAYERS.find((layer) => layer.id === value)?.id ?? 'minimal';
}

function readMapLayer(): MapLayer {
  try {
    return normalizeMapLayer(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'minimal';
  }
}

export function useMapLayer(): readonly [MapLayer, (next: MapLayer) => void] {
  const [layer, updateLayer] = useState<MapLayer>(readMapLayer);
  useEffect(() => {
    const syncLayer = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        updateLayer(normalizeMapLayer(event.newValue));
      }
    };
    window.addEventListener('storage', syncLayer);
    return () => window.removeEventListener('storage', syncLayer);
  }, []);
  const setLayer = useCallback((next: MapLayer) => {
    const normalized = normalizeMapLayer(next);
    updateLayer(normalized);
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // Map selection remains usable when browser storage is blocked or full.
    }
  }, []);
  return [layer, setLayer] as const;
}
