import { render } from 'solid-js/web';
import { App } from './ui/App';
import { seedDemoData } from './state/demo';
import { applyRemoteOperation, materialiseToday, resetAllData, rootTasks, selectTask, setView, type ViewId } from './state/store';
import { mountLayoutDebug } from './ui/layout-debug';
import { startReminderLoop } from './services/reminder-runtime';
import { startAccentSync } from './services/theme';
import { initStatusBar } from './services/status-bar';
import { startShortcuts } from './services/shortcuts';
import { startFocus } from './state/focus';
import { config } from './state/config-store';
import { startReminderScheduling } from './services/reminder-sync';
import { startWidgetSync } from './services/widget';
import { ensureOpLogLoaded, restartAutoSync, setRemoteApplier } from './sync/runner';
import { installLogging, logger } from './services/logger';
import { ensureFreshBuild } from './services/app-update';
import { logExactAlarmState } from './services/exact-alarms';
import './ui/theme.css';

// Logging is installed before anything else so startup failures are captured.
installLogging();

// A reinstalled APK must not keep running the previous WebView cache.
void ensureFreshBuild();

// Late reminders have exactly one cause worth logging up front.
void logExactAlarmState();

const root = document.querySelector('#root');
if (!root) throw new Error('#root missing');

const params = new URLSearchParams(location.search);

if (params.has('demo')) {
  // Start from a clean slate so repeated loads do not duplicate the demo set.
  resetAllData();
  seedDemoData();
}

// Deep links used by screenshots and manual QA: ?view=inbox, ?open=first
const view = params.get('view');
if (view) setView(view as ViewId);

if (params.get('open') === 'first') {
  const first = rootTasks()[0];
  if (first) selectTask(first.id);
}

// ?focus=Pomodoro|Flowtime|Countdown opens the overlay — used by QA shots.
const focusParam = params.get('focus');
if (focusParam) startFocus(focusParam as 'Pomodoro' | 'Flowtime' | 'Countdown');

// Create today's repeating tasks now, and again whenever the day rolls over
// or the app returns to the foreground (a phone can sleep across midnight).
materialiseToday();
setInterval(materialiseToday, 60_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) materialiseToday();
});

initStatusBar();
render(() => <App />, root);

// Reminders run for the lifetime of the app; the loop is idempotent.
startReminderLoop();
startReminderScheduling();
startWidgetSync();
startAccentSync();
startShortcuts();

// Op-log must be loaded before the first save can queue an upload.
void ensureOpLogLoaded();
setRemoteApplier(applyRemoteOperation);
logger.info('app', 'remote applier registered');
restartAutoSync();

if (config.sync.isEnabled && !config.sync.isManualSyncOnly) {
  void import('./sync/runner').then(({ syncNow }) => syncNow());
}

if (params.has('debug')) mountLayoutDebug();
