import type { CapacitorConfig } from '@capacitor/cli';

/**
 * superprod — package id and app name are fixed by the project brief.
 *
 * Android specifics that matter for self-hosted sync and reminders are NOT
 * expressible here; they live in the native project once `npx cap add android`
 * runs (cleartext traffic, foreground-service types, exact alarms, widget).
 * See FEATURES.md §18 for the required manifest surface.
 */
const config: CapacitorConfig = {
  appId: 'com.dwprod.superprod',
  appName: 'superprod',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Self-hosted servers are frequently plain HTTP on a LAN. The native
    // network-security-config must allow cleartext to user-entered hosts;
    // this flag keeps Capacitor from forcing HTTPS-only asset loading.
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
