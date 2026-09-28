import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadCatalog, readCatalog } from '../data/catalog';
import type { Observer, SatellitePass, PassRange, Satellite } from '../domain/types';
export function useCatalog() {
  const [catalog, setCatalog] = useState(readCatalog);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadCatalog(controller.signal, setCatalog)
      .then((value) => {
        if (!controller.signal.aborted) setCatalog(value);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (!catalog.blockedUntil) return;
    const timer = window.setTimeout(
      () => setRevision((r) => r + 1),
      Math.min(2147483647, Math.max(0, catalog.blockedUntil - Date.now()) + 1000),
    );
    return () => window.clearTimeout(timer);
  }, [catalog.blockedUntil]);
  useEffect(() => {
    // An open tab picks up the weekly server update without needing a reload.
    // Fresh browser feeds are reused; the server independently gates upstream requests.
    const timer = window.setInterval(() => setRevision((r) => r + 1), 3600000);
    return () => window.clearInterval(timer);
  }, []);
  return { ...catalog, loading, refresh: () => setRevision((r) => r + 1) };
}
export function useSimulation(anchor: number, playing: boolean, speed: number) {
  const [sample, setSample] = useState({ anchor, time: anchor });
  const clock = useRef({ time: anchor, wall: performance.now(), playing, speed });
  const readTime = useCallback(() => {
    const current = clock.current;
    return (
      current.time + (current.playing ? (performance.now() - current.wall) * current.speed : 0)
    );
  }, []);
  useLayoutEffect(() => {
    clock.current = { time: anchor, wall: performance.now(), playing, speed };
    setSample({ anchor, time: anchor });
    if (!playing) return;
    const timer = window.setInterval(() => setSample({ anchor, time: readTime() }), 250);
    return () => clearInterval(timer);
  }, [anchor, playing, speed, readTime]);
  return { time: sample.anchor === anchor ? sample.time : anchor, readTime };
}
interface PassResult {
  passes: SatellitePass[];
  loading: boolean;
  error: string | null;
}
export function startPassCalculation(
  satellites: Satellite[],
  observer: Observer,
  anchor: number,
  range: PassRange,
  onResult: (result: PassResult) => void,
) {
  let worker: Worker | undefined;
  let active = true;
  const finish = (result: PassResult) => {
    if (!active) return;
    active = false;
    worker?.terminate();
    onResult(result);
  };
  const fail = () =>
    finish({
      passes: [],
      loading: false,
      error: 'Could not calculate passes. Update the watchlist to retry.',
    });
  try {
    worker = new Worker(new URL('../domain/passes.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event) =>
      finish({ passes: event.data.passes ?? [], loading: false, error: event.data.error ?? null });
    worker.onerror = fail;
    worker.onmessageerror = fail;
    worker.postMessage({ satellites, observer, time: anchor, range });
  } catch {
    fail();
  }
  return () => {
    active = false;
    worker?.terminate();
  };
}
export function usePasses(
  satellites: Satellite[],
  observer: Observer | null,
  anchor: number,
  range: PassRange,
) {
  const [result, setResult] = useState<PassResult>({ passes: [], loading: false, error: null });
  useEffect(() => {
    if (!satellites.length || !observer) {
      setResult({ passes: [], loading: false, error: null });
      return;
    }
    setResult({ passes: [], loading: true, error: null });
    return startPassCalculation(satellites, observer, anchor, range, setResult);
  }, [satellites, observer, anchor, range]);
  return result;
}
