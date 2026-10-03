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
    <SatelliteSelection
      browseOnly
      triggerLabel={label}
      satellites={satellites}
      value={value ? [value] : []}
      tracked={tracked}
      onApply={(ids) => onSelect(ids[0] ?? null)}
    />
  );
}
