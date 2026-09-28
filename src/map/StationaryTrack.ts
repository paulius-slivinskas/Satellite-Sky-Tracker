import L from 'leaflet';
import { orbitalParams, WORLD_SHIFTS } from '../domain/orbits';
import {
  distanceAtTime,
  timedTrackSegments,
  trackChunkRange,
  type TimedPoint,
} from '../domain/timedTrack';
import type { Satellite } from '../domain/types';

interface TrackLine extends L.Polyline {
  afterProject?: () => void;
}
const ProjectedLine = L.Polyline.extend({
  _updatePath(this: TrackLine) {
    (L.Polyline.prototype as unknown as { _updatePath: () => void })._updatePath.call(this);
    this.afterProject?.();
  },
}) as new (points: L.LatLngExpression[], options: L.PolylineOptions) => TrackLine;
interface Segment {
  line: TrackLine;
  points: TimedPoint[];
  times: number[];
  projected: L.Point[];
  distances: number[];
  shift: number;
  projection: string;
  range: string;
  bounds: L.Bounds;
}

/** Cache anchored geometry; compensate the trimmed prefix to keep every dash stationary. */
export class StationaryTrack {
  private chunks = new Map<number, Segment[]>();
  private step: number;
  private duration: number;
  private from = 0;
  private to = 0;
  constructor(
    private map: L.Map,
    private group: L.LayerGroup,
    private renderer: L.SVG,
    private satellite: Satellite,
    private options: L.PolylineOptions,
    minimumStep = 5000,
    private terminalTime = Infinity,
  ) {
    this.step = Math.max(minimumStep, (orbitalParams(satellite).periodMin * 60000) / 1200);
    this.duration = this.step * 128;
    map.on('move', this.refreshVisible, this);
  }
  setStyle(options: L.PolylineOptions) {
    this.options = { ...this.options, ...options };
    for (const segments of this.chunks.values())
      for (const segment of segments) segment.line.setStyle(options);
  }
  update(from: number, to: number, updateMetadata = true) {
    this.from = from;
    this.to = to;
    const wanted = new Set(trackChunkRange(from, to, this.duration));
    for (const [chunk, segments] of this.chunks)
      if (!wanted.has(chunk)) {
        for (const segment of segments) this.group.removeLayer(segment.line);
        this.chunks.delete(chunk);
      }
    for (const chunk of wanted)
      if (!this.chunks.has(chunk)) {
        const segments: Segment[] = [];
        const start = chunk * this.duration;
        for (const points of timedTrackSegments(
          this.satellite,
          start,
          Math.min(start + this.duration, this.terminalTime),
          this.step,
        )) {
          for (const shift of WORLD_SHIFTS) {
            const line = new ProjectedLine(
              points.map((p) => [p.lat, p.lon + shift] as L.LatLngTuple),
              {
                ...this.options,
                renderer: this.renderer,
                noClip: true,
                smoothFactor: 0,
                interactive: false,
              },
            ).addTo(this.group);
            const path = line.getElement()!;
            path.setAttribute('data-norad', this.satellite.noradId);
            path.setAttribute('data-track-chunk', String(chunk));
            const segment: Segment = {
              line,
              points,
              times: points.map((p) => p.time),
              projected: [],
              distances: [],
              shift,
              projection: '',
              range: '',
              bounds: L.bounds([]),
            };
            // Leaflet may redraw a path after a pan/zoom; restore its visible interval immediately.
            line.afterProject = () => this.draw(segment, true);
            segments.push(segment);
          }
        }
        this.chunks.set(chunk, segments);
      }
    for (const segments of this.chunks.values())
      for (const segment of segments) {
        this.draw(segment);
        if (updateMetadata) {
          const path = segment.line.getElement()!;
          path.setAttribute('data-from', String(from));
          path.setAttribute('data-to', String(to));
        }
      }
  }
  private refreshVisible() {
    for (const segments of this.chunks.values()) for (const segment of segments) this.draw(segment);
  }
  private draw(segment: Segment, force = false) {
    const origin = this.map.getPixelOrigin();
    // A drag translates the map pane. Only zoom or a new pixel origin needs projection.
    const key = `${this.map.getZoom()}:${origin.x}:${origin.y}`;
    if (segment.projection !== key) {
      segment.projection = key;
      segment.projected = segment.points.map((p) =>
        this.map.latLngToLayerPoint([p.lat, p.lon + segment.shift]),
      );
      segment.bounds = L.bounds(segment.projected);
      segment.distances = [0];
      for (let i = 1; i < segment.projected.length; i++)
        segment.distances.push(
          segment.distances[i - 1] + segment.projected[i].distanceTo(segment.projected[i - 1]),
        );
      force = true;
    }
    const corner = this.map.containerPointToLayerPoint([-64, -64]);
    const viewport = L.bounds(corner, corner.add(this.map.getSize()).add([128, 128]));
    if (!segment.bounds.intersects(viewport)) {
      if (force || segment.range !== 'outside')
        segment.line.getElement()!.setAttribute('d', 'M0 0');
      segment.range = 'outside';
      return;
    }
    const start = distanceAtTime(segment.times, segment.distances, this.from);
    const end = distanceAtTime(segment.times, segment.distances, this.to);
    const range = `${start}:${end}`;
    if (!force && segment.range === range) return;
    segment.range = range;
    const path = segment.line.getElement() as SVGPathElement;
    const visible: L.Point[] = [];
    for (let i = 1; i < segment.projected.length && end > start; i++) {
      const a = segment.distances[i - 1],
        b = segment.distances[i];
      if (b <= start || a >= end || b === a) continue;
      const from = segment.projected[i - 1],
        to = segment.projected[i];
      const at = (distance: number) =>
        from.add(to.subtract(from).multiplyBy((distance - a) / (b - a)));
      if (!visible.length) visible.push(at(Math.max(start, a)));
      visible.push(at(Math.min(end, b)));
    }
    path.setAttribute(
      'd',
      visible.length > 1 ? visible.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('') : 'M0 0',
    );
    // Positive dash offset advances the pattern by the removed prefix length.
    // Remaining dashes therefore retain their original positions along the cached path.
    segment.line.options.dashOffset = String(start);
    path.setAttribute('stroke-dashoffset', String(start));
    path.setAttribute('data-trim-start', String(start));
    path.setAttribute('data-trim-end', String(end));
  }
  destroy() {
    this.map.off('move', this.refreshVisible, this);
    for (const segments of this.chunks.values())
      for (const segment of segments) this.group.removeLayer(segment.line);
    this.chunks.clear();
  }
}
