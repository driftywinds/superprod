import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/**
 * Keeps app content clear of the Android status bar and gesture area.
 *
 * Android 15 (target SDK 35) forces edge-to-edge, so the WebView draws under
 * the status bar unless the app insets itself. Two layers:
 *
 * 1. Native: do not overlay the WebView, and set light icons for a dark UI.
 * 2. CSS: `--safe-top` / `--safe-bottom` fall back to `env(safe-area-inset-*)`
 *    so a web build or a device that still overlays also stays clear.
 */
export const initStatusBar = (): void => {
  document.documentElement.style.setProperty('--safe-top', 'env(safe-area-inset-top, 0px)');
  document.documentElement.style.setProperty('--safe-bottom', 'env(safe-area-inset-bottom, 0px)');

  if (!Capacitor.isNativePlatform()) return;

  void (async () => {
    try {
      // Content sits below the status bar instead of underneath it.
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#000000' });
    } catch {
      // A missing plugin must not break startup; the CSS fallback still applies.
    }
  })();
};
