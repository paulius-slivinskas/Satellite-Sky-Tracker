import { Button, Checkbox, Input, Label, Modal, TextField } from '@heroui/react';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FILTER_CONFIG, isAmateurSelectedName } from '../domain/config';
import type { Satellite } from '../domain/types';
import { searchSatellites } from '../domain/search';
import { satelliteAliases } from '../domain/satelliteNames';
import './SatelliteSelection.css';

const PAGE_SIZE = 100;

export function SatelliteSelection({
  satellites,
  value,
  tracked,
  onApply,
}: {
  satellites: Satellite[];
  value: string[];
  tracked: string[];
  onApply: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const summaryId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{ id: string | null } | null>(null);
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const { id } = pendingFocus.current;
    pendingFocus.current = null;
    // Removing a focused row must not strand keyboard focus outside the dialog.
    const target = id ? removeButtons.current.get(id) : null;
    (target ?? searchInput.current)?.focus();
  }, [draft]);
  const byNorad = useMemo(
    () => new Map(satellites.map((satellite) => [satellite.noradId, satellite])),
    [satellites],
  );
  const available = useMemo(
    () => [...byNorad.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [byNorad],
  );
  const trackedIds = useMemo(() => new Set(tracked), [tracked]);
  const categories = useMemo(() => {
    const grouped = new Map<string, Satellite[]>([['all', available]]);
    for (const item of FILTER_CONFIG) {
      grouped.set(
        item.key,
        available.filter((satellite) => {
          if (item.key === 'tracked') return trackedIds.has(satellite.id);
          if (item.key === 'amateur_selected')
            return isAmateurSelectedName(satellite.name, satellite.noradId);
          return satellite.category === item.key;
        }),
      );
    }
    return grouped;
  }, [available, trackedIds]);
  const filtered = useMemo(
    () => searchSatellites(categories.get(category) ?? [], query, Infinity),
    [categories, category, query],
  );
  const selected = useMemo(() => new Set(draft), [draft]);
  const appliedIds = [...new Set(value)];
  const summary = appliedIds.length
    ? `${appliedIds.length} selected · ${appliedIds
        .slice(0, 2)
        .map((id) => byNorad.get(id)?.name ?? `NORAD ${id}`)
        .join(', ')}${appliedIds.length > 2 ? '…' : ''}`
    : 'Choose satellites';
  const changeOpen = (next: boolean) => {
    if (next) {
      setDraft([...new Set(value)]);
      setCategory('all');
      setQuery('');
      setLimit(PAGE_SIZE);
    }
    setOpen(next);
  };
  const toggleSatellite = (id: string, checked: boolean) => {
    setDraft((current) =>
      checked ? [...new Set([...current, id])] : current.filter((item) => item !== id),
    );
  };
  const removeSelected = (id: string) => {
    const index = draft.indexOf(id);
    pendingFocus.current = { id: draft[index + 1] ?? draft[index - 1] ?? null };
    toggleSatellite(id, false);
  };
  const clearSelected = () => {
    pendingFocus.current = { id: null };
    setDraft([]);
  };
  return (
    <Modal isOpen={open} onOpenChange={changeOpen}>
      <Button
        className="satellite-selection-trigger"
        variant="secondary"
        fullWidth
        aria-label="Satellite selection"
        aria-describedby={summaryId}
      >
        <span className="satellite-selection-trigger-text">
          <span className="satellite-selection-trigger-label">Satellite selection</span>
          <span className="satellite-selection-trigger-summary" id={summaryId}>
            {summary}
          </span>
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
          focusable="false"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </Button>
      <Modal.Backdrop className="satellite-selection-backdrop">
        <Modal.Container
          className="satellite-selection-container"
          size="lg"
          placement="center"
          scroll="inside"
        >
          <Modal.Dialog className="satellite-selection-dialog">
            <Modal.CloseTrigger aria-label="Close satellite selection" />
            <Modal.Header className="satellite-selection-header">
              <Modal.Heading>Satellite selection</Modal.Heading>
              <p>Choose the satellites to include in pass predictions.</p>
            </Modal.Header>
            <Modal.Body className="satellite-selection-body">
              <div className="satellite-selection-columns">
                <section className="satellite-selection-categories" aria-label="Browse categories">
                  <h3 className="satellite-selection-column-heading">Categories</h3>
                  <div
                    className="satellite-selection-category-list"
                    role="group"
                    aria-label="Satellite categories"
                  >
                    {[{ key: 'all', label: 'All satellites' }, ...FILTER_CONFIG].map((item) => (
                      <Button
                        key={item.key}
                        className="satellite-selection-category"
                        variant={category === item.key ? 'secondary' : 'ghost'}
                        aria-label={item.label}
                        aria-pressed={category === item.key}
                        onPress={() => {
                          setCategory(item.key);
                          setLimit(PAGE_SIZE);
                        }}
                      >
                        <span>{item.label}</span>
                        <span className="satellite-selection-count" aria-hidden="true">
                          {categories.get(item.key)?.length ?? 0}
                        </span>
                      </Button>
                    ))}
                  </div>
                </section>
                <section
                  className="satellite-selection-available"
                  aria-label="Available satellites"
                >
                  <TextField
                    className="field satellite-selection-search"
                    value={query}
                    onChange={(next) => {
                      setQuery(next);
                      setLimit(PAGE_SIZE);
                    }}
                  >
                    <Label>Search satellites</Label>
                    <Input ref={searchInput} placeholder="Name or NORAD ID" />
                  </TextField>
                  <p className="satellite-selection-results" role="status">
                    {filtered.length} {filtered.length === 1 ? 'satellite' : 'satellites'}
                  </p>
                  <div className="satellite-selection-list">
                    {filtered.slice(0, limit).map((satellite) => (
                      <Checkbox
                        key={satellite.noradId}
                        className="satellite-selection-checkbox"
                        aria-label={`${satellite.name} (${satellite.noradId})`}
                        isSelected={selected.has(satellite.noradId)}
                        onChange={(checked) => toggleSatellite(satellite.noradId, checked)}
                      >
                        <Checkbox.Content>
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                          <Label className="satellite-selection-row-text">
                            <span className="satellite-selection-name">{satellite.name}</span>
                            {satelliteAliases(satellite).length > 0 && (
                              <span className="satellite-aliases">
                                Also known as: {satelliteAliases(satellite).join(' · ')}
                              </span>
                            )}
                            <span className="satellite-selection-meta">
                              NORAD {satellite.noradId}
                            </span>
                          </Label>
                        </Checkbox.Content>
                      </Checkbox>
                    ))}
                    {!filtered.length && (
                      <p className="satellite-selection-empty">
                        {!available.length
                          ? 'The satellite catalog is not available yet.'
                          : query.trim()
                            ? 'No matching satellites in this category.'
                            : 'No satellites in this category.'}
                      </p>
                    )}
                    {filtered.length > limit && (
                      <Button
                        className="satellite-selection-show-more"
                        variant="ghost"
                        fullWidth
                        onPress={() => setLimit((current) => current + PAGE_SIZE)}
                      >
                        Show more ({filtered.length - limit} remaining)
                      </Button>
                    )}
                  </div>
                </section>
                <section className="satellite-selection-selected" aria-label="Selected satellites">
                  <div className="satellite-selection-heading-row">
                    <h3 className="satellite-selection-column-heading">
                      Selected <span className="satellite-selection-count">{draft.length}</span>
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      isDisabled={!draft.length}
                      onPress={clearSelected}
                    >
                      Clear list
                    </Button>
                  </div>
                  <ul className="satellite-selection-selected-list">
                    {draft.map((id) => {
                      const satellite = byNorad.get(id);
                      const name = satellite?.name ?? `NORAD ${id}`;
                      return (
                        <li key={id} className="satellite-selection-selected-row">
                          <div className="satellite-selection-row-text">
                            <span className="satellite-selection-name">{name}</span>
                            {satellite && satelliteAliases(satellite).length > 0 && (
                              <span className="satellite-aliases">
                                Also known as: {satelliteAliases(satellite).join(' · ')}
                              </span>
                            )}
                            <span className="satellite-selection-meta">
                              {satellite ? `NORAD ${id}` : 'Not in the current catalog'}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            aria-label={`Remove ${name}`}
                            ref={(button) => {
                              if (button) removeButtons.current.set(id, button);
                              else removeButtons.current.delete(id);
                            }}
                            onPress={() => removeSelected(id)}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path d="m6 6 12 12M6 18 18 6" />
                            </svg>
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                  {!draft.length && (
                    <p className="satellite-selection-empty">
                      No satellites selected. Choose satellites from the list.
                    </p>
                  )}
                </section>
              </div>
            </Modal.Body>
            <Modal.Footer className="satellite-selection-footer">
              <span className="satellite-selection-footer-count" role="status">
                {draft.length} selected
              </span>
              <Button variant="secondary" onPress={() => changeOpen(false)}>
                Cancel
              </Button>
              <Button
                onPress={() => {
                  onApply([...draft]);
                  changeOpen(false);
                }}
              >
                Apply
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
