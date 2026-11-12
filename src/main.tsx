import { render } from 'solid-js/web';
import { App } from './ui/App';
import { seedDemoData } from './state/demo';
import { resetAllData, rootTasks, selectTask, setView, type ViewId } from './state/store';
import { mountLayoutDebug } from './ui/layout-debug';
import { startReminderLoop } from './services/reminder-runtime';
import { startAccentSync } from './services/theme';
import './ui/theme.css';

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

render(() => <App />, root);

// Reminders run for the lifetime of the app; the loop is idempotent.
startReminderLoop();
startAccentSync();

if (params.has('debug')) mountLayoutDebug();
