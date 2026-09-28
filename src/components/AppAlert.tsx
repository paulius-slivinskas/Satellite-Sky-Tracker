import { Alert, CloseButton, Spinner } from '@heroui/react';
import { Children, isValidElement, useEffect, useState, type ReactNode } from 'react';

export interface AppAlertProps {
  status?: 'default' | 'accent' | 'success' | 'warning' | 'danger';
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  loading?: boolean;
  dismissible?: boolean;
  dismissKey?: string;
  onDismiss?: () => void;
}

function textContent(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      return isValidElement<{ children?: ReactNode }>(child)
        ? textContent(child.props.children)
        : '';
    })
    .join('');
}

export function AppAlert({
  status = 'default',
  title,
  children,
  action,
  className,
  loading = false,
  dismissible = !loading,
  dismissKey,
  onDismiss,
}: AppAlertProps) {
  const identity = dismissKey ?? JSON.stringify([status, title, textContent(children)]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (dismissed !== null && dismissed !== identity) setDismissed(null);
  }, [dismissed, identity]);
  if (dismissible && dismissed === identity) return null;
  return (
    <Alert
      className={['app-alert', className].filter(Boolean).join(' ')}
      status={status}
      role={status === 'danger' ? 'alert' : 'status'}
      aria-atomic="true"
      data-loading={loading || undefined}
    >
      <Alert.Indicator aria-hidden="true">
        {loading ? <Spinner size="sm" /> : undefined}
      </Alert.Indicator>
      <Alert.Content className="app-alert-content">
        {title && <Alert.Title>{title}</Alert.Title>}
        {children !== undefined && children !== null && (
          <Alert.Description>{children}</Alert.Description>
        )}
        {action && <div className="app-alert-action">{action}</div>}
      </Alert.Content>
      {dismissible && (
        <CloseButton
          className="app-alert-close"
          aria-label={title ? `Dismiss ${title}` : 'Dismiss notification'}
          onPress={() => {
            setDismissed(identity);
            onDismiss?.();
          }}
        />
      )}
    </Alert>
  );
}
