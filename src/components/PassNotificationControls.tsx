import { Button } from '@heroui/react';
import { Toggle } from './Controls';
import type { usePassNotifications } from '../state/notifications';

export function PassNotificationControls({
  notifications,
}: {
  notifications: ReturnType<typeof usePassNotifications>;
}) {
  return (
    <div className="pass-notification-controls">
      <Toggle
        label="Pass notifications"
        selected={notifications.enabled}
        onChange={notifications.setEnabled}
      />
      <div className="pass-notification-tests">
        <Button
          variant="secondary"
          onPress={() => {
            void notifications.test('entering');
          }}
          isDisabled={notifications.testing}
        >
          Test entering
        </Button>
        <Button
          variant="secondary"
          onPress={() => {
            void notifications.test('peak');
          }}
          isDisabled={notifications.testing}
        >
          Test peak
        </Button>
      </div>
      <p className="muted">
        Two real-time alerts per pass: entering visibility and maximum elevation, with different
        sounds. Keep this page open and your device awake.
      </p>
      <p className="muted" role="status">
        {notifications.soundReady
          ? 'Sound ready.'
          : notifications.soundTested
            ? 'Sound unavailable or blocked. Check your browser audio settings.'
            : 'Click either test button to enable and check sound.'}{' '}
        {notifications.permission === 'granted'
          ? 'Desktop notifications allowed.'
          : notifications.permission === 'denied'
            ? 'Desktop notifications blocked; alerts still appear here.'
            : notifications.permission === 'unavailable'
              ? 'Desktop notifications unavailable; alerts still appear here.'
              : 'Testing also asks for desktop notification permission.'}
      </p>
      {notifications.predictionError && (
        <p className="muted">Peak alerts unavailable: {notifications.predictionError}</p>
      )}
    </div>
  );
}
