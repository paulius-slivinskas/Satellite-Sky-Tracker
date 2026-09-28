import { Button } from '@heroui/react';
import { useEffect, useState } from 'react';
import type { Catalog } from '../data/catalog';
import { AppAlert } from './AppAlert';

const DISMISSED_ISSUE_KEY = 'satapp_dismissed_catalog_issue_v1';
function readDismissedIssue(): string | null {
  try {
    return sessionStorage.getItem(DISMISSED_ISSUE_KEY);
  } catch {
    return null;
  }
}
function saveDismissedIssue(issue: string | null) {
  try {
    if (issue === null) sessionStorage.removeItem(DISMISSED_ISSUE_KEY);
    else sessionStorage.setItem(DISMISSED_ISSUE_KEY, issue);
  } catch {
    // Dismissal still works in memory when session storage is unavailable.
  }
}
function issueIdentity(catalog: Catalog & { loading: boolean }): string | null {
  // Counts, dates rendered in the user's format, and loading progress are not new issues.
  const reasons = catalog.issues.map(({ category, reason }) => `${category}:${reason}`).sort();
  if (catalog.blockedUntil) return JSON.stringify(['blocked', catalog.blockedUntil]);
  if (catalog.loading) return null;
  if (!catalog.satellites.length) return JSON.stringify(['unavailable', reasons]);
  if (catalog.unavailable.length)
    return JSON.stringify(['partial', [...catalog.unavailable].sort(), reasons]);
  if (catalog.outdatedCount) return JSON.stringify(['outdated']);
  if (catalog.staleGroups.length) return JSON.stringify(['saved', [...catalog.staleGroups].sort()]);
  return null;
}

export function CatalogNotice({
  catalog,
  onRetry,
  timeFormat,
}: {
  catalog: Catalog & { loading: boolean };
  onRetry: () => void;
  timeFormat: '12h' | '24h';
}) {
  const issue = issueIdentity(catalog);
  const [dismissed, setDismissed] = useState<string | null>(readDismissedIssue);
  useEffect(() => {
    // Keep the dismissal through refresh progress, but not after recovery or a new issue.
    if (!catalog.loading && dismissed !== null && dismissed !== issue) {
      setDismissed(null);
      saveDismissedIssue(null);
    }
  }, [catalog.loading, dismissed, issue]);
  const dismissal = {
    dismissKey: issue ?? undefined,
    onDismiss: () => {
      if (issue !== null) {
        setDismissed(issue);
        saveDismissedIssue(issue);
      }
    },
  };
  if (issue !== null && issue === dismissed) return null;
  const count = catalog.satellites.length;
  const available = `${count} ${count === 1 ? 'satellite remains' : 'satellites remain'} available`;
  const retry = (
    <Button size="sm" variant="tertiary" onPress={onRetry}>
      Retry
    </Button>
  );
  if (catalog.blockedUntil) {
    const time = new Date(catalog.blockedUntil).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h',
    });
    return (
      <AppAlert
        {...dismissal}
        className="status"
        status="warning"
        title="CelesTrak temporarily blocked"
      >
        Provider requests are paused until {time}.
        {catalog.issues.length > 0 &&
          ` ${[...new Set(catalog.issues.map((issue) => issue.reason))].join('. ')}.`}
        {count > 0
          ? ` ${available} from saved or fallback data.`
          : catalog.loading
            ? ' Trying the ISS fallback source.'
            : ' No saved or fallback orbital data is available.'}
        {catalog.outdatedCount > 0 &&
          ` ${catalog.outdatedCount} ${catalog.outdatedCount === 1 ? 'has' : 'have'} outdated orbital elements; predictions may be less accurate.`}
      </AppAlert>
    );
  }
  if (catalog.loading)
    return (
      <AppAlert
        className="status"
        status="default"
        loading
        title={count ? 'Updating orbital data' : 'Loading orbital data'}
      >
        {count
          ? `${count} ${count === 1 ? 'satellite is' : 'satellites are'} available while feeds update.`
          : 'Fetching satellite positions and orbit information.'}
      </AppAlert>
    );
  if (!count)
    return (
      <AppAlert
        {...dismissal}
        className="status"
        status="danger"
        title="Orbital data unavailable"
        action={retry}
      >
        No usable orbital data could be loaded.
        {catalog.issues.length > 0 &&
          ` ${[...new Set(catalog.issues.map((issue) => issue.reason))].join('. ')}.`}
      </AppAlert>
    );
  if (catalog.unavailable.length)
    return (
      <AppAlert
        {...dismissal}
        className="status"
        status="warning"
        title="Some orbital feeds are unavailable"
        action={retry}
      >
        Could not update: {catalog.unavailable.join(', ')}. {available}.
        {catalog.issues.length > 0 &&
          ` ${[...new Set(catalog.issues.map((issue) => issue.reason))].join('. ')}.`}
      </AppAlert>
    );
  if (catalog.outdatedCount)
    return (
      <AppAlert
        {...dismissal}
        className="status"
        status="warning"
        title="Some orbital elements are outdated"
        action={retry}
      >
        {catalog.outdatedCount} of {count} satellites have orbital elements more than 7 days from
        today's date. Their positions and pass predictions may be less accurate.
      </AppAlert>
    );
  if (catalog.staleGroups.length)
    return (
      <AppAlert
        {...dismissal}
        className="status"
        status="warning"
        title="Using saved orbital data"
        action={retry}
      >
        The weekly update is overdue for: {catalog.staleGroups.join(', ')}. Last saved data is still
        being used; positions and pass predictions may be less accurate.
      </AppAlert>
    );
  return null;
}
