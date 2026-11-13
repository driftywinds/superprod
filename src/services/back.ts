import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { logger } from './logger';

/**
 * Android back gesture / button routing.
 *
 * Without this the WebView treats back as "exit": the gesture closes the app
 * from anywhere, losing the screen the user was on. Handlers are registered by
 * whatever is currently on top (add-task sheet, task detail, focus overlay,
 * settings sub-page, nav drawer) and run last-registered-first, so back peels
 * the stack instead of killing the session.
 *
 * When nothing is left to close, the app is minimised rather than finished —
 * back should never discard what the user was doing.
 */

interface BackHandler {
  /** For logs and debugging only. */
  name: string;
  /** Return true when the press was consumed. */
  handle: () => boolean;
}

const handlers: BackHandler[] = [];

/** Register a handler while a screen/overlay is open. Returns a disposer. */
export const registerBackHandler = (name: string, handle: () => boolean): (() => void) => {
  const entry: BackHandler = { name, handle };
  handlers.push(entry);
  return () => {
    const index = handlers.indexOf(entry);
    if (index >= 0) handlers.splice(index, 1);
  };
};

/** Run the top-most handler that wants the press. */
export const dispatchBack = (): boolean => {
  for (let index = handlers.length - 1; index >= 0; index -= 1) {
    const handler = handlers[index];
    if (!handler) continue;
    try {
      if (handler.handle()) {
        logger.debug('nav', 'back handled', { by: handler.name });
        return true;
      }
    } catch (error) {
      logger.error('nav', 'back handler failed', {
        by: handler.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return false;
};

let installed = false;

/**
 * Wire the platform back affordance. Safe to call once; extra calls are ignored.
 *
 * Native: Capacitor's `backButton` event (predictive back included). Web: popstate,
 * so the browser's back button behaves the same way in a dev build.
 */
export const installBackNavigation = (onUnhandled: () => void): void => {
  if (installed) return;
  installed = true;

  const handleUnhandled = (source: string): void => {
    logger.info('nav', 'back at root', { source });
    onUnhandled();
  };

  if (Capacitor.isNativePlatform()) {
    void App.addListener('backButton', () => {
      if (!dispatchBack()) handleUnhandled('native');
    });
    logger.info('nav', 'native back gesture wired');
    return;
  }

  // Web: keep one sentinel entry so a back press becomes a popstate we can see.
  window.history.pushState({ superprod: 'root' }, '');
  window.addEventListener('popstate', () => {
    const handled = dispatchBack();
    if (handled) window.history.pushState({ superprod: 'root' }, '');
    else handleUnhandled('web');
  });
  logger.info('nav', 'browser back navigation wired');
};
