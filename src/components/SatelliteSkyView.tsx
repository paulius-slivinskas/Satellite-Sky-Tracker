import { useMemo, useRef, useState } from 'react';
import { lookAngles } from '../domain/orbits';
import { shortestTurn } from '../domain/finder';
import {
  projectSky,
  skyCamera,
  skyGround,
  skyPath,
  SKY_HEIGHT,
  SKY_WIDTH,
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
  const look = observer ? lookAngles(satellite, now, observer) : null;
  const [manual, setManual] = useState(() => ({
    azimuth: look && look.elevation >= 0 ? look.azimuth : (pass?.riseAz ?? look?.azimuth ?? 0),
    elevation: look && look.elevation >= 0 ? Math.min(70, look.elevation) : 15,
  }));
  const drag = useRef<{ x: number; y: number; azimuth: number; elevation: number } | null>(null);
  const view = camera ?? skyCamera(manual.azimuth, manual.elevation);
  const points = useMemo(() => {
    if (!observer || !pass) return [];
    const from = pass.losStart - 90000,
      to = pass.losEnd + 90000;
    return Array.from({ length: 181 }, (_, i) => {
      const time = from + ((to - from) * i) / 180;
      return { time, look: lookAngles(satellite, time, observer) };
    });
  }, [satellite, observer, pass]);
  const horizon = skyPath(
    view,
    Array.from({ length: 121 }, (_, i) => ({ azimuth: i * 3, elevation: 0 })),
  );
  const track = skyPath(
    view,
    points.map((point) => point.look),
  );
  const elapsed = skyPath(
    view,
    points.map((point) => (point.time <= now ? point.look : null)),
  );
  const below = skyPath(
    view,
    points.map((point) => (point.look && point.look.elevation < 0 ? point.look : null)),
  );
  const target = look ? projectSky(view, look.azimuth, look.elevation) : null;
  const azimuth =
    ((((Math.atan2(view.forward.x, view.forward.y) * 180) / Math.PI) % 360) + 360) % 360;
  const elevation = (Math.asin(Math.max(-1, Math.min(1, view.forward.z))) * 180) / Math.PI;
  const turn = look ? shortestTurn(azimuth, look.azimuth) : 0;
  const label = (time: number) =>
    new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div
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
        viewBox={`0 0 ${SKY_WIDTH} ${SKY_HEIGHT}`}
        role="img"
        aria-label={`Sky view for ${satellite.name}, horizon and satellite pass trajectory`}
      >
        <polygon points={skyGround(view)} className="finder-sky-ground" />
        <g className="finder-sky-grid">
          {[30, 60].map((level) => (
            <path
              key={level}
              d={skyPath(
                view,
                Array.from({ length: 121 }, (_, i) => ({ azimuth: i * 3, elevation: level })),
              )}
            />
          ))}
          {[0, 90, 180, 270].map((az) => (
            <path
              key={az}
              d={skyPath(
                view,
                Array.from({ length: 61 }, (_, i) => ({ azimuth: az, elevation: i * 1.5 })),
              )}
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
          const point = projectSky(view, Number(az), 0);
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
        <path d={below} className="finder-sky-below" />
        {pass &&
          observer &&
          [
            ['Rise', pass.losStart],
            ['Set', pass.losEnd],
          ].map(([name, time]) => {
            const angles = lookAngles(satellite, Number(time), observer);
            const point = angles ? projectSky(view, angles.azimuth, angles.elevation) : null;
            return point?.visible ? (
              <g key={name}>
                <circle cx={point.x} cy={point.y} r="4" className="finder-sky-crossing" />
                <text
                  x={Math.max(46, Math.min(354, point.x))}
                  y={Math.max(22, Math.min(436, point.y - 12))}
                  textAnchor="middle"
                  className="finder-sky-crossing-label"
                >
                  {name} {label(Number(time))}
                </text>
              </g>
            ) : null;
          })}
        <path d="M188 230h8m8 0h8m-12-12v8m0 8v8" className="finder-sky-reticle" />
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
      {target && !target.visible && (
        <div className="finder-sky-direction" aria-live="off">
          {target.depth <= 0 || target.x < 0 || target.x > SKY_WIDTH
            ? `Turn ${turn > 0 ? 'right' : 'left'} ${Math.round(Math.abs(turn))}°`
            : `Tilt ${look!.elevation > elevation ? 'up' : 'down'} ${Math.round(Math.abs(look!.elevation - elevation))}°`}
          <span>
            {look!.elevation < 0 ? 'Satellite below the horizon' : 'Satellite outside this view'}
          </span>
        </div>
      )}
      <div className="finder-sky-bearing">
        {Math.round(azimuth)}° · {Math.round(elevation)}°
      </div>
    </div>
  );
}
