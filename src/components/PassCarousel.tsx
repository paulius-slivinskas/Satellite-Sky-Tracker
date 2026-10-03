import { Button, Card, Chip } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import type { SatellitePass, Satellite, ViewState } from '../domain/types';
import { cardinal, lookAngles } from '../domain/orbits';

export function PassCarousel({
  state,
  satellites,
  passes,
  time,
  active,
  hover,
  choosePass,
  findInSky,
}: {
  state: ViewState;
  satellites: Satellite[];
  passes: SatellitePass[];
  time: number;
  active: number | null;
  hover: (index: number | null) => void;
  choosePass: (index: number, showInfo?: boolean) => void;
  findInSky: (satellite: Satellite, pass: SatellitePass) => void;
}) {
  const [expandedPasses, setExpandedPasses] = useState<Set<string>>(() => new Set());
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const app = element.closest<HTMLElement>('.app');
    const observer = new ResizeObserver(() =>
      app?.style.setProperty(
        '--pass-carousel-height',
        `${element.getBoundingClientRect().height}px`,
      ),
    );
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      if (
        (event.target as HTMLElement).closest('.pass-extra-details') ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
        element.scrollWidth <= element.clientWidth
      )
        return;
      event.preventDefault();
      element.scrollLeft += event.deltaY;
    };
    let drag: { pointerId: number; x: number; scroll: number; moved: boolean } | null = null;
    let suppressClick = false;
    const down = (event: PointerEvent) => {
      suppressClick = false;
      if (
        event.pointerType !== 'mouse' ||
        event.button !== 0 ||
        (event.target as HTMLElement).closest('button, input, a, .pass-extra-details')
      )
        return;
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        scroll: element.scrollLeft,
        moved: false,
      };
    };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const distance = event.clientX - drag.x;
      if (!drag.moved && Math.abs(distance) < 6) return;
      if (!drag.moved) {
        drag.moved = true;
        element.setPointerCapture(event.pointerId);
        element.dataset.dragging = 'true';
      }
      event.preventDefault();
      element.scrollLeft = drag.scroll - distance;
    };
    const up = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      suppressClick = drag.moved;
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      drag = null;
      delete element.dataset.dragging;
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    element.addEventListener('click', click, true);
    return () => {
      observer.disconnect();
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      element.removeEventListener('click', click, true);
      app?.style.removeProperty('--pass-carousel-height');
    };
  }, []);
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
    <div ref={container} className="pass-carousel" role="region" aria-label="Upcoming passes">
      <ul className="passes-list">
        {passes.map((pass, i) => {
          const passKey = `${pass.noradId}-${pass.start}`;
          const expanded = expandedPasses.has(passKey);
          const detailsId = `pass-details-${passKey}`;
          const inView = time >= pass.losStart && time <= pass.losEnd;
          const satellite = satellites.find((sat) => sat.noradId === pass.noradId);
          const current =
            satellite && state.observer ? lookAngles(satellite, time, state.observer) : null;
          return (
            <li key={`${pass.noradId}-${pass.start}`}>
              <Card
                className={`pass-item ${active === i ? 'pass-item-hover' : ''} ${inView ? 'pass-item-active' : ''}`}
                data-norad={pass.noradId}
                data-pass-start={pass.start}
                data-pass-end={pass.end}
                tabIndex={0}
                role="button"
                aria-label={`Show pass ${i + 1} on map`}
                aria-pressed={active === i}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('button, details')) return;
                  choosePass(i);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    choosePass(i);
                  }
                }}
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
                  </div>
                  <div className="pass-header-meta">
                    {inView && (
                      <Chip className="pass-live-chip" color="success" variant="soft" size="sm">
                        <Chip.Label>In view</Chip.Label>
                      </Chip>
                    )}
                  </div>
                </Card.Header>
                <Card.Content className="pass-content">
                  <dl className="pass-details pass-summary-grid">
                    {[
                      ['Pass Start', pass.startClipped ? 'Already above horizon' : fmt(pass.start)],
                      ['Pass End', pass.endClipped ? 'Horizon crossing not found' : fmt(pass.end)],
                      [
                        pass.startClipped || pass.endClipped ? 'Peak found' : 'Max Elevation',
                        `${pass.maxElevation.toFixed(1)}°`,
                      ],
                    ].map(([key, value]) => (
                      <div className="pass-row" key={key}>
                        <dt>{key}</dt>
                        <dd
                          className={
                            key === 'Max Elevation' || key === 'Peak found'
                              ? 'pass-peak'
                              : undefined
                          }
                        >
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="pass-extra-details" id={detailsId} hidden={!expanded}>
                    <dl className="pass-details pass-summary-grid">
                      {[
                        ['Rise Direction', direction(pass.riseAz)],
                        ['Max Elevation Az', direction(pass.maxAz)],
                        ['Set Direction', direction(pass.setAz)],
                      ].map(([key, value]) => (
                        <div className="pass-row" key={key}>
                          <dt>{key}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="muted pass-current-label">Position at map time · {fmt(time)}</p>
                    <dl className="pass-details pass-summary-grid" aria-live="off">
                      <div className="pass-row">
                        <dt>Current Azimuth</dt>
                        <dd>{current ? direction(current.azimuth) : 'N/A'}</dd>
                      </div>
                      <div className="pass-row">
                        <dt>Current Elevation</dt>
                        <dd>{current ? `${current.elevation.toFixed(1)}°` : 'N/A'}</dd>
                      </div>
                      {satellite && (
                        <div className="pass-row pass-navigation">
                          <dt className="sr-only">Sky finder</dt>
                          <dd>
                            <Button
                              size="sm"
                              variant="secondary"
                              onPress={() => findInSky(satellite, pass)}
                            >
                              Navigate
                            </Button>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                  {(pass.startClipped || pass.endClipped) && (
                    <p className="muted">
                      Full pass boundaries could not be determined; the peak shown is the highest
                      found.
                    </p>
                  )}
                </Card.Content>
                <Card.Footer className="pass-actions">
                  <Button
                    size="md"
                    variant="ghost"
                    className="pass-more"
                    aria-expanded={expanded}
                    aria-controls={detailsId}
                    onPress={() =>
                      setExpandedPasses((current) => {
                        const next = new Set(current);
                        if (next.has(passKey)) next.delete(passKey);
                        else next.add(passKey);
                        return next;
                      })
                    }
                  >
                    {expanded ? 'Less' : 'More'}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d={expanded ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
                    </svg>
                  </Button>
                  <Button
                    size="md"
                    variant="ghost"
                    className="pass-info"
                    onPress={() => choosePass(i, true)}
                  >
                    Sat info
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
