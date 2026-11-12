import { createEffect, onCleanup } from 'solid-js';
import { config } from '../state/config-store';
import { allTasks, state, toggleDone, updateTask } from '../state/store';
import { notifications, buildTaskNotification } from './notifications';
import { SNOOZE_MS, findDueReminders } from './reminder-scheduler';
import { toDayStr } from '../domain/models';

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
  const disposeAction = notifications.onAction(async (event) => {
    const taskId = event.data.taskId;
    if (!taskId) return;

    if (event.action === 'done') {
      toggleDone(taskId);
      await notifications.close(`task-${taskId}`);
      return;
    }

    if (event.action === 'snooze') {
      const task = state.tasks[taskId];
      if (!task) return;
      const snoozedUntil = Date.now() + SNOOZE_MS;
      updateTask(taskId, { remindAt: snoozedUntil });
      // Re-open immediately: the snoozed reminder is the next thing the user sees.
      await notifications.notify(
        buildTaskNotification(
          taskId,
          `Snoozed: ${task.title}`,
          `We will remind you again at ${timeLabel(snoozedUntil)}.`,
        ),
      );
      return;
    }

    if (event.action === 'open') {
      updateTask(taskId, {});
    }
  });

  const tick = async () => {
    if (config.reminder.disableReminders) return;

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
