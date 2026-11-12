/**
 * Notification delivery with action buttons.
 *
 * Two transports:
 * - Web / PWA: service worker notifications, which are the only web
 *   notifications that can carry action buttons.
 * - Android (Capacitor): `LocalNotifications`, which supports actions natively.
 *   The adapter is behind the same interface; wiring it needs the Capacitor
 *   plugin installed in the native project (see PARITY.md §9).
 *
 * shortcut: the Capacitor adapter is a stub that falls back to the web path.
 * Install @capacitor/local-notifications and implement `CapacitorTransport`
 * before shipping the Android build's reminders.
 */

export type NotificationAction = 'done' | 'snooze' | 'open';

export interface AppNotification {
  /** Stable id so a re-fired reminder replaces rather than stacks. */
  tag: string;
  title: string;
  body: string;
  /** Epoch ms; a scheduled reminder re-fires on snooze. */
  data?: Record<string, string>;
  actions?: { action: NotificationAction; title: string }[];
  requireInteraction?: boolean;
}

export interface NotificationTransport {
  readonly name: string;
  ensurePermission(): Promise<boolean>;
  show(notification: AppNotification): Promise<void>;
  close(tag: string): Promise<void>;
}

const DEFAULT_ACTIONS: { action: NotificationAction; title: string }[] = [
  { action: 'done', title: 'Done' },
  { action: 'snooze', title: 'Snooze' },
];

const ICON = '/icon-192.png';

class WebTransport implements NotificationTransport {
  readonly name = 'web';
  private registration: ServiceWorkerRegistration | null = null;

  async ensurePermission(): Promise<boolean> {
    if (!('Notification' in globalThis)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  private async ensureRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (this.registration) return this.registration;
    if (!('serviceWorker' in navigator)) return null;
    try {
      this.registration = await navigator.serviceWorker.register('/notification-sw.js', {
        scope: '/',
      });
      await navigator.serviceWorker.ready;
      return this.registration;
    } catch {
      return null;
    }
  }

  async show(notification: AppNotification): Promise<void> {
    const actions = notification.actions ?? DEFAULT_ACTIONS;
    const registration = await this.ensureRegistration();

    if (registration) {
      // `renotify` and `actions` exist in the spec but not in the DOM lib's
      // NotificationOptions, so the extra keys go through one cast.
      const options = {
        body: notification.body,
        tag: notification.tag,
        renotify: true,
        icon: ICON,
        badge: ICON,
        requireInteraction: notification.requireInteraction ?? true,
        data: notification.data ?? {},
        actions,
      } as NotificationOptions;
      await registration.showNotification(notification.title, options);
      return;
    }

    // Fallback: no action buttons, but the reminder still appears.
    new Notification(notification.title, {
      body: notification.body,
      tag: notification.tag,
      icon: ICON,
    });
  }

  async close(tag: string): Promise<void> {
    const registration = await this.ensureRegistration();
    if (!registration) return;
    const notifications = await registration.getNotifications({ tag });
    for (const notification of notifications) notification.close();
  }
}

export interface NotificationActionEvent {
  action: NotificationAction;
  data: Record<string, string>;
}

type ActionHandler = (event: NotificationActionEvent) => void | Promise<void>;

class NotificationService {
  private transport: NotificationTransport = new WebTransport();
  private handlers = new Set<ActionHandler>();
  private listening = false;

  get transportName(): string {
    return this.transport.name;
  }

  /** Permission prompt must run from a user gesture on most browsers. */
  async ensurePermission(): Promise<boolean> {
    const granted = await this.transport.ensurePermission();
    if (granted) this.listen();
    return granted;
  }

  async notify(notification: AppNotification): Promise<void> {
    const granted = await this.transport.ensurePermission();
    if (!granted) return;
    this.listen();
    await this.transport.show(notification);
  }

  async close(tag: string): Promise<void> {
    await this.transport.close(tag);
  }

  onAction(handler: ActionHandler): () => void {
    this.handlers.add(handler);
    this.listen();
    return () => this.handlers.delete(handler);
  }

  private listen(): void {
    if (this.listening || !('serviceWorker' in navigator)) return;
    this.listening = true;

    navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
      const payload = event.data as
        | { type?: string; action?: string; data?: Record<string, string> }
        | undefined;
      if (!payload || payload.type !== 'superprod-notification-action') return;

      const action = (payload.action ?? 'open') as NotificationAction;
      const actionEvent: NotificationActionEvent = {
        action: action === 'done' || action === 'snooze' ? action : 'open',
        data: payload.data ?? {},
      };
      for (const handler of this.handlers) void handler(actionEvent);
    });
  }
}

export const notifications = new NotificationService();

export const buildTaskNotification = (
  taskId: string,
  title: string,
  body: string,
): AppNotification => ({
  tag: `task-${taskId}`,
  title,
  body,
  data: { taskId, url: '/' },
  actions: DEFAULT_ACTIONS,
});
