import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  orientationAngles,
  orientationCamera,
  type OrientationReading,
} from '../domain/deviceOrientation';
export type OrientationStatus =
  'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'stale' | 'error';
interface Snapshot {
  camera?: import('../domain/skyProjection').SkyCamera | null;
  reference?: 'magnetic' | 'true' | null;
  heading: number | null;
  elevation: number | null;
  status: OrientationStatus;
  error: string | null;
}
let snapshot: Snapshot = { heading: null, elevation: null, status: 'idle', error: null };
const subscribers = new Set<() => void>();
let cleanup: (() => void) | null = null;
let pending: Promise<void> | null = null;
let generation = 0;
function publish(value: Snapshot) {
  snapshot = value;
  subscribers.forEach((listener) => listener());
}
function stopSensors() {
  generation++;
  cleanup?.();
  cleanup = null;
  publish({ heading: null, elevation: null, status: 'idle', error: null });
}
async function startSensors() {
  const started = ++generation;
  if (cleanup) return;
  if (!window.isSecureContext || !('DeviceOrientationEvent' in window)) {
    publish({
      heading: null,
      elevation: null,
      status: 'unavailable',
      error: 'A secure connection and a device compass are required.',
    });
    return;
  }
  publish({ heading: null, elevation: null, status: 'requesting', error: null });
  try {
    const api = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: (absolute?: boolean) => Promise<string>;
    };
    const permission = api.requestPermission ? await api.requestPermission(true) : 'granted';
    if (!subscribers.size || generation !== started) return;
    if (permission !== 'granted') {
      publish({
        heading: null,
        elevation: null,
        status: 'denied',
        error: 'Motion permission was denied. Allow it in your browser settings.',
      });
      return;
    }
    if (!subscribers.size || generation !== started) return;
    let lastReading = Date.now();
    let received = false;
    let absoluteUntil = 0;
    const onReading = (event: DeviceOrientationEvent) => {
      const reading = event as DeviceOrientationEvent & OrientationReading;
      const absolute = reading.absolute || Number.isFinite(reading.webkitCompassHeading);
      if (!absolute && Date.now() < absoluteUntil) return;
      if (absolute) absoluteUntil = Date.now() + 1500;
      const angles = orientationAngles(
        reading,
        screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0,
      );
      // Some browsers interleave empty sensor events with valid compass readings.
      // Keep the last usable reading until the freshness timer expires.
      if (angles.heading === null && snapshot.status === 'active') return;
      lastReading = Date.now();
      received = true;
      publish({
        ...angles,
        camera: orientationCamera(
          reading,
          screen.orientation?.angle ??
            (window as Window & { orientation?: number }).orientation ??
            0,
        ),
        reference: Number.isFinite(reading.webkitCompassHeading)
          ? 'magnetic'
          : reading.absolute
            ? 'true'
            : null,
        status: angles.heading === null ? 'unavailable' : 'active',
        error: angles.heading === null ? 'North-referenced compass data is unavailable.' : null,
      });
    };
    window.addEventListener('deviceorientationabsolute', onReading);
    window.addEventListener('deviceorientation', onReading);
    const timer = window.setInterval(() => {
      if (Date.now() - lastReading > 3000)
        publish({
          heading: null,
          elevation: null,
          status: received ? 'stale' : 'unavailable',
          error: received
            ? 'Compass signal paused. Keep this page visible.'
            : 'No compass readings received from this device.',
        });
    }, 1000);
    cleanup = () => {
      window.removeEventListener('deviceorientationabsolute', onReading);
      window.removeEventListener('deviceorientation', onReading);
      window.clearInterval(timer);
    };
  } catch (error) {
    if (generation !== started) return;
    publish({
      heading: null,
      elevation: null,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unable to start the compass.',
    });
  }
}
function requestPermission() {
  if (!pending)
    pending = startSensors().finally(() => {
      pending = null;
    });
  return pending;
}
function subscribe(listener: () => void) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) stopSensors();
  };
}
export function useDeviceOrientation() {
  const value = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
  useEffect(
    () => () => {
      if (!subscribers.size) stopSensors();
    },
    [],
  );
  const stop = useCallback(() => stopSensors(), []);
  return { ...value, requestPermission, stop };
}
