import { Button, Modal } from '@heroui/react';
import { useCallback, useEffect, useId, useState } from 'react';
import type { Observer, Satellite } from '../domain/types';
import {
  loadReceptionLogs,
  persistReceptionLogs,
  receptionDuration,
  startReception,
  stopReception,
  type ReceptionLog,
  receptionEquipment,
  receptionRemarks,
} from '../data/reception';
import { loadReceptionWeather } from '../data/receptionWeather';
import { AppAlert } from './AppAlert';
import './ReceptionPanel.css';
const duration = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0')}:${Math.floor((seconds / 60) % 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
};
const location = (log: ReceptionLog) =>
  log.observer
    ? `${log.observer.name || 'Observer'} · ${log.observer.lat.toFixed(5)}, ${log.observer.lon.toFixed(5)} · ${log.observer.alt} m`
    : 'No observer location set at start';
const qualityLabels = ['Very poor', 'Poor', 'Fair', 'Good', 'Excellent'];
const equipmentSuggestions = [
  'Handheld radio + Yagi antenna',
  'Handheld radio + whip antenna',
  'SDR + Yagi antenna',
  'SDR + omnidirectional antenna',
  'Base station + tracking antenna',
];
export function ReceptionPanel({ sat, observer }: { sat: Satellite; observer: Observer | null }) {
  const [logs, setLogs] = useState<ReceptionLog[]>([]);
  const [error, setError] = useState('');
  const [readable, setReadable] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [reportId, setReportId] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const equipmentListId = useId();
  const [weatherStatus, setWeatherStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [weatherRetry, setWeatherRetry] = useState(0);
  const refresh = () => {
    try {
      setLogs(loadReceptionLogs());
      setReadable(true);
      setError('');
    } catch {
      setReadable(false);
      setError('Reception storage is unavailable or damaged. Existing logs have been preserved.');
    }
  };
  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const changed = () => refresh();
    window.addEventListener('storage', changed);
    return () => {
      clearInterval(timer);
      window.removeEventListener('storage', changed);
    };
  }, []);
  const active = logs.find((log) => log.stoppedAt === null);
  const report = logs.find((log) => log.id === reportId);
  const satelliteLogs = logs.filter((log) => log.noradId === sat.noradId && log.stoppedAt !== null);
  const update = useCallback((change: (current: ReceptionLog[]) => ReceptionLog[]) => {
    try {
      // Re-read before each write so another tab's existing logs are retained.
      const next = change(loadReceptionLogs());
      persistReceptionLogs(next);
      setLogs(next);
      setError('');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save reception logs.');
      return false;
    }
  }, []);
  const start = () =>
    update((current) => {
      if (current.some((log) => log.stoppedAt === null))
        throw new Error('Stop the active reception before starting another.');
      return [...current, startReception(sat, observer)];
    });
  const stop = () => {
    if (!active) return;
    if (
      update((current) => current.map((log) => (log.id === active.id ? stopReception(log) : log)))
    )
      setReportId(active.id);
  };
  const edit = (patch: Pick<Partial<ReceptionLog>, 'quality' | 'equipment' | 'remarks'>) =>
    update((current) =>
      current.map((log) => (log.id === reportId ? { ...log, ...patch, saved: false } : log)),
    );
  const weatherLoaded = !!report?.weather;
  const reportLat = report?.observer?.lat;
  const reportLon = report?.observer?.lon;
  const reportStart = report?.startedAt;
  useEffect(() => {
    if (
      !reportId ||
      weatherLoaded ||
      reportLat === undefined ||
      reportLon === undefined ||
      reportStart === undefined
    ) {
      setWeatherStatus('idle');
      return;
    }
    const controller = new AbortController();
    setWeatherStatus('loading');
    loadReceptionWeather(
      { lat: reportLat, lon: reportLon, alt: 0, name: '' },
      reportStart,
      controller.signal,
    )
      .then((weather) => {
        if (controller.signal.aborted) return;
        update((current) =>
          current.map((log) => (log.id === reportId ? { ...log, weather } : log)),
        );
        setWeatherStatus('idle');
      })
      .catch(() => {
        if (!controller.signal.aborted) setWeatherStatus('error');
      });
    return () => controller.abort();
  }, [reportId, weatherLoaded, reportLat, reportLon, reportStart, weatherRetry, update]);
  const exportLogs = () => {
    const blob = new Blob(
      [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), logs }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'satellite-reception-logs.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="reception-panel" aria-label="Signal reception">
      <h3>Signal reception</h3>
      <p className="muted">
        Mark when you hear the signal, then rate the reception and add your equipment.
      </p>
      {error && <AppAlert status="warning">{error}</AppAlert>}
      {active && (
        <p role="status">
          Receiving {active.satelliteName} · {duration(receptionDuration(active, now))}
        </p>
      )}
      <div className="reception-actions">
        {active ? (
          <Button size="sm" variant="danger" onPress={stop} isDisabled={!readable}>
            Stop reception
          </Button>
        ) : (
          <Button size="sm" variant="primary" onPress={start} isDisabled={!readable}>
            Start reception
          </Button>
        )}
        <Button size="sm" variant="secondary" onPress={() => setHistory(!history)}>
          Reception logs ({satelliteLogs.length})
        </Button>
        {logs.length > 0 && (
          <Button size="sm" variant="ghost" onPress={exportLogs}>
            Export all logs
          </Button>
        )}
      </div>
      {history && (
        <div className="reception-history" aria-label="Reception history">
          {!satelliteLogs.length && (
            <p className="muted">No stopped sessions for this satellite yet.</p>
          )}
          {[...satelliteLogs].reverse().map((log) => (
            <button
              type="button"
              key={log.id}
              className="reception-log"
              onClick={() => setReportId(log.id)}
            >
              <span>
                {new Date(log.startedAt).toLocaleString()} · {duration(receptionDuration(log))}
              </span>
              <span>{log.saved ? 'Saved report' : 'Draft report'}</span>
            </button>
          ))}
        </div>
      )}
      <Modal
        isOpen={!!report}
        onOpenChange={(open) => {
          if (!open) setReportId(null);
        }}
      >
        <Modal.Backdrop>
          <Modal.Container size="lg" scroll="inside">
            <Modal.Dialog className="reception-dialog">
              <Modal.CloseTrigger aria-label="Close reception report" />
              <Modal.Header>
                <Modal.Heading>Reception report</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                {report && (
                  <>
                    <p>
                      <strong>{report.satelliteName}</strong> · NORAD {report.noradId}
                    </p>
                    <p className="reception-session-line">
                      {new Date(report.startedAt).toLocaleString()} ·{' '}
                      {duration(receptionDuration(report))}
                    </p>
                    {error && <AppAlert status="warning">{error}</AppAlert>}
                    <div className="reception-fields">
                      <fieldset className="reception-quality">
                        <legend>Reception quality</legend>
                        <div className="reception-stars">
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button
                              type="button"
                              key={value}
                              aria-label={`${value} ${value === 1 ? 'star' : 'stars'} · ${qualityLabels[value - 1]}`}
                              aria-pressed={report.quality === value}
                              className={(report.quality ?? 0) >= value ? 'star-selected' : ''}
                              onClick={() => edit({ quality: value })}
                            >
                              <span aria-hidden="true">★</span>
                            </button>
                          ))}
                        </div>
                        <p className="muted">
                          {report.quality
                            ? `${report.quality}/5 · ${qualityLabels[report.quality - 1]}`
                            : 'How clearly did you hear the signal?'}
                        </p>
                      </fieldset>
                      <label>
                        <span>Equipment used</span>
                        <input
                          list={equipmentListId}
                          value={receptionEquipment(report)}
                          maxLength={1000}
                          placeholder="Radio or SDR + antenna — choose or type your own"
                          onChange={(event) => edit({ equipment: event.target.value })}
                        />
                        <datalist id={equipmentListId}>
                          {equipmentSuggestions.map((value) => (
                            <option key={value} value={value} />
                          ))}
                        </datalist>
                      </label>
                      <label>
                        <span>Notes</span>
                        <textarea
                          rows={3}
                          maxLength={10000}
                          value={receptionRemarks(report)}
                          placeholder="Signal fades, noise, frequency / Doppler adjustments, obstacles, or anything worth remembering…"
                          onChange={(event) => edit({ remarks: event.target.value })}
                        />
                      </label>
                      <div
                        className="reception-weather"
                        aria-label="Weather at reception"
                        role="status"
                      >
                        <span className="reception-weather-title">Weather at reception</span>
                        {report.weather ? (
                          <>
                            <p>
                              {report.weather.description}
                              {report.weather.temperatureC !== null &&
                                ` · ${report.weather.temperatureC.toFixed(1)} °C`}
                              {report.weather.windKmh !== null &&
                                ` · Wind ${report.weather.windKmh.toFixed(0)} km/h`}
                              {report.weather.cloudPercent !== null &&
                                ` · Clouds ${report.weather.cloudPercent}%`}
                              {report.weather.precipitationMm !== null &&
                                ` · Rain ${report.weather.precipitationMm} mm`}
                            </p>
                            <small>
                              Hourly estimate ·{' '}
                              {new Date(report.weather.sampledAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              ·{' '}
                              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                                Open-Meteo
                              </a>
                            </small>
                          </>
                        ) : !report.observer ? (
                          <p className="muted">No location recorded for this session.</p>
                        ) : weatherStatus === 'error' ? (
                          <>
                            <p className="muted">
                              Weather unavailable. You can still save your report.
                            </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={() => setWeatherRetry((value) => value + 1)}
                            >
                              Retry weather
                            </Button>
                          </>
                        ) : (
                          <p className="muted">Loading weather…</p>
                        )}
                      </div>
                      <details className="reception-session-details">
                        <summary>Session details</summary>
                        <dl className="reception-summary">
                          <dt>Started</dt>
                          <dd>{new Date(report.startedAt).toLocaleString()}</dd>
                          <dt>Stopped</dt>
                          <dd>
                            {report.stoppedAt === null
                              ? 'Receiving'
                              : new Date(report.stoppedAt).toLocaleString()}
                          </dd>
                          <dt>Location</dt>
                          <dd>{location(report)}</dd>
                        </dl>
                      </details>
                    </div>
                  </>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button
                  variant="primary"
                  onPress={() => {
                    if (
                      update((current) =>
                        current.map((log) => (log.id === reportId ? { ...log, saved: true } : log)),
                      )
                    )
                      setReportId(null);
                  }}
                >
                  Save report
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </section>
  );
}
