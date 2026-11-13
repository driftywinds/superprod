import type { Task } from '../domain/models';
import type { ReminderConfig } from '../domain/config';

/**
 * Reminder scheduling.
 *
 * Kept pure so the firing rules can be tested without timers or a DOM:
 * given tasks, config and the set of already-fired keys, return what is due now.
 *
 * Rules inherited from upstream:
 * - `reminder.disableReminders` suppresses every reminder.
 * - `remindAt` fires task reminders; `deadlineRemindAt` fires deadline reminders.
 * - A reminder fires once per scheduled timestamp (the key includes the time,
 *   so snoozing — which writes a new `remindAt` — legitimately fires again).
 */

export const SNOOZE_MS = 10 * 60 * 1000;

export interface DueReminder {
  taskId: string;
  kind: 'task' | 'deadline';
  /** `remindAt`/`deadlineRemindAt` value that triggered this reminder. */
  at: number;
  dueAt: number;
  key: string;
}

export const reminderKey = (taskId: string, kind: 'task' | 'deadline', at: number): string =>
  `${taskId}:${kind}:${at}`;

export const findDueReminders = (
  tasks: readonly Task[],
  config: ReminderConfig,
  now: number,
  alreadyFired: ReadonlySet<string>,
): DueReminder[] => {
  if (config.disableReminders) return [];

  const due: DueReminder[] = [];

  for (const task of tasks) {
    if (task.isDone) continue;

    const candidates: { kind: 'task' | 'deadline'; at: number | null | undefined }[] = [
      { kind: 'task', at: task.remindAt },
      { kind: 'deadline', at: task.deadlineRemindAt },
    ];

    for (const candidate of candidates) {
      if (candidate.at == null) continue;
      if (candidate.at > now) continue;

      const key = reminderKey(task.id, candidate.kind, candidate.at);
      if (alreadyFired.has(key)) continue;

      due.push({
        taskId: task.id,
        kind: candidate.kind,
        at: candidate.at,
        // The moment the task itself is scheduled for, used in the body text.
        dueAt:
          candidate.kind === 'deadline'
            ? (task.deadlineWithTime ?? task.dueWithTime ?? candidate.at)
            : (task.dueWithTime ?? candidate.at),
        key,
      });
    }
  }

  return due;
};

export type NotificationPermissionState =
  | 'unsupported'
  | 'granted'
  | 'denied'
  | 'default';

export const notificationPermission = (): NotificationPermissionState => {
  if (!('Notification' in globalThis)) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
};

/* ------------------------------------------------- ahead-of-time scheduling */

export interface PlannedReminder {
  /** Stable key: the same reminder always yields the same key (and native id). */
  key: string;
  at: number;
  title: string;
  body: string;
  /** Task id — for a repeat occurrence that is not a task yet, its deterministic id. */
  taskId: string;
  /** Set for occurrences that must be created when the user acts on them. */
  cfgId?: string;
  day?: string;
}

const MAX_PLANNED = 60; // Android caps pending alarms per app; stay well under.
const HORIZON_MS = 14 * 86_400_000;

const clock = (at: number): string =>
  new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Everything that should fire in the future, soonest first.
 *
 * Android suspends the WebView when the app is closed, so a JS timer can never
 * deliver a reminder then. The OS alarm manager can — but only if the reminder
 * was handed to it ahead of time. This is that list.
 *
 * Covers: task reminders, deadline reminders, and timed repeating occurrences
 * that nobody has turned into a task yet (their start time is the reminder).
 */
export const planReminders = (
  tasks: readonly Task[],
  repeats: readonly {
    cfgId: string;
    title: string;
    day: string;
    taskId: string;
    at: number;
  }[],
  now: number,
  isDisabled: boolean,
): PlannedReminder[] => {
  if (isDisabled) return [];
  const planned: PlannedReminder[] = [];
  const limit = now + HORIZON_MS;

  for (const task of tasks) {
    if (task.isDone) continue;
    if (task.remindAt != null && task.remindAt > now && task.remindAt <= limit) {
      planned.push({
        key: reminderKey(task.id, 'task', task.remindAt),
        at: task.remindAt,
        title: task.title,
        body: `Scheduled for ${clock(task.dueWithTime ?? task.remindAt)}`,
        taskId: task.id,
      });
    }
    if (
      task.deadlineRemindAt != null &&
      task.deadlineRemindAt > now &&
      task.deadlineRemindAt <= limit
    ) {
      planned.push({
        key: reminderKey(task.id, 'deadline', task.deadlineRemindAt),
        at: task.deadlineRemindAt,
        title: `Deadline: ${task.title}`,
        body: `Deadline ${clock(task.deadlineWithTime ?? task.deadlineRemindAt)}`,
        taskId: task.id,
      });
    }
  }

  for (const repeat of repeats) {
    if (repeat.at <= now || repeat.at > limit) continue;
    planned.push({
      key: reminderKey(repeat.taskId, 'task', repeat.at),
      at: repeat.at,
      title: repeat.title,
      body: `Scheduled for ${clock(repeat.at)}`,
      taskId: repeat.taskId,
      cfgId: repeat.cfgId,
      day: repeat.day,
    });
  }

  return planned.sort((a, b) => a.at - b.at).slice(0, MAX_PLANNED);
};
