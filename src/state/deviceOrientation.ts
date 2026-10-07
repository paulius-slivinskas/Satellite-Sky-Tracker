import { CameraStabilizer } from '../domain/cameraStabilizer';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  orientationAngles,
  orientationCamera,
  type OrientationReading,
} from '../domain/deviceOrientation';
export type OrientationStatus =
  'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'stale' | 'error';
interface Snapshot {
  accuracy?: number | null;
  camera?: import('../domain/skyProjection').SkyCamera | null;
  reference?: 'magnetic' | 'true' | null;
  heading: number | null;
  elevation: number | null;
  status: OrientationStatus;
  error: string | null;
}
let snapshot: Snapshot = { heading: null, elevation: null, status: 'idle', error: null };
let headingSnapshot = snapshot;
const subscribers = new Set<() => void>();
let cleanup: (() => void) | null = null;
let pending: Promise<void> | null = null;
let generation = 0;
function publish(value: Snapshot) {
  snapshot = value;
  if (
    headingSnapshot.heading !== value.heading ||
    headingSnapshot.elevation !== value.elevation ||
    headingSnapshot.status !== value.status ||
    headingSnapshot.error !== value.error ||
    headingSnapshot.reference !== value.reference
  )
    headingSnapshot = { ...value, camera: undefined };
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
    let preferredSource = 0;
    let sourceUntil = 0;
    let smoother = new CameraStabilizer();
    let frame = 0;
    let latest: Snapshot | null = null;
    const animate = (time: number) => {
      frame = 0;
      if (!latest) return;
      publish({ ...latest, camera: smoother.advance(time) });
      if (!smoother.settled) frame = window.requestAnimationFrame(animate);
    };
    const onReading = (event: DeviceOrientationEvent) => {
      const reading = event as DeviceOrientationEvent & OrientationReading;
      const time = performance.now();
      const source = Number.isFinite(reading.webkitCompassHeading)
        ? 3
        : event.type === 'deviceorientationabsolute'
          ? 2
          : reading.absolute
            ? 1
            : 0;
      if (source < preferredSource && time < sourceUntil) return;
      const screenAngle =
        screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0;
      const angles = orientationAngles(reading, screenAngle);
      const camera = orientationCamera(reading, screenAngle);
      // Empty or invalid readings must not replace a usable camera or renew its freshness.
      if (angles.heading === null || !camera) {
        if (snapshot.status !== 'active')
          publish({
            ...angles,
            status: 'unavailable',
            error: 'North-referenced compass data is unavailable.',
          });
        return;
      }
      if (source !== preferredSource || Date.now() - lastReading > 3000)
        smoother = new CameraStabilizer();
      preferredSource = source;
      sourceUntil = time + 1500;
      lastReading = Date.now();
      received = true;
      latest = {
        ...angles,
        accuracy:
          source === 3 && Number.isFinite(reading.webkitCompassAccuracy)
            ? reading.webkitCompassAccuracy!
            : null,
        reference: source === 3 ? 'magnetic' : 'true',
        status: 'active',
        error: null,
      };
      smoother.ingest(camera, time);
      if (!frame) frame = window.requestAnimationFrame(animate);
    };
    window.addEventListener('deviceorientationabsolute', onReading);
    window.addEventListener('deviceorientation', onReading);
    const timer = window.setInterval(() => {
      if (Date.now() - lastReading > 3000) {
        latest = null;
        window.cancelAnimationFrame(frame);
        frame = 0;
        publish({
          heading: null,
          elevation: null,
          status: received ? 'stale' : 'unavailable',
          error: received
            ? 'Compass signal paused. Keep this page visible.'
            : 'No compass readings received from this device.',
        });
      }
    }, 1000);
    cleanup = () => {
      latest = null;
      window.cancelAnimationFrame(frame);
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
export function useDeviceOrientation(includeCamera = false) {
  const value = useSyncExternalStore(
    subscribe,
    () => (includeCamera ? snapshot : headingSnapshot),
    () => (includeCamera ? snapshot : headingSnapshot),
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
