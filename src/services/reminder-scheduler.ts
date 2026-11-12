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
