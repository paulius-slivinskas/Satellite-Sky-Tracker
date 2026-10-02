import { Button } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cardinal, lookAngles } from '../domain/orbits';
import {
  finderTrajectory,
  nextHorizonPreview,
  pointingInstruction,
  shortestTurn,
} from '../domain/finder';
import type { Observer, Satellite } from '../domain/types';
import { useDeviceOrientation } from '../state/deviceOrientation';
import './SatelliteFinder.css';

export function SatelliteFinder({
  satellite,
  observer,
}: {
  satellite: Satellite;
  observer: Observer | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="finder-launch" variant="secondary" onPress={() => setOpen(true)}>
        Find in the sky
      </Button>
      {open &&
        createPortal(
          <FinderView satellite={satellite} observer={observer} onClose={() => setOpen(false)} />,
          document.body,
        )}
    </>
  );
}
function FinderView({
  satellite,
  observer,
  onClose,
}: {
  satellite: Satellite;
  observer: Observer | null;
  onClose: () => void;
}) {
  const orientation = useDeviceOrientation();
  const [now, setNow] = useState(Date.now);
  const [manualHeading, setManualHeading] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    closeRef.current?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', dismiss, true);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('keydown', dismiss, true);
      if (root) root.inert = wasInert;
      previous?.focus();
    };
  }, []);
  const look = observer ? lookAngles(satellite, now, observer) : null;
  const trajectory = observer ? finderTrajectory(satellite, observer, now) : [];
  const minute = Math.floor(now / 60000);
  const next = useMemo(
    () => (observer ? nextHorizonPreview(satellite, observer, minute * 60000) : null),
    [satellite, observer, minute],
  );
  const sensorActive = orientation.status === 'active' && orientation.heading !== null;
  const heading = sensorActive ? orientation.heading! : manualHeading;
  const turn = look ? shortestTurn(heading, look.azimuth) : 0;
  const above = look && look.elevation >= 0;
  const tleAgeDays = (now - (satellite.satrec.jdsatepoch - 2440587.5) * 86400000) / 86400000;
  return (
    <div
      className="satellite-finder"
      role="dialog"
      aria-modal="true"
      aria-label="Satellite sky finder"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        if (event.key === 'Tab') {
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input',
          );
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <header>
        <div>
          <p>LIVE SKY · {new Date(now).toLocaleTimeString()}</p>
          <h2>{satellite.name}</h2>
        </div>
        <button ref={closeRef} onClick={onClose} aria-label="Close sky finder">
          ×
        </button>
      </header>
      <p>Uses the current clock, independent of map simulation. Azimuth is from true north.</p>
      {(!Number.isFinite(tleAgeDays) || tleAgeDays > 7 || tleAgeDays < -1) && (
        <p role="status">
          Orbit elements are old or their epoch is invalid. Live pointing may be inaccurate; refresh
          satellite data before relying on this guide.
        </p>
      )}
      {!observer ? (
        <p role="status">Set an observer location in the sidebar, then reopen the finder.</p>
      ) : !look ? (
        <p role="status">Orbit position unavailable. Check the satellite data.</p>
      ) : (
        <>
          <div className="finder-dial" aria-hidden="true">
            <span>Phone top</span>
            <div style={{ transform: `rotate(${turn}deg)` }}>↑</div>
          </div>
          <h3>
            {above
              ? sensorActive && orientation.reference === 'magnetic' && Math.abs(turn) <= 5
                ? 'Approximately facing the satellite'
                : pointingInstruction(turn)
              : 'Below the horizon'}
          </h3>
          <p className="finder-coordinates">
            {cardinal(look.azimuth)} {look.azimuth.toFixed(1)}° azimuth ·{' '}
            {look.elevation.toFixed(1)}° elevation
          </p>
          {!above && (
            <p>
              {next && next.at > now
                ? `Next horizon crossing around ${new Date(next.at).toLocaleTimeString()}, toward ${cardinal(next.azimuth)}.`
                : 'No upcoming crossing found in the next three hours.'}
            </p>
          )}
          {above && (
            <p>
              Point toward {cardinal(look.azimuth)}, {Math.round(look.elevation)}° above the
              horizon. Hold the phone flat with its top edge toward that azimuth; use the elevation
              as a separate guide.
            </p>
          )}
          <section aria-label="Upcoming trajectory">
            <h4>Direction over the next minute</h4>
            <ol className="finder-trajectory">
              {trajectory.map((point) => (
                <li key={point.seconds}>
                  <span>+{point.seconds}s</span>
                  <strong>
                    {cardinal(point.azimuth)} {Math.round(point.azimuth)}°
                  </strong>
                  <span>{Math.round(point.elevation)}° high</span>
                </li>
              ))}
            </ol>
          </section>
          <p>
            Above the horizon does not guarantee visibility: sunlight, cloud and satellite
            brightness matter.
          </p>
        </>
      )}
      <section className="finder-sensors">
        <Button
          onPress={() => void orientation.requestPermission()}
          isDisabled={orientation.status === 'requesting'}
        >
          Enable compass
        </Button>
        <p role="status">
          {sensorActive
            ? orientation.reference === 'magnetic'
              ? 'Magnetic compass: guidance is approximate because local declination is unknown. Satellite azimuth uses true north. Keep the phone flat and away from magnets.'
              : 'True-north compass active. Hold the phone flat; keep away from magnets and check against a known direction.'
            : orientation.error ||
              'Compass inactive. Use a physical compass and the manual heading below.'}
        </p>
        {!sensorActive && (
          <label>
            Manual heading from true north: {manualHeading}°
            <input
              aria-label="Manual compass heading"
              type="range"
              min="0"
              max="359"
              value={manualHeading}
              onChange={(event) => setManualHeading(Number(event.target.value))}
            />
          </label>
        )}
      </section>
    </div>
  );
}
