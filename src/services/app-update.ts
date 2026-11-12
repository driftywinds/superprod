import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { logger } from './logger';
import { APP_VERSION } from '../app-version';

/** Set by vite.config.ts at build time. */
declare const __BUILD_ID__: string | undefined;
import { requestReplay } from '../sync/runner';

/**
 * Makes a freshly installed APK actually run its own code.
 *
 * Android's WebView HTTP-caches the app shell (`https://localhost/index.html`
 * and its scripts), and Capacitor's asset loader sends no cache headers, so a
 * reinstall was the only thing that reliably cleared it. The JS cannot detect
 * this on its own — the detected version would be the cached one too.
 *
 * The APK version, however, is read natively through `App.getInfo()`, which is
 * always current. Recording it lets the app notice "the shell I am running is
 * older than the app I am installed as" and force a cache-free reload.
 */

const BUILD_KEY = 'superprod.build.id';
/** Guards against a reload loop if the asset server keeps serving stale files. */
const RELOAD_FLAG = 'superprod.build.reloading';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore: worst case one extra reload next start
  }
};

const clearCaches = async (): Promise<void> => {
  try {
    if ('caches' in globalThis) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      logger.info('update', 'cleared cache storage', { names: names.length });
    }
  } catch (error) {
    logger.warn('update', 'could not clear caches', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((registrations ?? []).map((registration) => registration.unregister()));
    if (registrations?.length) {
      logger.info('update', 'unregistered service workers', { count: registrations.length });
    }
  } catch {
    // Service workers are optional.
  }
};

/**
 * Compare the running shell with the installed app.
 *
 * On web (no native shell) this only clears the reload flag and returns false.
 */
export const ensureFreshBuild = async (): Promise<boolean> => {
  // A new JS build must re-apply operations an older build skipped: they are
  // deduped by id, so nothing would ever revisit them without this.
  // The stamp changes on every build, so a local rebuild re-applies history too.
  const buildId =
    typeof __BUILD_ID__ === 'string' && __BUILD_ID__.length > 0
      ? `${APP_VERSION}:${__BUILD_ID__}`
      : APP_VERSION;

  const shellKey = 'superprod.shell.version';
  const previousShell = read(shellKey);
  if (previousShell !== null && previousShell !== buildId) {
    logger.warn('update', 'new build; scheduling a full operation replay', {
      previous: previousShell,
      current: buildId,
    });
    requestReplay();
  }
  write(shellKey, buildId);

  const currentVersion = Capacitor.isNativePlatform() ? await readNativeVersion() : null;

  if (!currentVersion) {
    sessionStorage.removeItem(RELOAD_FLAG);
    return false;
  }

  const previous = read(BUILD_KEY);
  sessionStorage.removeItem(RELOAD_FLAG);

  if (previous === currentVersion) return false;

  // First run after a version bump: the shell may be an older cached copy.
  if (previous !== null) {
    logger.warn('update', 'app version changed; forcing a cache-free reload', {
      previous,
      current: currentVersion,
    });

    if (sessionStorage.getItem(RELOAD_FLAG) === '1') {
      // Already reloaded once this session and the shell still looks stale.
      logger.warn('update', 'shell still stale after reload; continuing');
      write(BUILD_KEY, currentVersion);
      return false;
    }

    write(BUILD_KEY, currentVersion);
    sessionStorage.setItem(RELOAD_FLAG, '1');
    await clearCaches();

    // A changed URL is a different cache key for the WebView.
    const url = new URL(location.href);
    url.searchParams.set('build', currentVersion);
    location.replace(url.toString());
    return true;
  }

  write(BUILD_KEY, currentVersion);
  logger.info('update', 'build recorded', { version: currentVersion });
  return false;
};

const readNativeVersion = async (): Promise<string | null> => {
  try {
    const info = await App.getInfo();
    return `${info.version}+${info.build}`;
  } catch (error) {
    logger.warn('update', 'could not read native app version', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};
