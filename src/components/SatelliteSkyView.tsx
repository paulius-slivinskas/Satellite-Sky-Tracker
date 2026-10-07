import { useEffect, useMemo, useRef, useState } from 'react';
import { lookAngles } from '../domain/orbits';
import { passSkyTrail, skyTrail } from '../domain/skyTrail';
import {
  projectSky,
  skyCamera,
  skyGround,
  skyGuide,
  skyPath,
  skyViewport,
  type SkyCamera,
} from '../domain/skyProjection';
import type { Observer, Satellite, Pass } from '../domain/types';

export function SatelliteSkyView({
  satellite,
  observer,
  pass,
  now,
  camera,
}: {
  satellite: Satellite;
  observer: Observer | null;
  pass: Pass | null;
  now: number;
  camera: SkyCamera | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(() =>
    skyViewport(window.innerWidth, window.innerHeight),
  );
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setViewport(skyViewport(width, height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const look = observer ? lookAngles(satellite, now, observer) : null;
  const [manual, setManual] = useState(() => ({
    azimuth: look && look.elevation >= 0 ? look.azimuth : (pass?.riseAz ?? look?.azimuth ?? 0),
    elevation: look && look.elevation >= 0 ? Math.min(70, look.elevation) : 15,
  }));
  const drag = useRef<{ x: number; y: number; azimuth: number; elevation: number } | null>(null);
  const view = camera ?? skyCamera(manual.azimuth, manual.elevation);
  const points = useMemo(
    () => (observer && pass ? passSkyTrail(satellite, observer, pass) : []),
    [satellite, observer, pass],
  );
  const trailTime = Math.floor(now / 10000) * 10000;
  const approach = useMemo(
    () =>
      observer && pass && trailTime < pass.start
        ? skyTrail(satellite, observer, trailTime, pass.start)
        : [],
    [satellite, observer, pass, trailTime],
  );
  const project = (az: number, el: number) => projectSky(view, az, el, viewport);
  const path = (angles: Array<{ azimuth: number; elevation: number } | null>) =>
    skyPath(view, angles, viewport);
  const horizon = path(Array.from({ length: 121 }, (_, i) => ({ azimuth: i * 3, elevation: 0 })));
  const track = path(points.map((point) => point.look));
  const elapsed = path(points.map((point) => (point.time <= now ? point.look : null)));
  const incoming = path([
    look,
    ...approach.filter((point) => point.time > now).map((point) => point.look),
  ]);
  const target = look ? project(look.azimuth, look.elevation) : null;
  const guide = look ? skyGuide(view, look.azimuth, look.elevation, viewport) : null;
  const azimuth = ((Math.atan2(view.forward.x, view.forward.y) * 180) / Math.PI + 360) % 360;
  const elevation = (Math.asin(Math.max(-1, Math.min(1, view.forward.z))) * 180) / Math.PI;
  const cx = viewport.width / 2,
    cy = viewport.height / 2;
  const direction = guide
    ? Math.abs(Math.sin((guide.angle * Math.PI) / 180)) > 0.55
      ? `Turn ${guide.angle > 0 ? 'right' : 'left'}`
      : `Tilt ${Math.cos((guide.angle * Math.PI) / 180) > 0 ? 'up' : 'down'}`
    : '';
  const label = (time: number) =>
    new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div
      ref={container}
      className="finder-sky"
      data-tracking={camera ? 'live' : 'manual'}
      onPointerDown={(event) => {
        if (camera) return;
        drag.current = { x: event.clientX, y: event.clientY, ...manual };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (camera || !drag.current) return;
        const rect = event.currentTarget.getBoundingClientRect();
        setManual({
          azimuth: drag.current.azimuth - ((event.clientX - drag.current.x) / rect.width) * 90,
          elevation: Math.max(
            -85,
            Math.min(
              85,
              drag.current.elevation + ((event.clientY - drag.current.y) / rect.height) * 75,
            ),
          ),
        });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <svg
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        role="img"
        aria-label={`Sky view for ${satellite.name}, horizon and satellite pass trajectory`}
      >
        <polygon points={skyGround(view, viewport)} className="finder-sky-ground" />
        <g className="finder-sky-grid">
          {[30, 60].map((level) => (
            <path
              key={level}
              d={path(
                Array.from({ length: 121 }, (_, i) => ({ azimuth: i * 3, elevation: level })),
              )}
            />
          ))}
          {[0, 90, 180, 270].map((az) => (
            <path
              key={az}
              d={path(Array.from({ length: 61 }, (_, i) => ({ azimuth: az, elevation: i * 1.5 })))}
            />
          ))}
        </g>
        <path d={horizon} className="finder-sky-horizon" />
        {[
          ['N', 0],
          ['E', 90],
          ['S', 180],
          ['W', 270],
        ].map(([name, az]) => {
          const point = project(Number(az), 0);
          return point.visible ? (
            <text
              key={name}
              x={point.x}
              y={point.y + 20}
              className="finder-sky-cardinal"
              textAnchor="middle"
            >
              {name}
            </text>
          ) : null;
        })}
        <path d={track} className="finder-sky-track" />
        <path d={elapsed} className="finder-sky-elapsed" />
        {approach.length > 0 && <path d={incoming} className="finder-sky-approach" />}
        {pass &&
          observer &&
          [
            { name: 'Rise', time: pass.start, clipped: pass.startClipped },
            { name: 'Set', time: pass.end, clipped: pass.endClipped },
          ].map(({ name, time, clipped }) => {
            if (clipped) return null;
            const angles = lookAngles(satellite, Number(time), observer);
            const point = angles ? project(angles.azimuth, angles.elevation) : null;
            return point?.visible ? (
              <g key={name}>
                <circle cx={point.x} cy={point.y} r="4" className="finder-sky-crossing" />
                <text
                  x={Math.max(46, Math.min(viewport.width - 46, point.x))}
                  y={Math.max(22, Math.min(viewport.height - 24, point.y - 12))}
                  textAnchor="middle"
                  className="finder-sky-crossing-label"
                >
                  {name} {label(Number(time))}
                </text>
              </g>
            ) : null;
          })}
        <g
          transform={`translate(${cx} ${cy})`}
          className="finder-sky-reticle"
          data-aligned={!!guide && guide.distance <= 5}
        >
          <circle r="23" />
          <path d="M-30 0h12m36 0h12M0-30v12m0 36v12" />
          <circle r="2" />
        </g>
        {guide && guide.distance > 5 && (
          <g
            className="finder-sky-guide"
            data-testid="sky-guide"
            transform={`translate(${guide.x} ${guide.y})`}
          >
            <title>Point the phone towards the satellite</title>
            <path d="M0 9V-7m-6 5 6-7 6 7" transform={`rotate(${guide.angle})`} />
          </g>
        )}
        {target?.visible && (
          <g
            className="finder-sky-satellite"
            data-testid="sky-satellite"
            transform={`translate(${target.x} ${target.y})`}
          >
            <circle r="15" />
            <path d="m-5-5 10 10m-10 0 10-10M-12-7l5-5 5 5-5 5Zm14 14 5-5 5 5-5 5Z" />
            <text y="-23" textAnchor="middle">
              {satellite.name}
            </text>
          </g>
        )}
      </svg>
      <div className="finder-sky-mode">
        {camera ? 'Phone tracking' : 'Preview · Drag to explore'}
      </div>
      {guide && guide.distance > 5 && (
        <div className="finder-sky-direction" aria-live="off">
          {direction} {Math.round(guide.distance)}°
          <span>
            {look!.elevation < 0
              ? 'Satellite below the horizon'
              : 'Follow the arrow to the satellite'}
          </span>
        </div>
      )}
      <div className="finder-sky-bearing">
        {Math.round(azimuth)}° · {Math.round(elevation)}°
      </div>
    </div>
  );
}
