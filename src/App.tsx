import { Button, Card, CloseButton, Separator, Tabs } from '@heroui/react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { FILTER_CONFIG, isAmateurSelectedName } from './domain/config';
import { positionAt } from './domain/orbits';
import type { Observer, Position, Satellite, SatellitePass, ViewState } from './domain/types';
import { initialView, saveView, shareUrl, viewReducer } from './state/view';
import { useCatalog, usePasses, useSimulation } from './state/hooks';
import { TrackerMap } from './map/TrackerMap';
import { Choice, Field, Toggle } from './components/Controls';
import { SatelliteSearch } from './components/SatelliteSearch';
import { LocationPanel } from './components/LocationPanel';
import { TimePanel } from './components/TimePanel';
import { PassesPanel } from './components/PassesPanel';
import { SatelliteInfo } from './components/SatelliteInfo';
import { SatelliteFinderDialog } from './components/SatelliteFinder';
import { useTheme } from './state/theme';
import { CatalogNotice } from './components/CatalogNotice';
import { usePassNotifications } from './state/notifications';
import { PassNotificationControls } from './components/PassNotificationControls';
import { AppAlert } from './components/AppAlert';
export default function App() {
  const [theme, setTheme] = useTheme();
  const [state, dispatch] = useReducer(viewReducer, undefined, initialView);
  const catalog = useCatalog();
  const { time, readTime } = useSimulation(state.simulatedTimeMs, state.playing, state.speed);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 1100);
  const [locationOpen, setLocationOpen] = useState(false);
  const [activePass, setActivePass] = useState<number | null>(null);
  const [selectedPassKey, setSelectedPassKey] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [finderTarget, setFinderTarget] = useState<{
    satellite: Satellite;
    pass: SatellitePass;
  } | null>(null);
  const patch = useCallback(
    (value: Partial<ViewState>) => dispatch({ type: 'patch', patch: value }),
    [],
  );
  const select = useCallback((norad: string | null) => {
    setDetailsOpen(true);
    setSelectedPassKey(null);
    dispatch({ type: 'select', norad });
    if (norad && window.innerWidth <= 1100) setCollapsed(true);
  }, []);
  const selected = catalog.satellites.find((s) => s.noradId === state.selectedNorad);
  const passSatellites = useMemo(
    () => catalog.satellites.filter((sat) => state.passWatchlist.includes(sat.noradId)),
    [catalog.satellites, state.passWatchlist],
  );
  const predictions = usePasses(
    passSatellites,
    state.observer,
    state.simulatedTimeMs,
    state.passRange,
    state.passMinElevationEnabled ? state.passMinElevationDegrees : 0,
  );
  const selectedPassIndex = predictions.passes.findIndex(
    (pass) => `${pass.noradId}-${pass.start}` === selectedPassKey,
  );
  const selectedPass = selectedPassIndex >= 0 ? selectedPassIndex : null;
  const choosePass = (index: number) => {
    const pass = predictions.passes[index];
    if (!pass) return;
    setSelectedPassKey(`${pass.noradId}-${pass.start}`);
    setDetailsOpen(true);
    dispatch({ type: 'select', norad: pass.noradId });
    patch({ showPassesOnMap: true });
    if (window.innerWidth <= 1100) setCollapsed(true);
  };
  const notifications = usePassNotifications(passSatellites, state.observer, predictions.passes);
  useEffect(() => {
    const timer = setTimeout(() => saveView(state), 250);
    return () => clearTimeout(timer);
  }, [state]);
  const candidates = useMemo(
    () =>
      catalog.satellites.filter(
        (sat) =>
          state.categories.includes(sat.category) ||
          (state.categories.includes('tracked') && state.tracked.includes(sat.id)) ||
          (state.categories.includes('amateur_selected') &&
            isAmateurSelectedName(sat.name, sat.noradId)) ||
          state.searchNorad === sat.noradId ||
          state.selectedNorad === sat.noradId,
      ),
    [catalog.satellites, state.categories, state.tracked, state.searchNorad, state.selectedNorad],
  );
  const frame = useMemo(() => {
    const positions = new Map<string, Position>();
    const nextPositions = new Map<string, Position>();
    const visible = candidates.filter((sat) => {
      const pos = positionAt(sat, time, state.observer);
      if (
        !pos ||
        (sat.noradId !== state.selectedNorad &&
          state.maxAltitudeEnabled &&
          pos.altKm > state.maxAltitudeKm) ||
        (sat.noradId !== state.selectedNorad &&
          state.losOnlyEnabled &&
          state.observer &&
          (pos.elevation ?? -90) < 0)
      )
        return false;
      positions.set(sat.id, pos);
      nextPositions.set(
        sat.id,
        state.playing ? (positionAt(sat, time + 250 * state.speed, state.observer) ?? pos) : pos,
      );
      return true;
    });
    return { positions, nextPositions, visible };
  }, [
    candidates,
    state.selectedNorad,
    time,
    state.playing,
    state.speed,
    state.observer,
    state.maxAltitudeEnabled,
    state.maxAltitudeKm,
    state.losOnlyEnabled,
  ]);
  const changeObserver = useCallback((observer: Observer | null) => {
    const previous = stateRef.current.observer;
    const moved =
      observer && (!previous || observer.lat !== previous.lat || observer.lon !== previous.lon);
    dispatch({
      type: 'patch',
      patch: {
        observer,
        simulatedTimeMs: readTime(),
        ...(moved ? { map: { lat: observer.lat, lon: observer.lon, zoom: 5 } } : {}),
      },
    });
  }, []);
  const changeMap = useCallback(
    (map: ViewState['map']) => dispatch({ type: 'patch', patch: { map } }),
    [],
  );
  const searchSelect = (norad: string | null) => {
    setDetailsOpen(true);
    setSelectedPassKey(null);
    dispatch({ type: 'select', norad, search: true });
    const sat = catalog.satellites.find((s) => s.noradId === norad);
    const pos = sat ? positionAt(sat, time) : null;
    if (pos) patch({ map: { lat: pos.lat, lon: pos.lon, zoom: Math.max(state.map.zoom, 3) } });
    if (norad && window.innerWidth <= 1100) setCollapsed(true);
  };
  useEffect(() => {
    setActivePass(null);
  }, [predictions.passes]);
  return (
    <div
      className={`app ${collapsed ? 'sidebar-collapsed' : ''} ${selected && detailsOpen ? 'sat-info-open' : ''}`}
    >
      {!collapsed ? (
        <CloseButton
          className="sidebar-toggle sidebar-close"
          aria-label="Close sidebar"
          aria-expanded="true"
          onPress={() => setCollapsed(true)}
        />
      ) : (
        <Button
          className="sidebar-toggle"
          variant="secondary"
          isIconOnly
          aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'}
          aria-expanded={!collapsed}
          onPress={() => {
            if (collapsed && window.innerWidth <= 1100) setDetailsOpen(false);
            setCollapsed((value) => !value);
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </Button>
      )}
      <nav
        className="mobile-bottom-nav"
        aria-label="Mobile tracking navigation"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[role="tab"]')) {
            setDetailsOpen(false);
            setCollapsed(false);
          }
        }}
      >
        <Tabs
          selectedKey={state.tab}
          onSelectionChange={(key) => {
            setDetailsOpen(false);
            patch({
              tab: String(key) as ViewState['tab'],

              ...(key === 'passes' ? { simulatedTimeMs: readTime() } : {}),
            });
            setCollapsed(false);
          }}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="Mobile tracking sections">
              {(['filters', 'time', 'passes', 'settings'] as const).map((tab) => (
                <Tabs.Tab key={tab} id={tab}>
                  {tab[0].toUpperCase() + tab.slice(1)}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </nav>
      <div className="sidebar-stack">
        <div className="mobile-sheet-header">
          {state.tab === 'filters' && (
            <SatelliteSearch
              satellites={catalog.satellites}
              value={state.searchNorad}
              label="Satellite search"
              onSelect={searchSelect}
            />
          )}
        </div>
        <LocationPanel
          observer={state.observer}
          onChange={changeObserver}
          open={locationOpen}
          onOpenChange={setLocationOpen}
        />
        <Card className="sidebar sidebar-main" role="complementary" aria-label="Tracking controls">
          <div className="sidebar-scroll">
            <header className="brand">
              <h1>Satellite Sky Tracker</h1>
              <p className="creator-credit">By LY8KH</p>
              <p className="subtitle">
                Follow live satellites, forecast passes, and simulate future orbits.
              </p>
            </header>
            <Tabs
              selectedKey={state.tab}
              onSelectionChange={(key) =>
                patch({
                  tab: String(key) as ViewState['tab'],
                  ...(key === 'passes' ? { simulatedTimeMs: readTime() } : {}),
                })
              }
              className="tracker-tabs"
            >
              <Tabs.ListContainer>
                <Tabs.List aria-label="Sidebar sections">
                  {(['filters', 'time', 'passes', 'settings'] as const).map((tab) => (
                    <Tabs.Tab key={tab} id={tab}>
                      {tab[0].toUpperCase() + tab.slice(1)}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
              <Tabs.Panel id="filters">
                <div className="panel-content">
                  <div className="desktop-filter-search">
                    <SatelliteSearch
                      satellites={catalog.satellites}
                      value={state.searchNorad}
                      label="Satellite search"
                      onSelect={searchSelect}
                    />
                  </div>
                  <div className="section-heading">
                    <span className="muted">Categories</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() =>
                        patch({
                          categories: state.categories.length
                            ? []
                            : FILTER_CONFIG.map((c) => c.key),
                        })
                      }
                    >
                      {state.categories.length ? 'Clear all' : 'Select all'}
                    </Button>
                  </div>
                  <div className="filters">
                    {FILTER_CONFIG.map((category) => (
                      <Toggle
                        key={category.key}
                        label={category.label}
                        color={category.color}
                        selected={state.categories.includes(category.key)}
                        onChange={() =>
                          dispatch({ type: 'toggleCategory', category: category.key })
                        }
                      />
                    ))}
                  </div>
                  <Separator className="filter-separator" />
                  <div className="filter-options">
                    <Toggle
                      label="Set max altitude"
                      selected={state.maxAltitudeEnabled}
                      onChange={(enabled) => patch({ maxAltitudeEnabled: enabled })}
                    />
                    {state.maxAltitudeEnabled && (
                      <Field
                        label="Maximum altitude (km)"
                        type="number"
                        min={1}
                        max={1000000}
                        value={String(state.maxAltitudeKm)}
                        onChange={(value) => {
                          const n = Number(value);
                          if (Number.isFinite(n) && n >= 1 && n <= 1000000)
                            patch({ maxAltitudeKm: n });
                        }}
                      />
                    )}
                    <Toggle
                      label="Show LOS Footprint"
                      selected={state.allLosEnabled}
                      onChange={(value) => patch({ allLosEnabled: value })}
                    />
                    <Toggle
                      label="Only visible from observer"
                      selected={state.losOnlyEnabled}
                      onChange={(value) => patch({ losOnlyEnabled: value })}
                    />
                    {state.losOnlyEnabled && !state.observer && (
                      <p className="muted">Set an observer location to apply this filter.</p>
                    )}
                  </div>
                  <p className="muted" data-testid="sat-count">
                    {catalog.loading && !catalog.satellites.length
                      ? 'Loading satellites…'
                      : `${frame.visible.length} visible from selected categories`}
                  </p>
                </div>
              </Tabs.Panel>
              <Tabs.Panel id="time">
                <TimePanel state={state} time={time} readTime={readTime} patch={patch} />
              </Tabs.Panel>
              <Tabs.Panel id="passes">
                <PassesPanel
                  state={state}
                  satellites={catalog.satellites}
                  passes={predictions.passes}
                  loading={predictions.loading}
                  error={predictions.error}
                  time={time}
                  readTime={readTime}
                  active={selectedPass ?? activePass}
                  patch={patch}
                  select={select}
                  hover={setActivePass}
                  choosePass={choosePass}
                  findInSky={(satellite, pass) => setFinderTarget({ satellite, pass })}
                  notificationControls={<PassNotificationControls notifications={notifications} />}
                />
              </Tabs.Panel>
              <Tabs.Panel id="settings">
                <div className="panel-content">
                  <h2>Settings</h2>
                  <Choice
                    label="Time format"
                    value={state.timeFormat}
                    options={[
                      ['24h', '24-hour'],
                      ['12h', '12-hour'],
                    ]}
                    onChange={(value) => patch({ timeFormat: value as ViewState['timeFormat'] })}
                  />
                  <Button
                    variant="secondary"
                    onPress={catalog.refresh}
                    isDisabled={catalog.loading}
                  >
                    {catalog.loading ? 'Checking saved data…' : 'Check saved data'}
                  </Button>
                  <p className="muted">
                    CelesTrak updates automatically every 7 days. Checking again reuses saved data
                    until the next update is due. Failed updates keep the last available data.
                  </p>
                  {catalog.refreshedAt && (
                    <p className="muted">
                      Oldest feed update: {new Date(catalog.refreshedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </Tabs.Panel>
            </Tabs>
          </div>
        </Card>
      </div>
      <main className="map-wrap">
        <TrackerMap
          theme={theme}
          onThemeChange={setTheme}
          satellites={frame.visible}
          positions={frame.positions}
          nextPositions={frame.nextPositions}
          playing={state.playing}
          speed={state.speed}
          readTime={readTime}
          selected={selected}
          time={time}
          observer={state.observer}
          allLos={state.allLosEnabled}
          passes={predictions.passes}
          passSatellites={passSatellites}
          showPasses={state.showPassesOnMap}
          activePass={selectedPass ?? activePass}
          timeFormat={state.timeFormat}
          view={state.map}
          onSelect={select}
          onSelectPass={choosePass}
          onViewChange={changeMap}
          onSetObserverLocation={() => {
            setCollapsed(false);
            setLocationOpen(true);
            if (window.innerWidth <= 1100) setDetailsOpen(false);
          }}
          onHoverPass={setActivePass}
        />
        <CatalogNotice catalog={catalog} onRetry={catalog.refresh} timeFormat={state.timeFormat} />
        {selected && detailsOpen && (
          <div className="right-stack">
            <SatelliteInfo
              key={selected.noradId}
              sat={selected}
              observer={state.observer}
              tracked={state.tracked.includes(selected.id)}
              onTrack={() => dispatch({ type: 'toggleTracked', id: selected.id })}
              onClose={() => setDetailsOpen(false)}
              onShare={() => navigator.clipboard.writeText(shareUrl(state, time))}
            />
          </div>
        )}
      </main>
      {finderTarget && (
        <SatelliteFinderDialog
          {...finderTarget}
          observer={state.observer}
          onClose={() => setFinderTarget(null)}
        />
      )}
      <div className="pass-notification-stack" aria-label="Pass notifications">
        {notifications.notices.map((notice) => (
          <AppAlert
            key={notice.id}
            title={notice.title}
            status="success"
            dismissKey={notice.id}
            onDismiss={() => notifications.dismiss(notice.id)}
          >
            {notice.body}
          </AppAlert>
        ))}
      </div>
    </div>
  );
}
