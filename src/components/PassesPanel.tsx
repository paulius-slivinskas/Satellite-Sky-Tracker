import { Input, Switch, TextField } from '@heroui/react';
import { useEffect, useState, type ReactNode } from 'react';
import type { SatellitePass, Satellite, ViewState } from '../domain/types';
import { Choice, Toggle } from './Controls';
import { SatelliteSelection } from './SatelliteSelection';
import { AppAlert } from './AppAlert';
export function PassesPanel({
  state,
  satellites,
  passes,
  loading,
  error,
  readTime,
  patch,
  notificationControls,
}: {
  state: ViewState;
  satellites: Satellite[];
  passes: SatellitePass[];
  loading: boolean;
  error: string | null;
  readTime: () => number;
  patch: (value: Partial<ViewState>) => void;
  notificationControls?: ReactNode;
}) {
  const [elevationInput, setElevationInput] = useState(String(state.passMinElevationDegrees));
  useEffect(
    () => setElevationInput(String(state.passMinElevationDegrees)),
    [state.passMinElevationDegrees],
  );
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
    </div>
  );
}
