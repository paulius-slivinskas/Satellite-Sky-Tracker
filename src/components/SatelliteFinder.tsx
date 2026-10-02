import { Button, Chip, CloseButton } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { lookAngles } from '../domain/orbits';
import { passProgress, shortestTurn } from '../domain/finder';
import { predictPasses } from '../domain/passes';
import type { Observer, Satellite, SatellitePass } from '../domain/types';
import { useDeviceOrientation } from '../state/deviceOrientation';
import './SatelliteFinder.css';

export function SatelliteFinder({
  satellite,
  observer,
  pass,
}: {
  satellite: Satellite;
  observer: Observer | null;
  pass?: SatellitePass;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="finder-launch" variant="secondary" onPress={() => setOpen(true)}>
        Find in the sky
      </Button>
      {open &&
        createPortal(
          <FinderView
            satellite={satellite}
            observer={observer}
            pass={pass}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  );
}
export function SatelliteFinderDialog(props: {
  satellite: Satellite;
  observer: Observer | null;
  pass?: SatellitePass;
  onClose: () => void;
}) {
  return createPortal(<FinderView {...props} />, document.body);
}
function FinderView({
  satellite,
  observer,
  onClose,
  pass,
}: {
  satellite: Satellite;
  observer: Observer | null;
  onClose: () => void;
  pass?: SatellitePass;
}) {
  const orientation = useDeviceOrientation();
  const [now, setNow] = useState(Date.now);
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
  const minute = Math.floor(now / 60000);
  const derivedPass = useMemo(() => {
    if (pass || !observer) return null;
    // Include the previous orbit to recover the current pass's start. Recompute only
    // once per minute, never for the one-second pointing updates.
    return (
      predictPasses(satellite, observer, minute * 60000 - 90 * 60000, '12h').find(
        (candidate) => candidate.end > minute * 60000,
      ) ?? null
    );
  }, [satellite, observer, minute, pass]);
  const shownPass = pass ?? derivedPass;
  const progress = shownPass ? passProgress(shownPass, now) : null;
  const clock = (time: number) =>
    new Date(time).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  const sensorActive = orientation.status === 'active' && orientation.heading !== null;
  const heading = sensorActive ? orientation.heading! : 0;
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
      <header className="finder-header">
        <h2>{satellite.name}</h2>
        <CloseButton
          ref={closeRef}
          className="finder-close"
          onPress={onClose}
          aria-label="Close sky finder"
        />
      </header>
      <div className="finder-body">
        <button
          type="button"
          className="finder-compass"
          aria-label={sensorActive ? 'Compass active' : 'Enable compass direction'}
          aria-pressed={sensorActive}
          disabled={orientation.status === 'requesting'}
          onClick={() => void orientation.requestPermission()}
        >
          <svg viewBox="0 0 240 240" aria-hidden="true">
            <g className="finder-compass-ring">
              <circle cx="120" cy="120" r="114" />
              {Array.from({ length: 32 }, (_, index) => (
                <line
                  key={index}
                  x1="120"
                  y1="6"
                  x2="120"
                  y2={index % 4 === 0 ? '17' : '11'}
                  transform={`rotate(${index * 11.25 - heading} 120 120)`}
                />
              ))}
              {['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((label, index) => {
                const angle = ((index * 45 - heading) * Math.PI) / 180;
                return (
                  <text
                    key={label}
                    x={120 + 91 * Math.sin(angle)}
                    y={120 - 91 * Math.cos(angle)}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {label}
                  </text>
                );
              })}
            </g>
            <g transform={`rotate(${turn} 120 120)`} className="finder-compass-arrow">
              <svg
                x="86"
                y="86"
                width="68"
                height="68"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              >
                <path d="m12 3 7 17-7-4-7 4Z" />
              </svg>
            </g>
          </svg>
        </button>
        <div className="finder-state">
          {!observer ? (
            <Chip size="sm" variant="soft">
              <Chip.Label>Observer location required</Chip.Label>
            </Chip>
          ) : !look ? (
            <Chip size="sm" variant="soft">
              <Chip.Label>Position unavailable</Chip.Label>
            </Chip>
          ) : !above ? (
            <Chip size="sm" variant="soft">
              <Chip.Label>Below the horizon</Chip.Label>
            </Chip>
          ) : null}
          {!sensorActive && (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => void orientation.requestPermission()}
              isDisabled={orientation.status === 'requesting'}
            >
              Enable compass
            </Button>
          )}
          {orientation.error && (
            <Chip size="sm" variant="soft">
              <Chip.Label>
                {orientation.status === 'denied'
                  ? 'Compass permission denied'
                  : orientation.status === 'stale'
                    ? 'Compass paused'
                    : 'Compass unavailable'}
              </Chip.Label>
            </Chip>
          )}
          {(!Number.isFinite(tleAgeDays) || tleAgeDays > 7 || tleAgeDays < -1) && (
            <Chip size="sm" variant="soft">
              <Chip.Label>Orbit data outdated</Chip.Label>
            </Chip>
          )}
        </div>
        {shownPass && progress && (
          <section className="finder-pass" aria-label="Pass progress">
            {progress.status === 'upcoming' && <p className="finder-pass-state">Not started yet</p>}
            {progress.status === 'complete' && <p className="finder-pass-state">Pass complete</p>}
            <svg
              viewBox="0 0 400 146"
              role="img"
              aria-label={`Pass ${Math.round(progress.progress * 100)} percent complete. Start ${clock(shownPass.start)}. End ${clock(shownPass.end)}. Current time ${clock(now)}.`}
            >
              <path d="M40 90 Q200 50 360 90" className="finder-pass-track" />
              <circle cx={progress.x} cy={progress.y} r="4" className="finder-pass-dot" />
              <text
                x={progress.x}
                y={progress.y - 15}
                textAnchor={
                  progress.progress < 0.15 ? 'start' : progress.progress > 0.85 ? 'end' : 'middle'
                }
              >
                {clock(now)}
              </text>
              <text x="40" y="112" textAnchor="start">
                Start
                <tspan x="40" dy="17">
                  {clock(shownPass.start)}
                </tspan>
              </text>
              <text x="360" y="112" textAnchor="end">
                End
                <tspan x="360" dy="17">
                  {clock(shownPass.end)}
                </tspan>
              </text>
            </svg>
          </section>
        )}
      </div>
    </div>
  );
}
