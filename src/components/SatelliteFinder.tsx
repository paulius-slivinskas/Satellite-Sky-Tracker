import { Button, Chip, CloseButton } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { lookAngles } from '../domain/orbits';
import { passProgress } from '../domain/finder';
import { predictPasses } from '../domain/passes';
import type { Observer, Satellite, SatellitePass } from '../domain/types';
import { useDeviceOrientation } from '../state/deviceOrientation';
import { AppAlert } from './AppAlert';
import './SatelliteFinder.css';
import { SatelliteSkyView } from './SatelliteSkyView';

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
      <Button size="sm" className="finder-launch" variant="secondary" onPress={() => setOpen(true)}>
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
  const orientation = useDeviceOrientation(true);
  const [attempted, setAttempted] = useState(false);
  const [notice, setNotice] = useState<{ id: number; body: string } | null>(null);
  useEffect(() => {
    if (!attempted) return;
    if (orientation.status === 'active') {
      setAttempted(false);
      setNotice(null);
    } else if (!['idle', 'requesting'].includes(orientation.status)) {
      setNotice({
        id: Date.now(),
        body: orientation.error ?? 'No compass readings are available on this device.',
      });
      setAttempted(false);
    }
  }, [attempted, orientation.status, orientation.error]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
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
  const remaining = shownPass ? Math.max(0, Math.ceil((shownPass.start - now) / 1000)) : 0;
  const countdown = [
    Math.floor(remaining / 3600),
    Math.floor((remaining % 3600) / 60),
    remaining % 60,
  ]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
  const clock = (time: number) =>
    new Date(time).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  const sensorActive = orientation.status === 'active' && !!orientation.camera;
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
      <SatelliteSkyView
        satellite={satellite}
        observer={observer}
        pass={shownPass}
        now={now}
        camera={sensorActive ? orientation.camera! : null}
        northAligned={!sensorActive || !orientation.calibration}
      />
      <header className="finder-header">
        <h2>{satellite.name}</h2>
        <CloseButton
          ref={closeRef}
          className="finder-close"
          onPress={onClose}
          aria-label="Close sky finder"
        />
      </header>
      {notice && (
        <div className="finder-notification">
          <AppAlert
            status="danger"
            title="Compass unavailable"
            dismissKey={String(notice.id)}
            onDismiss={() => setNotice(null)}
          >
            {notice.body}
          </AppAlert>
        </div>
      )}
      <div className="finder-body">
        <div className="finder-tracking-controls">
          {orientation.calibration ? (
            <p role="status">
              {orientation.calibration === 'poor-accuracy'
                ? 'Motion tracking is on. Move away from metal and hold the phone flat to align north.'
                : orientation.calibration === 'hold-still'
                  ? 'Motion tracking is on. Hold still for a moment to align north…'
                  : 'Motion tracking is on. Hold your phone flat, screen up, for a moment to align north.'}
            </p>
          ) : sensorActive ? (
            <>
              <p>Hold the screen towards you and point the phone at the sky.</p>
              {orientation.reference === 'magnetic' && (
                <Button size="sm" variant="ghost" onPress={orientation.recalibrate}>
                  Align north
                </Button>
              )}
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              aria-label="Enable compass"
              isDisabled={orientation.status === 'requesting'}
              onPress={() => {
                setNotice(null);
                setAttempted(true);
                void orientation.requestPermission();
              }}
            >
              {orientation.status === 'requesting' ? 'Enabling…' : 'Enable phone tracking'}
            </Button>
          )}
        </div>
        <dl className="finder-live-position" aria-label="Live satellite position">
          <div>
            <dt>Live azimuth</dt>
            <dd>{look ? `${look.azimuth.toFixed(1)}°` : '—'}</dd>
          </div>
          <div>
            <dt>Elevation</dt>
            <dd>{look ? `${look.elevation.toFixed(1)}°` : '—'}</dd>
          </div>
        </dl>
        <div className="finder-state">
          {sensorActive &&
          !orientation.calibration &&
          orientation.accuracy != null &&
          (orientation.accuracy < 0 || orientation.accuracy > 25) ? (
            <Chip size="sm" variant="soft">
              <Chip.Label>Low compass accuracy · move away from metal</Chip.Label>
            </Chip>
          ) : sensorActive && !orientation.calibration && orientation.reference === 'magnetic' ? (
            <Chip size="sm" variant="soft">
              <Chip.Label>Approximate compass direction</Chip.Label>
            </Chip>
          ) : null}
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
          {(!Number.isFinite(tleAgeDays) || tleAgeDays > 7 || tleAgeDays < -1) && (
            <Chip size="sm" variant="soft">
              <Chip.Label>Orbit data outdated</Chip.Label>
            </Chip>
          )}
        </div>
        {shownPass && progress && (
          <section className="finder-pass" aria-label="Pass progress">
            {progress.status === 'upcoming' && (
              <div className="finder-countdown">
                <p role="timer" aria-label="Until pass start" aria-live="off">
                  {countdown}
                </p>
                <span>until pass start</span>
              </div>
            )}
            {progress.status === 'complete' && <p className="finder-pass-state">Pass complete</p>}
            <div className="finder-horizon-times">
              <span>
                Rise <strong>{shownPass.startClipped ? '—' : clock(shownPass.start)}</strong>
              </span>
              <span>
                Set <strong>{shownPass.endClipped ? '—' : clock(shownPass.end)}</strong>
              </span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
