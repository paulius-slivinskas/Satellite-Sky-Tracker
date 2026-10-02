import { ComboBox, Input, Label, ListBox } from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';
import { searchSatellites } from '../domain/search';
import { satelliteAliases, satelliteNames } from '../domain/satelliteNames';
import type { Satellite } from '../domain/types';
export function SatelliteSearch({
  satellites,
  value,
  label,
  onSelect,
}: {
  satellites: Satellite[];
  value: string | null;
  label: string;
  onSelect: (norad: string | null) => void;
}) {
  const selected = satellites.find((s) => s.noradId === value);
  const [query, setQuery] = useState(() =>
    selected ? `${selected.name} (${selected.noradId})` : '',
  );
  useEffect(() => {
    setQuery(selected ? `${selected.name} (${selected.noradId})` : '');
  }, [selected?.name, selected?.noradId, value]);
  const results = useMemo(() => {
    const found = searchSatellites(satellites, query);
    return selected && !found.some((s) => s.id === selected.id) ? [selected, ...found] : found;
  }, [satellites, query, selected]);
  return (
    <ComboBox
      className="field"
      items={results}
      defaultFilter={() => true}
      selectedKey={value}
      inputValue={query}
      allowsCustomValue
      menuTrigger="focus"
      onInputChange={(text) => {
        if (text === query) return;
        setQuery(text);
        if (!text) onSelect(null);
      }}
      onSelectionChange={(key) => {
        if (key === null) return;
        const item = satellites.find((satellite) => satellite.noradId === String(key));
        if (item) {
          setQuery(`${item.name} (${item.noradId})`);
          onSelect(item.noradId);
        }
      }}
    >
      <Label className="sr-only">{label}</Label>
      <ComboBox.InputGroup>
        <Input placeholder="Search sat name or NORADID" />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox<Satellite>>
          {(sat) => (
            <ListBox.Item
              id={sat.noradId}
              textValue={`${satelliteNames(sat).join(' / ')} (${sat.noradId})`}
            >
              <span className="satellite-search-names">
                <span>{sat.name}</span>
                {satelliteAliases(sat).length > 0 && (
                  <span className="satellite-aliases">
                    Also known as: {satelliteAliases(sat).join(' · ')}
                  </span>
                )}
              </span>
              <span className="result-meta">#{sat.noradId}</span>
            </ListBox.Item>
          )}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}
