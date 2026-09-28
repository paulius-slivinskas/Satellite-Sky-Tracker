import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';
import type { MapLayer } from '../state/mapLayer';
import type { Theme } from '../state/theme';

// Original palettes on the OpenMapTiles schema; Minimal remains the quiet default.
const minimal = {
  dark: { land: '#141517', water: '#08090a', road: '#303338', border: '#35393e', label: '#858b92' },
  light: {
    land: '#edeef0',
    water: '#d6e1e8',
    road: '#b5bcc4',
    border: '#b5bdc6',
    label: '#616b76',
  },
};
const atlas = {
  light: {
    land: '#f2eddf',
    water: '#abcbd0',
    road: '#bd9369',
    border: '#9b9e84',
    label: '#5f665d',
    park: '#d7ddc3',
    casing: '#fffcf0',
  },
  dark: {
    land: '#273236',
    water: '#11262f',
    road: '#9b896b',
    border: '#607771',
    label: '#c1cabc',
    park: '#30423d',
    casing: '#1d292c',
  },
};
const blueprint = {
  light: {
    land: '#eaf3f8',
    water: '#c4dfec',
    road: '#648fa8',
    border: '#92b5c9',
    label: '#355e76',
    coast: '#8cb6cc',
    grid: '#8bafc4',
  },
  dark: {
    land: '#14283c',
    water: '#091a2b',
    road: '#457990',
    border: '#3c617a',
    label: '#a2c8d8',
    coast: '#396881',
    grid: '#41637c',
  },
};
export const VECTOR_ATTRIBUTION =
  '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const IMAGERY_ATTRIBUTION =
  '<a href="https://cloudless.eox.at">EOxCloudless</a> by <a href="https://eox.at">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2016) · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · <a href="https://maps.eox.at">EOX::Maps</a>';
export const mapAttribution = (layer: MapLayer) =>
  layer === 'satellite' ? `${IMAGERY_ATTRIBUTION} | ${VECTOR_ATTRIBUTION}` : VECTOR_ATTRIBUTION;

// Geographic graticule: it stays tied to real coordinates while zooming and panning.
const graticule: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    ...Array.from({ length: 35 }, (_, i) => {
      const lon = -170 + i * 10;
      return [
        [lon, -85],
        [lon, 85],
      ];
    }),
    ...Array.from({ length: 17 }, (_, i) => {
      const lat = -80 + i * 10;
      return [
        [-180, lat],
        [0, lat],
        [180, lat],
      ];
    }),
  ].map((coordinates) => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  })),
};
export function basemapStyle(theme: Theme, layer: MapLayer = 'minimal'): StyleSpecification {
  const p =
    layer === 'atlas' ? atlas[theme] : layer === 'blueprint' ? blueprint[theme] : minimal[theme];
  const satellite = layer === 'satellite';
  const accents: LayerSpecification[] =
    layer === 'atlas'
      ? [
          {
            id: 'woodland',
            type: 'fill',
            source: 'openmaptiles',
            'source-layer': 'landcover',
            minzoom: 5,
            filter: ['==', ['get', 'class'], 'wood'],
            paint: { 'fill-color': atlas[theme].park, 'fill-opacity': 0.6 },
          },
          {
            id: 'parks',
            type: 'fill',
            source: 'openmaptiles',
            'source-layer': 'park',
            minzoom: 8,
            paint: { 'fill-color': atlas[theme].park, 'fill-opacity': 0.5 },
          },
        ]
      : [];
  return {
    version: 8,
    name: `${layer}-${theme}`,
    sources: {
      openmaptiles: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: VECTOR_ATTRIBUTION,
      },
      ...(layer === 'blueprint'
        ? { graticule: { type: 'geojson' as const, data: graticule } }
        : {}),
      ...(satellite
        ? {
            imagery: {
              type: 'raster' as const,
              tiles: [
                'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
              ],
              tileSize: 256,
              maxzoom: 14,
              attribution: IMAGERY_ATTRIBUTION,
            },
          }
        : {}),
    },
    // Local font rendering uses the same Google Sans as the interface.
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': p.land } },
      ...accents,
      ...(satellite
        ? [
            {
              id: 'imagery',
              type: 'raster' as const,
              source: 'imagery',
              paint: {
                'raster-brightness-max': theme === 'dark' ? 0.72 : 1,
                'raster-saturation': theme === 'dark' ? -0.16 : 0,
                'raster-fade-duration': 200,
              },
            },
          ]
        : ([
            {
              id: 'water',
              type: 'fill' as const,
              source: 'openmaptiles',
              'source-layer': 'water',
              filter: ['!=', ['get', 'brunnel'], 'tunnel'],
              paint: {
                'fill-color': p.water,
                ...(layer === 'blueprint' ? { 'fill-outline-color': blueprint[theme].coast } : {}),
              },
            },
          ] as LayerSpecification[])),
      {
        id: 'rivers',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        minzoom: 7,
        layout: { visibility: satellite ? 'none' : 'visible' },
        paint: {
          'line-color': p.water,
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.6, 14, 2],
        },
      },
      {
        id: 'borders',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: {
          'line-color': satellite ? '#cdd8d2' : p.border,
          'line-width': 0.65,
          'line-dasharray': [3, 3],
          'line-opacity': satellite ? 0.45 : 1,
        },
      },
      {
        id: 'local-roads',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 10,
        filter: [
          'all',
          ['==', ['geometry-type'], 'LineString'],
          ['match', ['get', 'class'], ['minor', 'service'], true, false],
        ],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: satellite ? 'none' : 'visible',
        },
        paint: {
          'line-color': p.road,
          'line-opacity': 0.6,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.4],
        },
      },
      ...(layer === 'atlas'
        ? ([
            {
              id: 'road-casing',
              type: 'line' as const,
              source: 'openmaptiles',
              'source-layer': 'transportation',
              minzoom: 8,
              filter: [
                'all',
                ['==', ['geometry-type'], 'LineString'],
                [
                  'match',
                  ['get', 'class'],
                  ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'],
                  true,
                  false,
                ],
              ],
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: {
                'line-color': atlas[theme].casing,
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.6, 14, 5],
              },
            },
          ] as LayerSpecification[])
        : []),
      {
        id: 'main-roads',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: satellite ? 9 : 5,
        filter: [
          'all',
          ['==', ['geometry-type'], 'LineString'],
          [
            'match',
            ['get', 'class'],
            ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'],
            true,
            false,
          ],
        ],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': satellite ? '#dce3ce' : p.road,
          'line-opacity': satellite ? 0.28 : 1,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 10, 1, 14, 2.4],
        },
      },
      ...(layer === 'blueprint'
        ? [
            {
              id: 'graticule',
              type: 'line' as const,
              source: 'graticule',
              maxzoom: 6,
              paint: {
                'line-color': blueprint[theme].grid,
                'line-width': 0.5,
                'line-opacity': 0.4,
                'line-dasharray': [2, 5],
              },
            },
          ]
        : []),
      ...((['country', 'city', 'town', 'village'] as const).map((kind) => ({
        id: `places-${kind}`,
        type: 'symbol' as const,
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: { country: 1, city: 3, town: 7, village: 10 }[kind],
        ...(kind === 'country' ? { maxzoom: 7 } : {}),
        filter: ['==', ['get', 'class'], kind] as const,
        layout: {
          'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name:en'], ['get', 'name']],
          'text-font': ['Google Sans', 'Arial'],
          'text-letter-spacing': kind === 'country' && layer !== 'minimal' ? 0.12 : 0,
          'text-transform': kind === 'country' && layer !== 'minimal' ? 'uppercase' : 'none',
          'text-size': kind === 'country' ? 12 : kind === 'city' ? 13 : 11,
          'text-padding': kind === 'country' ? 14 : 8,
          'text-max-width': 8,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
        },
        paint: {
          'text-color': satellite ? '#f3f2e8' : p.label,
          'text-halo-color': satellite ? '#17231d' : p.land,
          'text-halo-width': satellite ? 1.8 : 1.5,
        },
      })) as StyleSpecification['layers']),
    ],
  };
}
