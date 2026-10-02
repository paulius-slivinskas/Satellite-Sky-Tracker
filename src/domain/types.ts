import type { SatRec } from 'satellite.js';
export interface Category {
  key: string;
  label: string;
  color: string;
  group: string;
  url: string;
  include?: (name: string) => boolean;
  maxItems?: number;
}
export interface TleRecord {
  name: string;
  line1: string;
  line2: string;
}
export interface Satellite extends TleRecord {
  id: string;
  noradId: string;
  category: string;
  color: string;
  satrec: SatRec;
}
export interface Observer {
  lat: number;
  lon: number;
  alt: number;
  name: string;
}
export interface Position {
  lat: number;
  lon: number;
  altKm: number;
  elevation: number | null;
}
export interface Pass {
  /** A horizon crossing was not found within the bounded edge search. */
  startClipped?: boolean;
  endClipped?: boolean;
  start: number;
  end: number;
  maxAt: number;
  maxElevation: number;
  losStart: number;
  losEnd: number;
  riseAz: number | null;
  setAz: number | null;
  maxAz: number | null;
}
export interface SatellitePass extends Pass {
  noradId: string;
  satelliteName: string;
  color: string;
}
export type PassRange = '3h' | '5h' | '12h' | '1' | '2' | '3' | 'upcoming3' | 'upcoming5';
export type Tab = 'filters' | 'time' | 'passes' | 'settings';
export interface ViewState {
  version: 2;
  tab: Tab;
  categories: string[];
  tracked: string[];
  observer: Observer | null;
  selectedNorad: string | null;
  searchNorad: string | null;
  passNorad: string | null;
  passWatchlist: string[];
  allLosEnabled: boolean;
  losOnlyEnabled: boolean;
  showPassesOnMap: boolean;
  passMinElevationEnabled: boolean;
  passMinElevationDegrees: number;
  maxAltitudeEnabled: boolean;
  maxAltitudeKm: number;
  timeFormat: '12h' | '24h';
  speed: number;
  playing: boolean;
  simulatedTimeMs: number;
  passRange: PassRange;
  map: { lat: number; lon: number; zoom: number };
}
export interface Frequency {
  low: number | null;
  high: number | null;
  unit: string;
}
export interface Transmitter {
  id: string | number | null;
  source?: string;
  label: string;
  typeHint: string;
  uplink: Frequency;
  downlink: Frequency;
  beacon: Frequency;
  mode: string;
  callsign: string | null;
  status: string;
  notes?: string | null;
}
export interface Radio {
  norad: number;
  satName: string;
  transmitters: Transmitter[];
  source: Record<string, boolean>;
  status: { provider: string; lastReport: string | null; recentReportsCount: number };
  fetchedAt: string;
}
