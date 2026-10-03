import { Accordion, Button, Card, Chip, CloseButton, Tabs, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';
import { loadSatelliteInfo, type SatelliteInfo as Info } from '../data/radio';
import { orbitalParams } from '../domain/orbits';
import type { Frequency, Observer, Satellite } from '../domain/types';
import { satelliteAliases } from '../domain/satelliteNames';
import { SheetHandle } from './SheetHandle';
import { AppAlert } from './AppAlert';
import { ReceptionPanel } from './ReceptionPanel';
import { SatelliteFinder } from './SatelliteFinder';
const fmt = (value: number, digits: number, unit: string) =>
  Number.isFinite(value) ? `${value.toFixed(digits)} ${unit}` : 'N/A';
function frequency(range?: Frequency) {
  if (!range || range.low === null || !Number.isFinite(range.low) || range.low <= 0) return 'N/A';
  const low = (range.low / 1e6).toFixed(3);
  return range.high !== null && range.high !== range.low
    ? `${low}–${(range.high / 1e6).toFixed(3)} MHz`
    : `${low} MHz`;
}
export function SatelliteInfo({
  sat,
  tracked,
  onTrack,
  onClose,
  expanded,
  onExpandedChange,
  observer = null,
}: {
  sat: Satellite;
  observer?: Observer | null;
  tracked: boolean;
  onTrack: () => void;
  onClose: () => void;
  expanded: boolean;
  onExpandedChange: (value: boolean) => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setInfo(null);
    loadSatelliteInfo(sat.noradId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setInfo(value);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setInfo({
            satcat: null,
            radio: null,
            warning: 'Satellite details unavailable. Try again.',
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sat.noradId, retry]);
  const params = orbitalParams(sat),
    cat = info?.satcat ?? {};
  const code = sat.line1.slice(9, 17).trim();
  const intl = code
    ? `${Number(code.slice(0, 2)) >= 57 ? '19' : '20'}${code.slice(0, 2)}-${code.slice(2)}`
    : 'N/A';
  const statuses: Record<string, string> = {
    '+': 'Operational',
    '-': 'Non-operational',
    P: 'Partially operational',
    B: 'Backup',
    S: 'Spare',
    X: 'Extended mission',
    D: 'Decayed',
    '?': 'Unknown',
  };
  const rows = [
    ['NORAD ID', sat.noradId],
    ['Int’l Code', String(cat.OBJECT_ID || intl)],
    ['Perigee', fmt(params.perigeeKm, 1, 'km')],
    ['Apogee', fmt(params.apogeeKm, 1, 'km')],
    ['Inclination', fmt(params.inclDeg, 3, '°')],
    ['Period', fmt(params.periodMin, 2, 'minutes')],
    ['Semi major axis', fmt(params.semiMajorKm, 2, 'km')],
    ['RCS', String(cat.RCSVALUE || cat.RCS_SIZE || 'N/A')],
    ['Launch date', String(cat.LAUNCH || 'N/A')],
    ['Source', String(cat.OWNER || 'CelesTrak / SatNOGS')],
    ['Launch site', String(cat.SITE || 'N/A')],
    ['Status', statuses[String(cat.OPSTAT)] || 'Unknown'],
  ];
  return (
    <>
      <Tooltip>
        <CloseButton
          className="sat-info-close"
          aria-label="Close satellite details"
          onPress={onClose}
        />
        <Tooltip.Content placement="left">Close satellite details</Tooltip.Content>
      </Tooltip>
      <Card
        className="sat-info-panel"
        role="complementary"
        aria-label={`${sat.name} satellite details`}
      >
        <SheetHandle expanded={expanded} onChange={onExpandedChange} />
        <Card.Header className="sat-info-head">
          <h2>{sat.name}</h2>
          <div className="sat-info-actions">
            <Tooltip>
              <Button
                size="sm"
                variant={tracked ? 'primary' : 'ghost'}
                isIconOnly
                aria-label={tracked ? 'Remove from Tracked' : 'Add to Tracked'}
                aria-pressed={tracked}
                onPress={onTrack}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <path
                    d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2-4.5-4.4 6.3-.9Z"
                    fill={tracked ? 'currentColor' : 'none'}
                  />
                </svg>
              </Button>
              <Tooltip.Content>
                {tracked ? 'Remove from Tracked' : 'Add to Tracked'}
              </Tooltip.Content>
            </Tooltip>
          </div>
        </Card.Header>
        <Card.Content className="sat-info-content">
          <Tabs className="sat-info-tabs" defaultSelectedKey="details">
            <Tabs.ListContainer>
              <Tabs.List aria-label="Satellite information sections">
                <Tabs.Tab id="details">
                  Sat details
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="radio">
                  Amateur radio
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="report">
                  Signal report
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
            <Tabs.Panel id="details">
              <SatelliteFinder satellite={sat} observer={observer} />
              {satelliteAliases(sat).length > 0 && (
                <p className="satellite-aliases">
                  Also known as: {satelliteAliases(sat).join(' · ')}
                </p>
              )}

              <dl className="sat-kv-grid">
                {rows.map(([label, value]) => (
                  <div className="sat-kv" key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {label === 'Status' ? (
                        <Chip
                          size="sm"
                          variant="soft"
                          color={cat.OPSTAT === '+' ? 'success' : 'default'}
                        >
                          {value}
                        </Chip>
                      ) : (
                        value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </Tabs.Panel>
            <Tabs.Panel id="radio">
              <h3>Amateur Radio</h3>
              {loading && <AppAlert loading>Loading radio information…</AppAlert>}
              {info?.warning && (
                <AppAlert
                  status="warning"
                  action={
                    <Button size="sm" variant="ghost" onPress={() => setRetry((n) => n + 1)}>
                      Retry
                    </Button>
                  }
                >
                  {info.warning}
                </AppAlert>
              )}
              {!loading && !info?.radio?.transmitters.length && (
                <p className="muted">No radio transmitter data available.</p>
              )}
              <Accordion
                className="tx-list"
                allowsMultipleExpanded
                hideSeparator
                defaultExpandedKeys={[]}
              >
                {info?.radio?.transmitters.map((tx, index) => (
                  <Card className="tx-card" variant="secondary" key={`${tx.id}-${index}`}>
                    <Accordion.Item id={`${tx.id}-${index}`}>
                      <Accordion.Heading>
                        <Accordion.Trigger className="tx-trigger">
                          <span className="tx-header">
                            <span className="tx-title">{tx.label || 'Transmitter'}</span>
                            <span className="tx-source">{tx.source || 'Unknown source'}</span>
                          </span>
                          <Accordion.Indicator />
                        </Accordion.Trigger>
                      </Accordion.Heading>
                      <Accordion.Panel>
                        <Accordion.Body className="tx-body">
                          <dl className="tx-details">
                            {[
                              ['Type', tx.typeHint],
                              ['Uplink', frequency(tx.uplink)],
                              ['Downlink', frequency(tx.downlink)],
                              ['Beacon', frequency(tx.beacon)],
                              ['Callsign', tx.callsign || 'N/A'],
                              ['Mode', tx.mode],
                              ['Status', tx.status],
                              ['Notes', tx.notes || 'N/A'],
                            ].map(([key, value]) => (
                              <div className="tx-row" key={key}>
                                <dt>{key}</dt>
                                <dd>{value}</dd>
                              </div>
                            ))}
                          </dl>
                        </Accordion.Body>
                      </Accordion.Panel>
                    </Accordion.Item>
                  </Card>
                ))}
              </Accordion>
              {info?.radio?.status.provider === 'amsat' && (
                <p className="muted">AMSAT reports: {info.radio.status.recentReportsCount}</p>
              )}
              {info?.radio?.status.lastReport && (
                <p className="muted">{info.radio.status.lastReport.replace(/<[^>]*>/g, ' ')}</p>
              )}
            </Tabs.Panel>
            <Tabs.Panel id="report">
              <ReceptionPanel sat={sat} observer={observer} />
            </Tabs.Panel>
          </Tabs>
        </Card.Content>
      </Card>
    </>
  );
}
