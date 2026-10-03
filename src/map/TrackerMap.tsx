import { memo, useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { useDeviceOrientation } from '../state/deviceOrientation';
import { HeadingControl } from '../components/HeadingControl';
import L from 'leaflet';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { basemapStyle, mapAttribution } from './basemapStyle';
import type { MapLayer } from '../state/mapLayer';
import type { Theme } from '../state/theme';
import { StationaryTrack } from './StationaryTrack';
import { enforceMapBounds } from './mapBounds';
import { interpolatePosition, subpixelCircleMarker } from './smoothMotion';
import { nextPassApproaches } from '../domain/passApproaches';
import {
  losRadiusMeters,
  orbitalParams,
  positionAt,
  splitTrack,
  trackPoints,
  WORLD_SHIFTS,
} from '../domain/orbits';
import type { Observer, SatellitePass, Position, Satellite, ViewState } from '../domain/types';
interface Props {
  theme: Theme;
  mapLayer: MapLayer;
  satellites: Satellite[];
  positions: Map<string, Position>;
  nextPositions: Map<string, Position>;
  playing: boolean;
  speed: number;
  readTime: () => number;
  selected: Satellite | undefined;
  time: number;
  observer: Observer | null;
  allLos: boolean;
  passes: SatellitePass[];
  passSatellites: Satellite[];
  showPasses: boolean;
  activePass: number | null;
  timeFormat: '12h' | '24h';
  view: ViewState['map'];
  onSelect: (norad: string) => void;
  onViewChange: (view: ViewState['map']) => void;
  onHoverPass: (index: number | null) => void;
  onSelectPass: (index: number) => void;
  onSetObserverLocation: () => void;
}
interface PassLayers {
  lines: L.Polyline[];
  labels: L.Marker[];
  opacity: number;
  labelOpacity: number;
  points: L.CircleMarker[];
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
setWorkerUrl(mapWorkerUrl);
export const TrackerMap = memo(function TrackerMap(props: Props) {
  const { mapLayer } = props;
  const orientation = useDeviceOrientation();
  const [zoomLimits, setZoomLimits] = useState({ atMin: false, atMax: false });
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const engine = useRef<{
    map: L.Map;
    basemap: L.MaplibreGL;
    theme: Theme;
    mapLayer: MapLayer;
    markers: Map<string, L.CircleMarker[]>;
    circles: Map<string, L.Circle[]>;
    satellites: L.LayerGroup;
    los: L.LayerGroup;
    selection: L.LayerGroup;
    orbit: L.LayerGroup;
    observer: L.LayerGroup;
    passes: L.LayerGroup;
    approaches: L.LayerGroup;
    approachRenderer: L.SVG;
    approachLayers: Array<{ index: number; track: StationaryTrack; to: number }>;
    approachSnapshot: {
      passes: SatellitePass[];
      satellites: Satellite[];
      time: number;
      key: string;
    } | null;
    outlines: L.CircleMarker[];
    selectedCircles: L.Circle[];
    orbitTracks: {
      satellite: Satellite;
      future: StationaryTrack;
      half: number;
    } | null;
    passLayers: PassLayers[];
  } | null>(null);
  useEffect(() => {
    const map = L.map(container.current!, {
      zoomControl: false,
      worldCopyJump: true,
      preferCanvas: true,
      maxBoundsViscosity: 1,
      zoomSnap: 0.1,
      maxZoom: 12,
    }).setView([props.view.lat, props.view.lon], props.view.zoom);
    enforceMapBounds(map);
    const updateZoomLimits = () =>
      setZoomLimits({
        atMin: map.getZoom() <= map.getMinZoom(),
        atMax: map.getZoom() >= map.getMaxZoom(),
      });
    map.on('zoomend zoomlevelschange', updateZoomLimits);
    updateZoomLimits();
    const basemap = maplibreGL({
      style: basemapStyle(props.theme, mapLayer),
      renderWorldCopies: true,
      attributionControl: false,
    }).addTo(map);
    map.attributionControl.addAttribution(mapAttribution(mapLayer));
    const layer = () => L.layerGroup().addTo(map);
    engine.current = {
      map,
      basemap,
      theme: props.theme,
      mapLayer,
      satellites: layer(),
      los: layer(),
      selection: layer(),
      orbit: layer(),
      observer: layer(),
      approaches: layer(),
      passes: layer(),
      approachRenderer: L.svg({ padding: 0.5 }),
      approachLayers: [],
      approachSnapshot: null,
      markers: new Map(),
      circles: new Map(),
      outlines: [],
      selectedCircles: [],
      orbitTracks: null,
      passLayers: [],
    };
    map.on('moveend', () => {
      enforceMapBounds(map);
      const center = map.getCenter();
      latest.current.onViewChange({ lat: center.lat, lon: center.lng, zoom: map.getZoom() });
    });
    const resize = new ResizeObserver(() => {
      map.invalidateSize();
      enforceMapBounds(map);
    });
    resize.observe(container.current!);
    return () => {
      resize.disconnect();
      engine.current?.orbitTracks?.future.destroy();
      engine.current?.approachLayers.forEach(({ track }) => track.destroy());
      map.remove();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    const e = engine.current!;
    if (e.theme === props.theme && e.mapLayer === mapLayer) return;
    if (e.mapLayer !== mapLayer) {
      e.map.attributionControl.removeAttribution(mapAttribution(e.mapLayer));
      e.map.attributionControl.addAttribution(mapAttribution(mapLayer));
    }
    e.basemap.getMaplibreMap().setStyle(basemapStyle(props.theme, mapLayer));
    e.theme = props.theme;
    e.mapLayer = mapLayer;
  }, [props.theme, mapLayer]);
  useEffect(() => {
    const e = engine.current!;
    const center = e.map.getCenter();
    if (
      Math.abs(center.lat - props.view.lat) > 0.00001 ||
      Math.abs(center.lng - props.view.lon) > 0.00001 ||
      Math.abs(e.map.getZoom() - props.view.zoom) > 0.01
    )
      e.map.setView([props.view.lat, props.view.lon], props.view.zoom, { animate: false });
  }, [props.view]);
  useEffect(() => {
    const e = engine.current!;
    const used = new Set<string>(),
      usedCircles = new Set<string>();
    for (const sat of props.satellites) {
      const pos = props.positions.get(sat.id);
      if (!pos) continue;
      used.add(sat.id);
      const dim = props.allLos && props.observer && (pos.elevation ?? -90) < 0;
      let markers = e.markers.get(sat.id);
      if (!markers) {
        markers = WORLD_SHIFTS.map((shift) => {
          const marker = subpixelCircleMarker([pos.lat, pos.lon + shift], {
            radius: sat.category === 'iss' ? 3 : 2,
            color: sat.color,
            fillColor: sat.color,
            fillOpacity: 0.9,
            weight: 8,
            opacity: 0,
          }).addTo(e.satellites);
          const label = document.createElement('span');
          label.textContent = sat.name;
          marker.bindTooltip(label);
          marker.on('click', () => latest.current.onSelect(sat.noradId));
          marker.on('mouseover', () => marker.setRadius(6));
          marker.on('mouseout', () => marker.setRadius(sat.category === 'iss' ? 3 : 2));
          return marker;
        });
        e.markers.set(sat.id, markers);
      }
      markers.forEach((marker, i) => {
        marker.setLatLng([pos.lat, pos.lon + WORLD_SHIFTS[i]]);
        marker.setStyle({ fillOpacity: dim ? 0.15 : 0.9 });
      });
      if (
        props.allLos &&
        props.observer &&
        (pos.elevation ?? -90) >= 0 &&
        sat.id !== props.selected?.id
      ) {
        usedCircles.add(sat.id);
        let circles = e.circles.get(sat.id);
        if (!circles) {
          circles = WORLD_SHIFTS.map((shift) =>
            L.circle([pos.lat, pos.lon + shift], {
              radius: 0,
              color: sat.color,
              weight: 1,
              fill: false,
              interactive: false,
            }).addTo(e.los),
          );
          e.circles.set(sat.id, circles);
        }
        circles.forEach((circle, i) => {
          circle.setLatLng([pos.lat, pos.lon + WORLD_SHIFTS[i]]);
          circle.setRadius(losRadiusMeters(pos.altKm, props.observer!.alt));
          circle.setStyle({ opacity: props.selected ? 0.15 : 0.45 });
        });
      }
    }
    for (const [id, markers] of e.markers)
      if (!used.has(id)) {
        markers.forEach((marker) => e.satellites.removeLayer(marker));
        e.markers.delete(id);
      }
    for (const [id, circles] of e.circles)
      if (!usedCircles.has(id)) {
        circles.forEach((circle) => e.los.removeLayer(circle));
        e.circles.delete(id);
      }
    const selected = props.selected;
    const pos = selected ? props.positions.get(selected.id) : null;
    if (!selected || !pos || !used.has(selected.id)) {
      e.selection.clearLayers();
      e.outlines = [];
      e.selectedCircles = [];
      e.orbitTracks?.future.destroy();
      e.orbitTracks = null;
      return;
    }
    if (!e.outlines.length) {
      e.outlines = WORLD_SHIFTS.map((shift) =>
        subpixelCircleMarker([pos.lat, pos.lon + shift], {
          radius: 5,
          color: selected.color,
          weight: 1.5,
          fill: false,
          interactive: false,
        }).addTo(e.selection),
      );
      e.selectedCircles = WORLD_SHIFTS.map((shift) =>
        L.circle([pos.lat, pos.lon + shift], {
          radius: 0,
          color: selected.color,
          weight: 1,
          opacity: 0.75,
          fill: false,
          interactive: false,
        }).addTo(e.selection),
      );
    }
    e.outlines.forEach((marker, i) => {
      marker.setLatLng([pos.lat, pos.lon + WORLD_SHIFTS[i]]);
      marker.setStyle({ color: selected.color });
    });
    e.selectedCircles.forEach((circle, i) => {
      circle.setLatLng([pos.lat, pos.lon + WORLD_SHIFTS[i]]);
      circle.setRadius(losRadiusMeters(pos.altKm, props.observer?.alt ?? 0));
      circle.setStyle({ color: selected.color });
    });
    // Watchlist passes already show the relevant orbit and incoming route.
    if (props.showPasses && props.passes.some((pass) => pass.noradId === selected.noradId)) {
      e.orbitTracks?.future.destroy();
      e.orbitTracks = null;
      return;
    }
    const half = orbitalParams(selected).periodMin * 30000;
    if (e.orbitTracks?.satellite !== selected) {
      e.orbitTracks?.future.destroy();
      const options = {
        color: selected.color,
        weight: 1,
        dashArray: '1 10',
        lineCap: 'round' as const,
      };
      e.orbitTracks = {
        satellite: selected,
        half,
        future: new StationaryTrack(e.map, e.orbit, e.approachRenderer, selected, {
          ...options,
          opacity: 0.95,
          className: 'orbit-track-future',
        }),
      };
    }
    const now = props.playing ? props.readTime() : props.time;
    e.orbitTracks.future.update(now, now + half);
  }, [
    props.satellites,
    props.positions,
    props.selected,
    props.time,
    props.observer,
    props.allLos,
    props.showPasses,
    props.passes,
  ]);
  // Propagate in React at 4 Hz, but move fractional-pixel dots at display refresh rate.
  // The shared clock keeps pause, speed changes and time scrubbing on the same instant.
  useEffect(() => {
    if (!props.playing) return;
    let frame = 0;
    const animate = () => {
      const e = engine.current;
      if (!e) return;
      const current = latest.current;
      const now = current.readTime();
      const progress = (now - current.time) / (250 * current.speed);
      for (const [id, markers] of e.markers) {
        const from = current.positions.get(id);
        if (!from) continue;
        const pos = interpolatePosition(from, current.nextPositions.get(id) ?? from, progress);
        markers.forEach((marker, i) => marker.setLatLng([pos.lat, pos.lon + WORLD_SHIFTS[i]]));
        e.circles
          .get(id)
          ?.forEach((circle, i) => circle.setLatLng([pos.lat, pos.lon + WORLD_SHIFTS[i]]));
        if (id === current.selected?.id) {
          e.outlines.forEach((marker, i) => marker.setLatLng([pos.lat, pos.lon + WORLD_SHIFTS[i]]));
          e.selectedCircles.forEach((circle, i) =>
            circle.setLatLng([pos.lat, pos.lon + WORLD_SHIFTS[i]]),
          );
        }
      }
      e.orbitTracks?.future.update(now, now + e.orbitTracks.half, false);
      e.approachLayers.forEach(({ track, to }) => track.update(now, to, false));
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [props.playing]);
  useEffect(() => {
    const e = engine.current!;
    e.observer.clearLayers();
    if (props.observer)
      for (const shift of WORLD_SHIFTS) {
        if (orientation.heading !== null)
          L.marker([props.observer.lat, props.observer.lon + shift], {
            interactive: false,
            keyboard: false,
            icon: L.divIcon({
              className: 'observer-heading',
              iconSize: [44, 44],
              iconAnchor: [22, 22],
              html: `<svg width="44" height="44" viewBox="0 0 44 44" aria-label="Phone heading ${Math.round(orientation.heading)} degrees" style="transform:rotate(${orientation.heading}deg)"><path d="M22 2 34 25 22 20 10 25Z" fill="#23c55e" fill-opacity=".4" stroke="#23c55e"/></svg>`,
            }),
          }).addTo(e.observer);
        L.circleMarker([props.observer.lat, props.observer.lon + shift], {
          radius: 4,
          color: '#fff',
          fillColor: '#23c55e',
          fillOpacity: 1,
          weight: 2,
          interactive: false,
        }).addTo(e.observer);
      }
  }, [props.observer, orientation.heading]);
  useEffect(() => {
    const e = engine.current!;
    e.passes.clearLayers();
    e.passLayers = [];
    if (!props.showPasses) return;
    const satellitesById = new Map(props.passSatellites.map((sat) => [sat.noradId, sat]));
    const fmt = (time: number) =>
      new Date(time).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: props.timeFormat === '12h',
      });
    props.passes.forEach((pass, index) => {
      const sat = satellitesById.get(pass.noradId);
      if (!sat) return;
      const opacity = 0.85 - (0.5 * index) / Math.max(1, props.passes.length - 1);
      const rendered: PassLayers = {
        lines: [],
        labels: [],
        points: [],
        opacity,
        labelOpacity: props.passes.length <= 5 ? opacity : 0,
      };
      for (const segment of splitTrack(trackPoints(sat, pass.losStart, pass.losEnd)))
        for (const shift of WORLD_SHIFTS) {
          const coords = segment.map(([lat, lon]) => [lat, lon + shift] as L.LatLngTuple);
          const line = L.polyline(coords, {
            color: sat.color,
            weight: 1,
            opacity,
            interactive: false,
          }).addTo(e.passes);
          const hit = L.polyline(coords, {
            weight: 10,
            opacity: 0,
            className: 'pass-trajectory-hit',
            renderer: e.approachRenderer,
          }).addTo(e.passes);
          hit.getElement()?.setAttribute('data-pass-index', String(index));
          hit.getElement()?.setAttribute('data-los-start', String(pass.losStart));
          hit.on('mouseover', () => latest.current.onHoverPass(index));
          hit.on('mouseout', () => latest.current.onHoverPass(null));
          hit.on('click', () => latest.current.onSelectPass(index));
          rendered.lines.push(line);
        }
      for (const [time, type] of [
        [pass.losStart, 'start'],
        [pass.maxAt, 'max'],
        [pass.losEnd, 'end'],
      ] as const) {
        const pos = positionAt(sat, time);
        if (!pos) continue;
        for (const shift of WORLD_SHIFTS) {
          const label = L.marker([pos.lat, pos.lon + shift], {
            interactive: false,
            keyboard: false,
            icon: L.divIcon({
              className: `pass-time-label pass-time-label-${type}`,
              html: `<span class="pass-label-content" data-norad="${escape(pass.noradId)}" data-pass-start="${pass.start}">${type === 'max' ? `${escape(pass.satelliteName)}<br>${escape(new Date(pass.start).toLocaleDateString([], { month: 'short', day: 'numeric' }))} · ` : ''}${escape(fmt(time))}${type === 'max' ? `<br>${pass.maxElevation.toFixed(1)}°` : ''}</span>`,
              iconSize: [1, 1],
            }),
          }).addTo(e.passes);
          rendered.labels.push(label);
          const point = L.circleMarker([pos.lat, pos.lon + shift], {
            radius: 1.25,
            color: sat.color,
            fillColor: sat.color,
            fillOpacity: opacity,
            opacity,
            weight: 1,
            interactive: false,
          }).addTo(e.passes);
          rendered.points.push(point);
        }
      }
      e.passLayers[index] = rendered;
    });
  }, [props.passes, props.passSatellites, props.showPasses, props.timeFormat]);
  useEffect(() => {
    const e = engine.current!;
    const focusedPass = props.activePass === null ? null : props.passes[props.activePass];
    const focusedApproach =
      focusedPass &&
      Number.isFinite(focusedPass.losStart) &&
      Number.isFinite(focusedPass.losEnd) &&
      focusedPass.losStart > props.time &&
      focusedPass.losEnd > focusedPass.losStart
        ? [{ pass: focusedPass, index: props.activePass! }]
        : [];
    const approaches = !props.showPasses
      ? []
      : props.activePass !== null
        ? focusedApproach
        : nextPassApproaches(props.passes, props.time);
    const key = approaches
      .map(({ pass, index }) => `${pass.noradId}:${index}:${pass.losStart}`)
      .join('|');
    const previous = e.approachSnapshot;
    if (
      !previous ||
      previous.passes !== props.passes ||
      previous.satellites !== props.passSatellites ||
      previous.key !== key
    ) {
      e.approachLayers.forEach(({ track }) => track.destroy());
      e.approachLayers = [];
      e.approachSnapshot = {
        passes: props.passes,
        satellites: props.passSatellites,
        time: props.time,
        key,
      };
      const satellitesById = new Map(props.passSatellites.map((sat) => [sat.noradId, sat]));
      for (const { pass, index } of approaches) {
        const sat = satellitesById.get(pass.noradId);
        if (!sat) continue;
        const focused = props.activePass === index;
        const track = new StationaryTrack(
          e.map,
          e.approaches,
          e.approachRenderer,
          sat,
          {
            className: 'pass-approach-path',
            color: sat.color,
            weight: focused ? 1.6 : 1.2,
            opacity: props.activePass === null ? 0.55 : focused ? 0.8 : 0.12,
            dashArray: '1 10',
            lineCap: 'round',
          },
          Math.max(10000, Math.ceil((pass.losStart - props.time) / 1200000) * 1000),
          pass.losStart,
        );
        e.approachLayers.push({ index, track, to: pass.losStart });
      }
    }
    const now = props.playing ? props.readTime() : props.time;
    e.approachLayers.forEach(({ track, to }) => track.update(now, to));
  }, [props.passes, props.passSatellites, props.showPasses, props.time, props.activePass]);
  useEffect(() => {
    engine.current!.approachLayers.forEach(({ index, track }) => {
      const focused = props.activePass === index;
      track.setStyle({
        opacity: props.activePass === null ? 0.55 : focused ? 0.8 : 0.12,
        weight: focused ? 1.6 : 1.2,
      });
    });
    engine.current!.passLayers.forEach((layers, i) => {
      const focused = props.activePass === i;
      const opacity =
        props.activePass === null ? layers.opacity : focused ? 1 : layers.opacity * 0.25;
      layers.lines.forEach((line) => line.setStyle({ opacity, weight: focused ? 1.6 : 1 }));
      layers.points.forEach((point) => point.setStyle({ opacity, fillOpacity: opacity }));
      layers.labels.forEach((label) =>
        label.setOpacity(props.activePass === null ? layers.labelOpacity : focused ? 1 : 0),
      );
    });
  }, [props.activePass, props.passes, props.passSatellites, props.showPasses, props.timeFormat]);
  return (
    <>
      <div
        id="map"
        ref={container}
        aria-label="Satellite world map"
        data-map-layer={mapLayer}
        data-selected-norad={props.selected?.noradId ?? ''}
        data-active-pass={props.activePass ?? ''}
        data-pass-count={props.showPasses ? props.passes.length : 0}
        data-pass-satellites={
          props.showPasses ? [...new Set(props.passes.map((pass) => pass.noradId))].join(' ') : ''
        }
      />
      <div className="map-controls" role="group" aria-label="Map controls">
        <HeadingControl
          {...orientation}
          hasObserver={!!props.observer}
          onSetLocation={props.onSetObserverLocation}
        />
        <div className="map-zoom-controls">
          {(['in', 'out'] as const).map((direction) => (
            <Button
              key={direction}
              className="map-control-button"
              variant="secondary"
              isIconOnly
              aria-label={`Zoom ${direction}`}
              isDisabled={direction === 'in' ? zoomLimits.atMax : zoomLimits.atMin}
              onPress={() => {
                if (direction === 'in') engine.current?.map.zoomIn();
                else engine.current?.map.zoomOut();
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d={direction === 'in' ? 'M5 12h14M12 5v14' : 'M5 12h14'} />
              </svg>
            </Button>
          ))}
        </div>
      </div>
    </>
  );
});
