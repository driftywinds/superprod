import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { createEffect, createRoot } from 'solid-js';
import { config } from '../state/config-store';
import { allTasks, repeatConfigs, state } from '../state/store';
import { notifications, numericNotificationId, toScheduledNotification } from './notifications';
import { planReminders, type PlannedReminder } from './reminder-scheduler';
import { instanceId, nextOccurrenceDay, repeatDueWithTime } from '../domain/repeat';
import { getDayStartMinutes, todayStr } from '../domain/models';

/**
 * Hands every future reminder to Android's alarm manager so it fires with the
 * app closed. Re-runs (debounced) whenever tasks, repeat rules or the reminder
 * setting change, and reconciles against what is already pending: new reminders
 * are scheduled, stale ones cancelled. Native only — the web build keeps its
 * in-page timer (see reminder-runtime.ts).
 */

const DEBOUNCE_MS = 800;

/** Timed occurrences of each repeat over the next few days that are not tasks yet. */
const upcomingRepeatOccurrences = (now: number) => {
  const result: { cfgId: string; title: string; day: string; taskId: string; at: number }[] = [];
  for (const cfg of repeatConfigs()) {
    if (cfg.isPaused || !cfg.startTime || !cfg.title?.trim() || !cfg.remindAt) continue;
    let day = nextOccurrenceDay(cfg, todayStr(new Date(now)), { inclusive: true });
    for (let i = 0; day && i < 4; i += 1) {
      const taskId = instanceId(cfg.id, day);
      const at = repeatDueWithTime(cfg.startTime, day, getDayStartMinutes());
      // Once an instance exists, its own `remindAt` covers it.
      if (!state.tasks[taskId]) {
        result.push({ cfgId: cfg.id, title: cfg.title.trim(), day, taskId, at });
      }
      day = nextOccurrenceDay(cfg, day);
    }
  }
  return result;
};

let running = false;
let queued = false;

const reconcile = async (): Promise<void> => {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    const now = Date.now();
    const wanted: PlannedReminder[] = planReminders(
      allTasks(),
      upcomingRepeatOccurrences(now),
      now,
      config.reminder.disableReminders === true,
    );

    const permission = await notifications.ensurePermission();
    if (permission.outcome !== 'granted') return;

    const wantedIds = new Map(wanted.map((reminder) => [numericNotificationId(reminder.key), reminder]));
    const pending = await LocalNotifications.getPending();
    const pendingIds = new Set(pending.notifications.map((entry) => entry.id));

    const stale = [...pendingIds].filter((id) => !wantedIds.has(id));
    if (stale.length > 0) {
      await LocalNotifications.cancel({ notifications: stale.map((id) => ({ id })) });
    }

    const missing = [...wantedIds.entries()].filter(([id]) => !pendingIds.has(id));
    if (missing.length > 0) {
      await LocalNotifications.schedule({
        notifications: missing.map(([id, reminder]) => toScheduledNotification(id, reminder)),
      });
    }
  } catch {
    // Scheduling is best-effort; the next change retries it.
  } finally {
    running = false;
    if (queued) {
      queued = false;
      void reconcile();
    }
  }
};

export const startReminderScheduling = (): void => {
  if (!Capacitor.isNativePlatform()) return;

  createRoot(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    createEffect(() => {
      // Read everything the plan depends on so the effect re-runs on any change.
      JSON.stringify([
        allTasks().map((task) => [task.id, task.isDone, task.remindAt, task.deadlineRemindAt]),
        repeatConfigs().map((cfg) => [cfg.id, cfg.startTime, cfg.isPaused, cfg.startDate, cfg.repeatCycle]),
        config.reminder.disableReminders,
        Object.keys(state.tasks).length,
      ]);
      clearTimeout(timer);
      timer = setTimeout(() => void reconcile(), DEBOUNCE_MS);
    });
  });

  // Also re-plan when the app comes back, and once a day boundary has passed.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void reconcile();
  });
  setInterval(() => void reconcile(), 6 * 60 * 60 * 1000);
};
