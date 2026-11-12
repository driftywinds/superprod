import { Capacitor } from '@capacitor/core';
import {
  LocalNotifications,
  type ActionPerformed,
  type LocalNotificationSchema,
} from '@capacitor/local-notifications';

/**
 * Notification delivery with action buttons (Done / Snooze).
 *
 * Two transports, chosen at runtime:
 * - **Native (Android)**: `@capacitor/local-notifications`. Android WebView has
 *   no `Notification` constructor at all, so the web path can never work there —
 *   this is the path that matters on the target platform.
 * - **Web/PWA**: a service worker `showNotification`, which is the only web
 *   notification API that supports action buttons.
 *
 * Both report the same action events to the same handlers.
 */

export type NotificationAction = 'done' | 'snooze' | 'open';

export interface AppNotification {
  tag: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  actions?: { action: NotificationAction; title: string }[];
  requireInteraction?: boolean;
}

export interface NotificationActionEvent {
  action: NotificationAction;
  data: Record<string, string>;
}

type ActionHandler = (event: NotificationActionEvent) => void | Promise<void>;

const ACTIONS: { action: NotificationAction; title: string }[] = [
  { action: 'done', title: 'Done' },
  { action: 'snooze', title: 'Snooze' },
];

const ACTION_TYPE_ID = 'SUPERPROD_TASK_ACTIONS';
const CHANNEL_ID = 'superprod-reminders';
const ICON = '/icon-192.png';

/* ------------------------------------------------------------------ native */

const isNative = (): boolean => Capacitor.isNativePlatform();

/** Stable numeric id from a string tag, because Android ids are 32-bit ints. */
const numericId = (tag: string): number => {
  let hash = 0;
  for (let index = 0; index < tag.length; index += 1) {
    hash = (hash * 31 + tag.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 2_147_483_647;
};

const ensureNativeSetup = async (): Promise<void> => {
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Reminders',
    description: 'Task and deadline reminders',
    importance: 4,
    visibility: 1,
    vibration: true,
  });

  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: ACTION_TYPE_ID,
        actions: ACTIONS.map((action) => ({
          id: action.action,
          title: action.title,
        })),
      },
    ],
  });
};

const toLocalNotification = (notification: AppNotification): LocalNotificationSchema => ({
  id: numericId(notification.tag),
  title: notification.title,
  body: notification.body,
  channelId: CHANNEL_ID,
  actionTypeId: ACTION_TYPE_ID,
  smallIcon: 'ic_stat_icon_config_sample',
  iconColor: '#4f9cf9',
  ongoing: notification.requireInteraction ?? false,
  autoCancel: true,
  extra: notification.data ?? {},
});

/* --------------------------------------------------------------------- web */

class WebNotifier {
  private registration: ServiceWorkerRegistration | null = null;

  async ensureRegistration(): Promise<ServiceWorkerRegistration | null> {
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

  supportsNotifications(): boolean {
    return 'Notification' in globalThis;
  }

  async show(notification: AppNotification): Promise<void> {
    const actions = notification.actions ?? ACTIONS;
    const registration = await this.ensureRegistration();

    if (registration) {
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

/* --------------------------------------------------------------- service */

export type PermissionOutcome =
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'insecure-context'
  | 'plugin-missing';

export interface PermissionReport {
  outcome: PermissionOutcome;
  /** Human-readable reason, shown in Settings. */
  detail: string;
  transport: 'native' | 'web';
}

class NotificationService {
  private handlers = new Set<ActionHandler>();
  private nativeReady = false;
  private listening = false;
  private readonly web = new WebNotifier();

  get transport(): 'native' | 'web' {
    return isNative() ? 'native' : 'web';
  }

  private emit(event: NotificationActionEvent): void {
    for (const handler of this.handlers) void handler(event);
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;

    // Native action buttons.
    if (isNative()) {
      void LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (event: ActionPerformed) => {
          const extra = (event.notification.extra ?? {}) as Record<string, string>;
          const actionId = event.actionId ?? 'open';
          this.emit({
            action:
              actionId === 'done' || actionId === 'snooze'
                ? (actionId as NotificationAction)
                : 'open',
            data: extra,
          });
        },
      );
    }

    // Web action buttons, forwarded by the service worker.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
        const payload = event.data as
          | { type?: string; action?: string; data?: Record<string, string> }
          | undefined;
        if (!payload || payload.type !== 'superprod-notification-action') return;
        const action = payload.action ?? 'open';
        this.emit({
          action: action === 'done' || action === 'snooze' ? (action as NotificationAction) : 'open',
          data: payload.data ?? {},
        });
      });
    }
  }

  /** Ask for permission and explain precisely what happened when it fails. */
  async ensurePermission(): Promise<PermissionReport> {
    if (isNative()) {
      try {
        const current = await LocalNotifications.checkPermissions();
        if (current.display === 'granted') {
          await this.prepareNative();
          return { outcome: 'granted', detail: 'Notifications are allowed.', transport: 'native' };
        }

        const requested = await LocalNotifications.requestPermissions();
        if (requested.display === 'granted') {
          await this.prepareNative();
          return { outcome: 'granted', detail: 'Notifications are allowed.', transport: 'native' };
        }

        return {
          outcome: 'denied',
          detail:
            requested.display === 'denied'
              ? 'Denied. Enable notifications for superprod in Android system settings.'
              : 'Not granted yet. Android may need the permission re-requested from a fresh install.',
          transport: 'native',
        };
      } catch (error) {
        return {
          outcome: 'plugin-missing',
          detail: `Native notification plugin unavailable: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
          transport: 'native',
        };
      }
    }

    if (!this.web.supportsNotifications()) {
      return {
        outcome: 'unsupported',
        detail: 'This browser has no Notification API.',
        transport: 'web',
      };
    }

    if (!globalThis.isSecureContext) {
      return {
        outcome: 'insecure-context',
        detail:
          'Notifications need HTTPS or localhost. Over plain HTTP the browser blocks them — use the Android app or a secure origin.',
        transport: 'web',
      };
    }

    if (Notification.permission === 'granted') {
      this.listen();
      return { outcome: 'granted', detail: 'Notifications are allowed.', transport: 'web' };
    }

    if (Notification.permission === 'denied') {
      return {
        outcome: 'denied',
        detail:
          'Blocked for this site. Re-allow notifications in the browser’s site settings, then reload.',
        transport: 'web',
      };
    }

    const result = await Notification.requestPermission();
    if (result === 'granted') {
      this.listen();
      return { outcome: 'granted', detail: 'Notifications are allowed.', transport: 'web' };
    }
    return { outcome: 'denied', detail: 'Permission was declined.', transport: 'web' };
  }

  private async prepareNative(): Promise<void> {
    if (this.nativeReady) return;
    await ensureNativeSetup();
    this.nativeReady = true;
    this.listen();
  }

  async notify(notification: AppNotification): Promise<boolean> {
    const report = await this.ensurePermission();
    if (report.outcome !== 'granted') return false;

    if (isNative()) {
      await this.prepareNative();
      // `at` in the near future: Android rejects a notification scheduled in the past.
      await LocalNotifications.schedule({
        notifications: [{ ...toLocalNotification(notification), schedule: { at: new Date(Date.now() + 750) } }],
      });
      return true;
    }

    this.listen();
    await this.web.show(notification);
    return true;
  }

  async close(tag: string): Promise<void> {
    if (isNative()) {
      await LocalNotifications.cancel({ notifications: [{ id: numericId(tag) }] });
      return;
    }
    await this.web.close(tag);
  }

  onAction(handler: ActionHandler): () => void {
    this.handlers.add(handler);
    this.listen();
    return () => this.handlers.delete(handler);
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
  actions: ACTIONS,
});
