import type { Satellite } from '../domain/types';
import { SatelliteSelection } from './SatelliteSelection';

export function SatelliteSearch({
  satellites,
  value,
  label,
  tracked,
  onSelect,
}: {
  satellites: Satellite[];
  value: string | null;
  label: string;
  tracked: string[];
  onSelect: (norad: string | null) => void;
}) {
  return (
    <div className="satellite-search-field">
      <span className="satellite-search-field-label">{label}</span>
      <SatelliteSelection
        browseOnly
        triggerLabel={label}
        satellites={satellites}
        value={value ? [value] : []}
        tracked={tracked}
        onApply={(ids) => onSelect(ids[0] ?? null)}
      />
    </div>
  );
}
