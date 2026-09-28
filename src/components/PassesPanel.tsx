import { Button, Card, Chip } from '@heroui/react';
import type { ReactNode } from 'react';
import type { SatellitePass, Satellite, ViewState } from '../domain/types';
import { cardinal } from '../domain/orbits';
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
  notificationControls?: ReactNode;
}) {
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
          The next {state.passRange.slice(-1)} passes across your watchlist, within 72 hours.
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
        <p className="muted">No passes found in the selected range.</p>
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
          const inView = time >= pass.losStart && time <= pass.losEnd;
          return (
            <li key={`${pass.noradId}-${pass.start}`}>
              <Card
                className={`pass-item ${active === i ? 'pass-item-hover' : ''} ${inView ? 'pass-item-active' : ''}`}
                data-norad={pass.noradId}
                data-pass-start={pass.start}
                data-pass-end={pass.end}
                tabIndex={0}
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
                    <Card.Description className="pass-date">
                      <span className="pass-sequence">Pass {i + 1}</span> ·
                      <time dateTime={new Date(pass.start).toISOString()}>
                        {new Date(pass.start).toLocaleDateString()}
                      </time>
                    </Card.Description>
                  </div>
                  {inView && (
                    <Chip className="pass-live-chip" color="success" variant="soft" size="sm">
                      <Chip.Label>In view</Chip.Label>
                    </Chip>
                  )}
                </Card.Header>
                <Card.Content className="pass-content">
                  <dl className="pass-details">
                    {[
                      ['Pass Start', pass.startClipped ? 'Already above horizon' : fmt(pass.start)],
                      ['Pass End', pass.endClipped ? 'Horizon crossing not found' : fmt(pass.end)],
                      [
                        pass.startClipped || pass.endClipped ? 'Peak found' : 'Max Elevation',
                        `${pass.maxElevation.toFixed(1)}°`,
                      ],
                      ['Rise Direction', direction(pass.riseAz)],
                      ['Set Direction', direction(pass.setAz)],
                      ['Max Elevation Az', direction(pass.maxAz)],
                      ...(Math.abs(pass.losStart - pass.start) > 1500 ||
                      Math.abs(pass.losEnd - pass.end) > 1500
                        ? [
                            ['LOS Appears', fmt(pass.losStart)],
                            ['LOS Disappears', fmt(pass.losEnd)],
                          ]
                        : []),
                    ].map(([key, value]) => (
                      <div className="pass-row" key={key}>
                        <dt>{key}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {(pass.startClipped || pass.endClipped) && (
                    <p className="muted">
                      Full pass boundaries could not be determined; the peak shown is the highest
                      found.
                    </p>
                  )}
                </Card.Content>
                <Card.Footer>
                  <Button size="sm" variant="ghost" onPress={() => select(pass.noradId)}>
                    Satellite details
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
