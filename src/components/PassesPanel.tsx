import { Button, Card, Chip, Input, Switch, TextField } from '@heroui/react';
import { useEffect, useState, type ReactNode } from 'react';
import type { SatellitePass, Satellite, ViewState } from '../domain/types';
import { cardinal, lookAngles } from '../domain/orbits';
import { Choice, Toggle } from './Controls';
import { SatelliteSelection } from './SatelliteSelection';
import { AppAlert } from './AppAlert';
export function PassesPanel({
  state,
  satellites,
  passes,
  loading,
  error,
  time,
  readTime,
  active,
  patch,
  select,
  hover,
  choosePass,
  findInSky,
  notificationControls,
}: {
  state: ViewState;
  satellites: Satellite[];
  passes: SatellitePass[];
  loading: boolean;
  error: string | null;
  time: number;
  readTime: () => number;
  active: number | null;
  patch: (value: Partial<ViewState>) => void;
  select: (norad: string | null) => void;
  hover: (index: number | null) => void;
  choosePass: (index: number) => void;
  findInSky: (satellite: Satellite, pass: SatellitePass) => void;
  notificationControls?: ReactNode;
}) {
  const [expandedPasses, setExpandedPasses] = useState<Set<string>>(() => new Set());
  const [elevationInput, setElevationInput] = useState(String(state.passMinElevationDegrees));
  useEffect(
    () => setElevationInput(String(state.passMinElevationDegrees)),
    [state.passMinElevationDegrees],
  );
  const fmt = (value: number) =>
    new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: state.timeFormat === '12h',
    });
  const direction = (az: number | null) =>
    az === null ? 'N/A' : `${cardinal(az)} (${az.toFixed(1)}°)`;
  return (
    <div className="panel-content">
      <h2>Passes Over</h2>
      <Toggle
        label="Show Passes on Map"
        selected={state.showPassesOnMap}
        onChange={(value) => patch({ showPassesOnMap: value })}
      />
      <div className="pass-elevation-filter">
        {state.passMinElevationEnabled ? (
          <TextField
            className="pass-elevation-input"
            aria-label="Minimum elevation (degrees)"
            type="number"
            value={elevationInput}
            onChange={(value) => {
              setElevationInput(value);
              const degrees = Number(value);
              if (value.trim() && Number.isFinite(degrees) && degrees >= 0 && degrees <= 90)
                patch({ passMinElevationDegrees: degrees });
            }}
          >
            <Input
              min={0}
              max={90}
              step={1}
              onBlur={() => setElevationInput(String(state.passMinElevationDegrees))}
            />
            <span aria-hidden="true">°</span>
          </TextField>
        ) : (
          <span className="pass-elevation-label">Minimum elevation</span>
        )}
        <Switch
          size="sm"
          aria-label="Minimum elevation"
          isSelected={state.passMinElevationEnabled}
          onChange={(enabled) => patch({ passMinElevationEnabled: enabled })}
        >
          <Switch.Content aria-label="Minimum elevation">
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </div>
      <Choice
        label="Pass Range"
        value={state.passRange}
        options={[
          ['3h', 'Next 3 hours'],
          ['5h', 'Next 5 hours'],
          ['12h', 'Next 12 hours'],
          ['1', 'Next 24 hours'],
          ['2', 'Next 48 hours'],
          ['3', 'Next 72 hours'],
          ['upcoming3', '3 upcoming passes'],
          ['upcoming5', '5 upcoming passes'],
        ]}
        onChange={(value) =>
          patch({ passRange: value as ViewState['passRange'], simulatedTimeMs: readTime() })
        }
      />
      <SatelliteSelection
        satellites={satellites}
        value={state.passWatchlist}
        tracked={state.tracked}
        onApply={(passWatchlist) => patch({ passWatchlist, simulatedTimeMs: readTime() })}
      />
      {notificationControls}
      {state.passRange.startsWith('upcoming') && (
        <p className="muted pass-range-note">
          The next {state.passRange.slice(-1)} {state.passMinElevationEnabled ? 'qualifying ' : ''}
          passes across your watchlist, within 72 hours.
        </p>
      )}
      {state.passWatchlist.some((id) => !satellites.some((sat) => sat.noradId === id)) && (
        <AppAlert status="warning">
          Some watchlist satellites have no orbital data. Their passes cannot be calculated yet.
        </AppAlert>
      )}
      {!state.passWatchlist.length && (
        <p className="muted">
          Add satellites to your watchlist to see their upcoming passes together.
        </p>
      )}
      {!state.observer && <p className="muted">Set your observer location to calculate passes.</p>}
      {loading && <AppAlert loading>Calculating watchlist passes…</AppAlert>}
      {error && <AppAlert status="danger">{error}</AppAlert>}
      {!loading && !passes.length && state.observer && state.passWatchlist.length > 0 && (
        <p className="muted">
          {state.passMinElevationEnabled
            ? `No passes reach ${state.passMinElevationDegrees}° in the selected range.`
            : 'No passes found in the selected range.'}
        </p>
      )}
      {!loading && passes.length > 0 && (
        <p className="muted pass-summary" role="status">
          {passes.length} {passes.length === 1 ? 'pass' : 'passes'} ·{' '}
          {new Set(passes.map((pass) => pass.noradId)).size}{' '}
          {new Set(passes.map((pass) => pass.noradId)).size === 1 ? 'satellite' : 'satellites'}
          <span>Sorted by start time</span>
          {state.showPassesOnMap && passes.length > 5 && (
            <span>Focus a pass to reveal its times on the map.</span>
          )}
        </p>
      )}
      <ul className="passes-list">
        {passes.map((pass, i) => {
          const passKey = `${pass.noradId}-${pass.start}`;
          const expanded = expandedPasses.has(passKey);
          const detailsId = `pass-details-${passKey}`;
          const inView = time >= pass.losStart && time <= pass.losEnd;
          const satellite = satellites.find((sat) => sat.noradId === pass.noradId);
          const current =
            satellite && state.observer ? lookAngles(satellite, time, state.observer) : null;
          return (
            <li key={`${pass.noradId}-${pass.start}`}>
              <Card
                className={`pass-item ${active === i ? 'pass-item-hover' : ''} ${inView ? 'pass-item-active' : ''}`}
                data-norad={pass.noradId}
                data-pass-start={pass.start}
                data-pass-end={pass.end}
                tabIndex={0}
                role="button"
                aria-label={`Show pass ${i + 1} on map`}
                aria-pressed={active === i}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('button, details')) return;
                  choosePass(i);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    choosePass(i);
                  }
                }}
                onMouseEnter={() => hover(i)}
                onMouseLeave={() => hover(null)}
                onFocus={() => hover(i)}
                onBlur={() => hover(null)}
              >
                <Card.Header className="pass-header">
                  <div className="pass-heading">
                    <Card.Title className="pass-title">
                      <span className="category-dot" style={{ background: pass.color }} />
                      {pass.satelliteName}
                    </Card.Title>
                  </div>
                  <div className="pass-header-meta">
                    {inView && (
                      <Chip className="pass-live-chip" color="success" variant="soft" size="sm">
                        <Chip.Label>In view</Chip.Label>
                      </Chip>
                    )}
                  </div>
                </Card.Header>
                <Card.Content className="pass-content">
                  <dl className="pass-details pass-summary-grid">
                    {[
                      ['Pass Start', pass.startClipped ? 'Already above horizon' : fmt(pass.start)],
                      ['Pass End', pass.endClipped ? 'Horizon crossing not found' : fmt(pass.end)],
                      [
                        pass.startClipped || pass.endClipped ? 'Peak found' : 'Max Elevation',
                        `${pass.maxElevation.toFixed(1)}°`,
                      ],
                    ].map(([key, value]) => (
                      <div className="pass-row" key={key}>
                        <dt>{key}</dt>
                        <dd
                          className={
                            key === 'Max Elevation' || key === 'Peak found'
                              ? 'pass-peak'
                              : undefined
                          }
                        >
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="pass-extra-details" id={detailsId} hidden={!expanded}>
                    <dl className="pass-details pass-summary-grid">
                      {[
                        ['Rise Direction', direction(pass.riseAz)],
                        ['Max Elevation Az', direction(pass.maxAz)],
                        ['Set Direction', direction(pass.setAz)],
                      ].map(([key, value]) => (
                        <div className="pass-row" key={key}>
                          <dt>{key}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="muted pass-current-label">Position at map time · {fmt(time)}</p>
                    <dl className="pass-details pass-summary-grid" aria-live="off">
                      <div className="pass-row">
                        <dt>Current Azimuth</dt>
                        <dd>{current ? direction(current.azimuth) : 'N/A'}</dd>
                      </div>
                      <div className="pass-row">
                        <dt>Current Elevation</dt>
                        <dd>{current ? `${current.elevation.toFixed(1)}°` : 'N/A'}</dd>
                      </div>
                      {satellite && (
                        <div className="pass-row pass-navigation">
                          <dt className="sr-only">Sky finder</dt>
                          <dd>
                            <Button
                              size="sm"
                              variant="secondary"
                              onPress={() => findInSky(satellite, pass)}
                            >
                              Navigate
                            </Button>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                  {(pass.startClipped || pass.endClipped) && (
                    <p className="muted">
                      Full pass boundaries could not be determined; the peak shown is the highest
                      found.
                    </p>
                  )}
                </Card.Content>
                <Card.Footer className="pass-actions">
                  <Button
                    size="md"
                    variant="ghost"
                    className="pass-more"
                    aria-expanded={expanded}
                    aria-controls={detailsId}
                    onPress={() =>
                      setExpandedPasses((current) => {
                        const next = new Set(current);
                        if (next.has(passKey)) next.delete(passKey);
                        else next.add(passKey);
                        return next;
                      })
                    }
                  >
                    More
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </Button>
                  <Button size="md" variant="ghost" onPress={() => select(pass.noradId)}>
                    Sat details
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </Button>
                </Card.Footer>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
