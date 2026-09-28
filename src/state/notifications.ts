import { useCallback, useEffect, useRef, useState } from 'react';
import { readStored, writeStored } from '../data/storage';
import {
  desktopPermission,
  requestDesktopPermission,
  NotificationDelivery,
} from '../data/notifications';
import {
  PassStartDetector,
  PassPeakDetector,
  notificationPasses,
  type PassNotificationKind,
} from '../domain/passNotifications';
import { positionAt } from '../domain/orbits';
import type { Observer, Satellite, SatellitePass } from '../domain/types';
import { usePasses } from './hooks';

const KEY = 'satapp_pass_notifications_v1';
const NO_SATELLITES: Satellite[] = [];
interface Notice {
  id: string;
  title: string;
  body: string;
  expires: number;
}

export function usePassNotifications(
  satellites: Satellite[],
  observer: Observer | null,
  displayedPasses: SatellitePass[],
) {
  const [enabled, setEnabled] = useState(() => readStored(KEY) !== false);
  const [soundReady, setSoundReady] = useState(false);
  const [soundTested, setSoundTested] = useState(false);
  const [permission, setPermission] = useState(desktopPermission);
  const [testing, setTesting] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [delivery] = useState(() => new NotificationDelivery());
  const [liveAnchor, setLiveAnchor] = useState(Date.now);
  const live = usePasses(enabled ? satellites : NO_SATELLITES, observer, liveAnchor, '3h');
  const latest = useRef({ satellites, observer, passes: live.passes });
  latest.current = {
    satellites,
    observer,
    passes: notificationPasses(live.passes, displayedPasses),
  };
  const sequence = useRef(0);
  const alive = useRef(true);
  const locationKey = observer ? `${observer.lat}:${observer.lon}:${observer.alt}` : '';

  useEffect(() => {
    if (!enabled) return;
    let lastRefresh = Date.now();
    setLiveAnchor(lastRefresh);
    const refresh = () => {
      lastRefresh = Date.now();
      setLiveAnchor(lastRefresh);
    };
    const timer = window.setInterval(refresh, 3600000);
    const wake = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh >= 3600000) refresh();
    };
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [enabled, locationKey]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      delivery.dispose();
    };
  }, [delivery]);

  const show = useCallback((title: string, body: string) => {
    const id = `pass-notice-${++sequence.current}`;
    setNotices((current) =>
      [...current, { id, title, body, expires: Date.now() + 30000 }].slice(-3),
    );
    return id;
  }, []);
  const dismiss = useCallback(
    (id: string) => setNotices((current) => current.filter((notice) => notice.id !== id)),
    [],
  );

  useEffect(() => {
    if (!notices.length) return;
    const timer = window.setTimeout(
      () => setNotices((current) => current.filter((notice) => notice.expires > Date.now())),
      Math.max(0, Math.min(...notices.map((notice) => notice.expires)) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [notices]);

  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      void delivery.unlockSound().then((ready) => {
        if (alive.current) setSoundReady(ready);
      });
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    const refreshPermission = () => setPermission(desktopPermission());
    window.addEventListener('focus', refreshPermission);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('focus', refreshPermission);
    };
  }, [enabled, delivery]);

  useEffect(() => {
    if (!enabled || !locationKey) return;
    const detector = new PassStartDetector();
    const peaks = new PassPeakDetector();
    const announce = (kind: PassNotificationKind, title: string, body: string) => {
      const id = show(title, body);
      const played = delivery.playSound(kind);
      setSoundReady(played);
      if (desktopPermission() === 'granted' && !delivery.showDesktop(title, body, id, played))
        setPermission('unavailable');
    };
    const check = () => {
      const { satellites, observer, passes } = latest.current;
      if (!observer) return;
      const now = Date.now();
      const started = detector.sample(
        satellites.map((satellite) => ({
          satellite,
          elevation: positionAt(satellite, now, observer)?.elevation ?? null,
        })),
        now,
      );
      if (started.length)
        announce(
          'entering',
          'Entering visibility',
          `${started.map((satellite) => satellite.name).join(', ')} ${started.length === 1 ? 'is' : 'are'} rising above your horizon.`,
        );
      const atPeak = peaks.sample(
        passes.filter((pass) => satellites.some((satellite) => satellite.noradId === pass.noradId)),
        now,
      );
      if (atPeak.length)
        announce(
          'peak',
          'Pass peak',
          `${atPeak.map((pass) => `${pass.satelliteName} (${pass.maxElevation.toFixed(1)}°)`).join(', ')} ${atPeak.length === 1 ? 'is' : 'are'} at maximum elevation — the peak marked on the pass trajectory.`,
        );
    };
    check();
    const timer = window.setInterval(check, 1000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [enabled, locationKey, delivery, show]);

  const test = useCallback(
    async (kind: PassNotificationKind) => {
      setTesting(true);
      setSoundTested(true);
      const title = kind === 'entering' ? 'Test: entering visibility' : 'Test: pass peak';
      const body =
        kind === 'entering'
          ? 'Two rising notes announce entry above your horizon.'
          : 'Three distinct notes announce maximum elevation.';
      const id = show(title, body);
      // Start both during the user gesture; neither capability is required for the in-app alert.
      const sound = delivery.unlockSound().then((ready) => {
        if (!alive.current) return false;
        const played = ready && delivery.playSound(kind);
        setSoundReady(played);
        return played;
      });
      const desktop = requestDesktopPermission();
      const [played, allowed] = await Promise.all([sound, desktop]);
      if (!alive.current) return;
      setPermission(allowed);
      if (allowed === 'granted' && !delivery.showDesktop(title, body, id, played))
        setPermission('unavailable');
      setTesting(false);
    },
    [delivery, show],
  );

  return {
    enabled,
    soundReady,
    soundTested,
    permission,
    testing,
    predictionError: live.error,
    notices,
    dismiss,
    test,
    setEnabled: (value: boolean) => {
      setEnabled(value);
      writeStored(KEY, value);
    },
  };
}
