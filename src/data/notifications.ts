import type { PassNotificationKind } from '../domain/passNotifications';

const CHIMES = {
  entering: [
    { frequency: 740, offset: 0, duration: 0.2 },
    { frequency: 988, offset: 0.22, duration: 0.2 },
  ],
  peak: [
    { frequency: 988, offset: 0, duration: 0.14 },
    { frequency: 740, offset: 0.17, duration: 0.14 },
    { frequency: 1174.66, offset: 0.36, duration: 0.32 },
  ],
} satisfies Record<PassNotificationKind, { frequency: number; offset: number; duration: number }[]>;

export type DesktopPermission = NotificationPermission | 'unavailable';
export function desktopPermission(): DesktopPermission {
  return typeof Notification === 'undefined' ? 'unavailable' : Notification.permission;
}
export async function requestDesktopPermission(): Promise<DesktopPermission> {
  if (desktopPermission() !== 'default') return desktopPermission();
  try {
    return await Notification.requestPermission();
  } catch {
    return 'unavailable';
  }
}

export class NotificationDelivery {
  private audio: AudioContext | null = null;
  private desktop = new Set<Notification>();
  private nextSoundAt = 0;

  // Must be called directly from a click/key gesture, before awaiting permission.
  async unlockSound(): Promise<boolean> {
    try {
      if (!this.audio || this.audio.state === 'closed') {
        this.audio = new AudioContext();
        this.nextSoundAt = 0;
      }
      if (this.audio.state !== 'running') {
        await Promise.race([
          this.audio.resume(),
          new Promise((resolve) => window.setTimeout(resolve, 1500)),
        ]);
      }
      return this.audio.state === 'running';
    } catch {
      return false;
    }
  }

  playSound(kind: PassNotificationKind = 'entering'): boolean {
    if (this.audio?.state !== 'running') return false;
    try {
      const context = this.audio;
      const beginning = Math.max(context.currentTime, this.nextSoundAt);
      CHIMES[kind].forEach(({ frequency, offset, duration }) => {
        const start = beginning + offset;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.14, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration - 0.01);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + duration);
        this.nextSoundAt = start + duration + 0.12;
      });
      return true;
    } catch {
      return false;
    }
  }

  showDesktop(title: string, body: string, tag: string, soundPlayed: boolean): boolean {
    if (desktopPermission() !== 'granted') return false;
    try {
      const notification = new Notification(title, { body, tag, silent: soundPlayed });
      this.desktop.add(notification);
      notification.onclose = () => this.desktop.delete(notification);
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      notification.onerror = () => {
        notification.close();
        this.desktop.delete(notification);
      };
      // Bound native resources even if a platform never emits a close event.
      if (this.desktop.size > 5) {
        const oldest = this.desktop.values().next().value!;
        oldest.close();
        this.desktop.delete(oldest);
      }
      return true;
    } catch {
      // Some mobile browsers expose the API but require a service worker.
      return false;
    }
  }

  dispose() {
    if (this.audio) void this.audio.close().catch(() => {});
    this.audio = null;
    this.nextSoundAt = 0;
    for (const notification of this.desktop) notification.close();
    this.desktop.clear();
  }
}
