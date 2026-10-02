import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppAlert } from './AppAlert';
import { Button } from '@heroui/react';
import type { OrientationStatus } from '../state/deviceOrientation';
import './HeadingControl.css';
interface Props {
  hasObserver: boolean;
  onSetLocation: () => void;
  reference?: 'magnetic' | 'true' | null;
  heading: number | null;
  status: OrientationStatus;
  error: string | null;
  requestPermission: () => Promise<void>;
  stop: () => void;
}
export function HeadingControl({
  hasObserver,
  onSetLocation,
  reference,
  heading,
  status,
  error,
  requestPermission,
  stop,
}: Props) {
  const [needsLocation, setNeedsLocation] = useState(false);
  const [notice, setNotice] = useState<{ id: number; body: string } | null>(null);
  const [attempted, setAttempted] = useState(false);
  const inactive = !['idle', 'active', 'requesting'].includes(status);
  useEffect(() => {
    if (attempted && status === 'active') {
      setAttempted(false);
      setNotice(null);
      return;
    }
    if (attempted && inactive) {
      setNotice({
        id: Date.now(),
        body: error ?? 'Phone compass is unavailable. Try enabling it again.',
      });
      setAttempted(false);
    }
  }, [attempted, inactive, error, status]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return (
    <div className="heading-control" data-inactive={inactive || undefined}>
      <Button
        className="map-control-button heading-button"
        variant="secondary"
        aria-label={status === 'active' ? 'Disable phone heading' : 'Enable phone heading'}
        aria-pressed={status === 'active'}
        onPress={() => {
          if (!hasObserver) {
            setNeedsLocation(true);
            return;
          }
          setNeedsLocation(false);
          if (status === 'active') stop();
          else {
            if (inactive)
              setNotice({
                id: Date.now(),
                body: error ?? 'Phone compass is unavailable. Try enabling it again.',
              });
            if (status === 'stale') return;
            setAttempted(true);
            void requestPermission();
          }
        }}
      >
        {status === 'active' && heading !== null ? (
          <span
            className="heading-dial"
            aria-label={`${Math.round(heading)} degrees ${reference === 'magnetic' ? 'magnetic' : 'true'} north`}
          >
            <span className="heading-degrees">{Math.round(heading)}°</span>
            <span
              className="heading-tick"
              aria-hidden="true"
              style={{ transform: `rotate(${heading}deg)` }}
            />
          </span>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
            data-inactive={inactive || undefined}
          >
            <path d="m12 3 7 17-7-4-7 4Z" />
          </svg>
        )}
      </Button>
      {needsLocation && !hasObserver && (
        <div className="heading-status">
          <p>Set your observer location to show your phone direction on the map.</p>
          <Button size="sm" variant="secondary" onPress={onSetLocation}>
            Set observer location
          </Button>
        </div>
      )}
      {notice &&
        createPortal(
          <div className="heading-notification">
            <AppAlert
              status="warning"
              title="Phone heading paused"
              dismissKey={String(notice.id)}
              onDismiss={() => setNotice(null)}
            >
              {notice.body}
            </AppAlert>
          </div>,
          document.body,
        )}
    </div>
  );
}
