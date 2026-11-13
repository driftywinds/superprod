import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { createEffect, createRoot } from 'solid-js';
import { allTasks, materialiseOccurrence, projectedTasksForDay, repeatConfigs, selectTask, setView, state, toggleDone } from '../state/store';
import { buildWidgetModel } from '../domain/widget-model';
import { todayStr } from '../domain/models';
import { syncNow } from '../sync/runner';

/**
 * Bridge between the app and the Android home-screen widget / its actions.
 *
 * - The app pushes a small JSON model (what to show) into native storage.
 * - The widget's own "done" taps are queued natively and applied here.
 * - Deep links `superprod://add | refresh | today | task/<id>` come from the
 *   widget's buttons and rows.
 */

interface SuperprodBridgePlugin {
  setWidgetData(options: { json: string }): Promise<void>;
  drainWidgetActions(): Promise<{ taskIds: string[] }>;
}

const Bridge = registerPlugin<SuperprodBridgePlugin>('SuperprodBridge');

const OCCURRENCE_ID = /^rpt_(.+)_(\d{4}-\d{2}-\d{2})$/;

export const buildCurrentWidgetModel = () =>
  buildWidgetModel({
    today: todayStr(),
    tasks: allTasks(),
    occurrences: (day) => projectedTasksForDay(day),
  });

const pushWidget = async (): Promise<void> => {
  try {
    await Bridge.setWidgetData({ json: JSON.stringify(buildCurrentWidgetModel()) });
  } catch {
    // Widget not installed / plugin missing: nothing to update.
  }
};

/** Apply "done" taps made on the widget while the app was closed. */
const applyWidgetActions = async (): Promise<void> => {
  try {
    const { taskIds } = await Bridge.drainWidgetActions();
    for (const id of taskIds) {
      if (!state.tasks[id]) {
        const match = OCCURRENCE_ID.exec(id);
        if (match) materialiseOccurrence(match[1]!, match[2]!);
      }
      const task = state.tasks[id];
      if (task && !task.isDone) toggleDone(id);
    }
    if (taskIds.length > 0) await pushWidget();
  } catch {
    // Ignore: nothing queued, or the plugin is not available.
  }
};

/** Signal the add-task bar to take focus (consumed by the UI). */
export const ADD_TASK_EVENT = 'superprod:add-task';

const handleDeepLink = async (url: string): Promise<void> => {
  const path = url.replace(/^superprod:\/\//, '').replace(/\/+$/, '');

  if (path === 'refresh') {
    // From the widget's ⋮ menu: pull from the sync server, refresh the widget,
    // then get out of the way.
    try {
      await syncNow();
    } catch {
      /* offline: still refresh from local data */
    }
    await applyWidgetActions();
    await pushWidget();
    await App.minimizeApp().catch(() => undefined);
    return;
  }

  if (path === 'add') {
    setView('today');
    selectTask(null);
    window.dispatchEvent(new Event(ADD_TASK_EVENT));
    return;
  }

  if (path.startsWith('task/')) {
    const id = decodeURIComponent(path.slice('task/'.length));
    if (!state.tasks[id]) {
      const match = OCCURRENCE_ID.exec(id);
      if (match) materialiseOccurrence(match[1]!, match[2]!);
    }
    if (state.tasks[id]) selectTask(id);
    return;
  }

  setView('today');
};

export const startWidgetSync = (): void => {
  if (!Capacitor.isNativePlatform()) return;

  void applyWidgetActions().then(pushWidget);

  createRoot(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    createEffect(() => {
      // Track everything the widget shows so any change re-pushes it.
      JSON.stringify([
        allTasks().map((task) => [task.id, task.title, task.isDone, task.dueDay, task.dueWithTime, task.parentId]),
        repeatConfigs().map((cfg) => [cfg.id, cfg.title, cfg.startTime, cfg.isPaused, cfg.deletedInstanceDates?.length]),
      ]);
      clearTimeout(timer);
      timer = setTimeout(() => void pushWidget(), 600);
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void applyWidgetActions().then(pushWidget);
  });
  // A new logical day changes what "today" means even if no task changed.
  setInterval(() => void pushWidget(), 15 * 60 * 1000);

  void App.addListener('appUrlOpen', ({ url }) => {
    if (url.startsWith('superprod://')) void handleDeepLink(url);
  });
  void App.getLaunchUrl().then((launch) => {
    if (launch?.url?.startsWith('superprod://')) void handleDeepLink(launch.url);
  });
};
