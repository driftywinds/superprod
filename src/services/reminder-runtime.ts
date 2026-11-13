import { createEffect, onCleanup } from 'solid-js';
import { config } from '../state/config-store';
import { App } from '@capacitor/app';
import { allTasks, materialiseOccurrence, state, toggleDone, updateTask } from '../state/store';
import { notifications, buildTaskNotification } from './notifications';
import { SNOOZE_MS, findDueReminders } from './reminder-scheduler';
import { toDayStr } from '../domain/models';
import { logger } from './logger';

/**
 * Wires reminders to the notification service and to task actions.
 *
 * A single interval checks for due reminders; the fired keys are persisted so a
 * reload does not re-notify for the same timestamp.
 */
const FIRED_KEY = 'superprod.reminders.fired.v1';
const CHECK_INTERVAL_MS = 20_000;

const loadFired = (): Set<string> => {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
};

const fired = loadFired();

const persistFired = () => {
  try {
    // Keep the set bounded; reminders older than a day cannot fire again.
    localStorage.setItem(FIRED_KEY, JSON.stringify([...fired].slice(-500)));
  } catch {
    // Non-fatal: worst case a reminder fires twice after a reload.
  }
};

const timeLabel = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export const startReminderLoop = (): (() => void) => {
  /**
   * Send the app back to where the user was after a notification button.
   *
   * Deferred: the activity is often still starting when the action arrives, and
   * minimising it at that moment tore the app down on some devices.
   */
  const returnToBackground = (): void => {
    if (notifications.transport !== 'native') return;
    setTimeout(() => {
      void App.minimizeApp().catch((error: unknown) => {
        logger.warn('reminders', 'could not minimise after action', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, 400);
  };

  const handleAction = async (event: Parameters<Parameters<typeof notifications.onAction>[0]>[0]): Promise<void> => {
    const taskId = event.data.taskId;
    if (!taskId) return;

    // A repeating occurrence that was only scheduled, not created yet.
    if (!state.tasks[taskId] && event.data.cfgId && event.data.day) {
      materialiseOccurrence(event.data.cfgId, event.data.day);
    }
    const task = state.tasks[taskId];
    if (!task) return;

    if (event.action === 'done') {
      if (!task.isDone) toggleDone(taskId);
      await notifications.close(`task-${taskId}`);
      returnToBackground();
      return;
    }

    if (event.action === 'snooze') {
      const snoozedUntil = Date.now() + SNOOZE_MS;
      // The scheduler (reminder-sync) picks the new `remindAt` up and registers
      // the alarm with the OS; the web path fires it from the timer below.
      updateTask(taskId, { remindAt: snoozedUntil });
      await notifications.close(`task-${taskId}`);
      if (notifications.transport === 'web') {
        await notifications.notify(
          buildTaskNotification(
            taskId,
            `Snoozed: ${task.title}`,
            `We will remind you again at ${timeLabel(snoozedUntil)}.`,
          ),
        );
      }
      returnToBackground();
      return;
    }
  };

  const disposeAction = notifications.onAction(async (event) => {
    try {
      await handleAction(event);
    } catch (error) {
      // A notification button must never take the app down, whatever the state.
      logger.error('reminders', 'notification action failed', {
        action: event.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const tick = async () => {
    if (config.reminder.disableReminders) return;
    // On Android the OS alarm manager delivers reminders (reminder-sync.ts); a
    // timer here would fire them a second time while the app is open.
    if (notifications.transport === 'native') return;

    const due = findDueReminders(allTasks(), config.reminder, Date.now(), fired);
    for (const reminder of due) {
      fired.add(reminder.key);

      const task = state.tasks[reminder.taskId];
      if (!task) continue;

      const isDeadline = reminder.kind === 'deadline';
      const when = reminder.dueAt > Date.now() ? timeLabel(reminder.dueAt) : 'now';
      await notifications.notify(
        buildTaskNotification(
          task.id,
          isDeadline ? `Deadline: ${task.title}` : task.title,
          isDeadline
            ? `Deadline ${when}. ${task.projectId ? '' : ''}`
            : `Scheduled for ${when}. ${toDayStr(new Date(reminder.dueAt))}`,
        ),
      );
    }

    if (due.length > 0) persistFired();
  };

  const interval = setInterval(() => void tick(), CHECK_INTERVAL_MS);
  void tick();

  onCleanup(() => clearInterval(interval));

  return () => {
    clearInterval(interval);
    disposeAction();
  };
};

/** Keep the app title in sync with tracking, like the upstream browser title. */
export const startTitleSync = (): void => {
  createEffect(() => {
    const done = allTasks().filter((task) => task.isDone).length;
    document.title = done > 0 ? `superprod (${done} done)` : 'superprod';
  });
};
