import { Accordion, Button, Card, Chip, CloseButton, Separator, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';
import { loadSatelliteInfo, type SatelliteInfo as Info } from '../data/radio';
import { orbitalParams } from '../domain/orbits';
import type { Frequency, Satellite } from '../domain/types';
import { satelliteAliases } from '../domain/satelliteNames';
import { AppAlert } from './AppAlert';
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
  onShare,
}: {
  sat: Satellite;
  tracked: boolean;
  onTrack: () => void;
  onClose: () => void;
  onShare: () => Promise<void>;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [shareStatus, setShareStatus] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setInfo(null);
    setShareStatus('');
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
        <Card.Header className="sat-info-head">
          <h2>{sat.name}</h2>
          <div className="sat-info-actions">
            <Tooltip>
              <Button
                size="sm"
                variant="ghost"
                isIconOnly
                aria-label="Copy share link"
                onPress={() => {
                  void onShare()
                    .then(() => setShareStatus('Link copied'))
                    .catch(() =>
                      setShareStatus('Could not copy link. Check clipboard permission.'),
                    );
                }}
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
                    d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"
                    transform="translate(1 1)"
                  />
                </svg>
              </Button>
              <Tooltip.Content>Copy share link</Tooltip.Content>
            </Tooltip>
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
                  <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </Button>
              <Tooltip.Content>
                {tracked ? 'Remove from Tracked' : 'Add to Tracked'}
              </Tooltip.Content>
            </Tooltip>
          </div>
        </Card.Header>
        <Card.Content className="sat-info-content">
          {satelliteAliases(sat).length > 0 && (
            <p className="satellite-aliases">Also known as: {satelliteAliases(sat).join(' · ')}</p>
          )}
          {shareStatus && (
            <AppAlert status={shareStatus === 'Link copied' ? 'success' : 'warning'}>
              {shareStatus}
            </AppAlert>
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
          <Separator className="detail-separator" />
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
        </Card.Content>
      </Card>
    </>
  );
}
