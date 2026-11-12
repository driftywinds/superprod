/**
 * Notification service worker for superprod.
 *
 * Handles notification action buttons (Done / Snooze) and forwards them to the
 * app window. Runs in a plain worker scope — no framework, no imports.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action || 'open';
  const message = { type: 'superprod-notification-action', action, data };

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windows) {
        client.postMessage(message);
      }

      if (action === 'open' || windows.length === 0) {
        const target = data.url || '/';
        const existing = windows[0];
        if (existing) await existing.focus();
        else await self.clients.openWindow(target);
      }
    })(),
  );
});
