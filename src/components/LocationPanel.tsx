import {
  Accordion,
  Button,
  ComboBox,
  Input,
  Label,
  ListBox,
  type ComboBoxValueRenderProps,
} from '@heroui/react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { browserLocation, elevation, searchLocations } from '../data/location';
import { validateObserver } from '../state/view';
import type { Observer } from '../domain/types';
import { Field } from './Controls';
import { AppAlert } from './AppAlert';

const locationKey = (item: Observer) => `${item.lat}:${item.lon}:${item.name}`;
function OpenAsyncSuggestions({
  state,
  items,
  enabled,
}: {
  state: ComboBoxValueRenderProps<Observer>['state'];
  items: Observer[];
  enabled: boolean;
}) {
  const open = useEffectEvent(() => {
    if (state.isFocused) state.open(null, 'input');
  });
  // Mobile focus can scroll the sidebar and dismiss an empty popover. Results are a
  // new reason to open it, but later Escape/blur must not reopen the same results.
  useEffect(() => {
    if (enabled && items.length) open();
  }, [items, enabled]);
  return null;
}
export function LocationPanel({
  observer,
  onChange,
}: {
  observer: Observer | null;
  onChange: (observer: Observer | null) => void;
}) {
  const [query, setQuery] = useState(observer?.name ?? '');
  const [lat, setLat] = useState(observer ? String(observer.lat) : '');
  const [lon, setLon] = useState(observer ? String(observer.lon) : '');
  const [alt, setAlt] = useState(observer ? String(observer.alt) : '');
  const [suggestions, setSuggestions] = useState<Observer[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Observer | null>(observer);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const altitudeRequest = useRef<AbortController | null>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const geoRequest = useRef(0);
  const lastApplied = useRef(observer);
  const inputText = useRef(observer?.name ?? '');

  const cancelPending = () => {
    altitudeRequest.current?.abort();
    searchRequest.current?.abort();
    geoRequest.current++;
    setBusy(false);
  };
  const commit = (item: Observer | null) => {
    lastApplied.current = item;
    inputText.current = item?.name ?? '';
    setLat(item ? String(item.lat) : '');
    setLon(item ? String(item.lon) : '');
    setAlt(item ? String(item.alt) : '');
    setQuery(item?.name ?? '');
    setSelectedLocation(item);
    onChange(item);
  };
  useEffect(() => {
    // Local commits already update the fields. An external restore also cancels stale work.
    if (observer === lastApplied.current) return;
    altitudeRequest.current?.abort();
    searchRequest.current?.abort();
    geoRequest.current++;
    setBusy(false);
    setSearchEnabled(false);
    setSuggestions([]);
    setSelectedLocation(observer);
    setLat(observer ? String(observer.lat) : '');
    setLon(observer ? String(observer.lon) : '');
    setAlt(observer ? String(observer.alt) : '');
    setQuery(observer?.name ?? '');
    lastApplied.current = observer;
    inputText.current = observer?.name ?? '';
  }, [observer]);
  useEffect(
    () => () => {
      altitudeRequest.current?.abort();
      searchRequest.current?.abort();
      geoRequest.current++;
    },
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    searchRequest.current = controller;
    if (!searchEnabled || query.trim().length < 2) {
      setSuggestions([]);
      return () => controller.abort();
    }
    const timer = setTimeout(
      () =>
        searchLocations(query, controller.signal)
          .then((items) => {
            if (!controller.signal.aborted) {
              setSuggestions(items);
              setError(
                items.length ? '' : 'No matching locations. You can enter coordinates below.',
              );
            }
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              setSuggestions([]);
              setError('Location search unavailable. Enter coordinates below.');
            }
          }),
      400,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchEnabled]);

  const choose = async (item: Observer, fetchElevation = true) => {
    cancelPending();
    setError('');
    setSearchEnabled(false);
    setSuggestions([]);
    commit(item);
    if (!fetchElevation) return;
    const controller = new AbortController();
    altitudeRequest.current = controller;
    try {
      const meters = await elevation(item.lat, item.lon, controller.signal);
      if (!controller.signal.aborted) commit({ ...item, alt: Math.round(meters) });
    } catch {
      if (!controller.signal.aborted) setError('Elevation unavailable; adjust altitude manually.');
    }
  };
  const apply = () => {
    cancelPending();
    const item =
      lat.trim() && lon.trim()
        ? validateObserver({ lat: Number(lat), lon: Number(lon), alt: Number(alt), name: query })
        : null;
    if (!item) {
      setError('Enter latitude −90 to 90 and longitude −180 to 180.');
      return;
    }
    if (
      alt.trim() &&
      (!Number.isFinite(Number(alt)) || Number(alt) < -500 || Number(alt) > 100000)
    ) {
      setError('Enter altitude between −500 and 100,000 metres.');
      return;
    }
    void choose(item, !alt.trim());
  };
  const locate = async () => {
    cancelPending();
    const id = geoRequest.current;
    setBusy(true);
    setError('');
    try {
      const point = await browserLocation();
      if (id === geoRequest.current) {
        // Geolocation may provide the device's actual altitude; keep it when present.
        await choose(point, point.alt === 0);
      }
    } catch {
      if (id === geoRequest.current)
        setError('Location permission unavailable. Search for a place or enter coordinates.');
    } finally {
      if (id === geoRequest.current) setBusy(false);
    }
  };
  const items =
    selectedLocation &&
    !suggestions.some((item) => locationKey(item) === locationKey(selectedLocation))
      ? [selectedLocation, ...suggestions]
      : suggestions;
  return (
    <aside className="sidebar sidebar-location">
      <Accordion className="location-details" hideSeparator defaultExpandedKeys={[]}>
        <Accordion.Item id="observer-location">
          <Accordion.Heading>
            <Accordion.Trigger className="location-trigger" aria-label="Observer location">
              <span className="location-summary-pin" />
              <span>
                {observer
                  ? observer.name || `${observer.lat.toFixed(3)}, ${observer.lon.toFixed(3)}`
                  : 'Set observer location'}
                {observer && <small>{observer.alt} m above sea level</small>}
              </span>
              <span className="location-action">Change</span>
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body className="location-content">
              <ComboBox
                className="field"
                inputValue={query}
                items={items}
                selectedKey={selectedLocation ? locationKey(selectedLocation) : null}
                allowsCustomValue
                allowsEmptyCollection
                onInputChange={(text) => {
                  if (text === inputText.current) return;
                  inputText.current = text;
                  cancelPending();
                  setQuery(text);
                  setSelectedLocation(null);
                  setSuggestions([]);
                  setError('');
                  setSearchEnabled(true);
                }}
                onSelectionChange={(id) => {
                  const item = items.find((item) => locationKey(item) === id);
                  if (item) void choose(item);
                }}
              >
                <ComboBox.Value<Observer> hidden>
                  {({ state }) => (
                    <OpenAsyncSuggestions
                      state={state}
                      items={suggestions}
                      enabled={searchEnabled}
                    />
                  )}
                </ComboBox.Value>
                <Label>Location</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="Type a city or country" />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox<Observer>>
                    {(item) => (
                      <ListBox.Item id={locationKey(item)} textValue={item.name}>
                        {item.name}
                      </ListBox.Item>
                    )}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
              <div className="coordinate-fields">
                <Field
                  label="Latitude"
                  value={lat}
                  type="number"
                  min={-90}
                  max={90}
                  onChange={(text) => {
                    cancelPending();
                    setLat(text);
                  }}
                />
                <Field
                  label="Longitude"
                  value={lon}
                  type="number"
                  min={-180}
                  max={180}
                  onChange={(text) => {
                    cancelPending();
                    setLon(text);
                  }}
                />
              </div>
              <Field
                label="Altitude (m)"
                value={alt}
                type="number"
                min={-500}
                max={100000}
                onChange={(text) => {
                  cancelPending();
                  setAlt(text);
                }}
              />
              <p className="muted field-helper">
                Adjust altitude if your actual position is above ground level.
              </p>
              {error && <AppAlert status="warning">{error}</AppAlert>}
              <Button onPress={apply} fullWidth>
                Apply location
              </Button>
              <div className="button-row">
                <Button variant="secondary" onPress={() => void locate()} isDisabled={busy}>
                  {busy ? 'Locating…' : 'Use my location'}
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => {
                    cancelPending();
                    setError('');
                    setSearchEnabled(false);
                    setSuggestions([]);
                    commit(null);
                  }}
                >
                  Reset
                </Button>
              </div>
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </aside>
  );
}
