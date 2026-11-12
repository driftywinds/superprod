import { describe, expect, it } from 'vitest';
import { findDueReminders, reminderKey, SNOOZE_MS } from '../src/services/reminder-scheduler';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/domain/config';
import type { Task } from '../src/domain/models';
import { createTask } from '../src/domain/models';

const task = (overrides: Partial<Task>): Task =>
  createTask({ title: 't', projectId: 'INBOX', ...overrides });

const reminderConfig = (overrides: Partial<typeof DEFAULT_CONFIG.reminder> = {}) => ({
  ...DEFAULT_CONFIG.reminder,
  ...overrides,
});

describe('findDueReminders', () => {
  const now = 1_700_000_000_000;

  it('fires a reminder whose time has passed', () => {
    const t = task({ remindAt: now - 1000 });
    const due = findDueReminders([t], reminderConfig(), now, new Set());
    expect(due).toHaveLength(1);
    expect(due[0]?.kind).toBe('task');
  });

  it('does not fire a future reminder', () => {
    const t = task({ remindAt: now + 60_000 });
    expect(findDueReminders([t], reminderConfig(), now, new Set())).toHaveLength(0);
  });

  it('fires once per scheduled timestamp', () => {
    const t = task({ remindAt: now - 1000 });
    const fired = new Set([reminderKey(t.id, 'task', t.remindAt as number)]);
    expect(findDueReminders([t], reminderConfig(), now, fired)).toHaveLength(0);
  });

  it('skips done tasks', () => {
    const t = task({ remindAt: now - 1000, isDone: true });
    expect(findDueReminders([t], reminderConfig(), now, new Set())).toHaveLength(0);
  });

  it('respects the global disable switch', () => {
    const t = task({ remindAt: now - 1000 });
    expect(
      findDueReminders([t], reminderConfig({ disableReminders: true }), now, new Set()),
    ).toHaveLength(0);
  });

  it('fires deadline reminders separately', () => {
    const t = task({ deadlineDay: '2026-01-01', deadlineRemindAt: now - 500 });
    const due = findDueReminders([t], reminderConfig(), now, new Set());
    expect(due.map((d) => d.kind)).toEqual(['deadline']);
  });

  it('fires both a task and a deadline reminder', () => {
    const t = task({ remindAt: now - 10, deadlineRemindAt: now - 20 });
    const due = findDueReminders([t], reminderConfig(), now, new Set());
    expect(due).toHaveLength(2);
  });

  it('snoozing a task (new remindAt) fires again', () => {
    const t = task({ remindAt: now - 1000 });
    const fired = new Set([reminderKey(t.id, 'task', t.remindAt as number)]);
    const snoozed = { ...t, remindAt: now - 1000 + SNOOZE_MS };
    expect(findDueReminders([snoozed], reminderConfig(), now + SNOOZE_MS, fired)).toHaveLength(1);
  });
});

describe('config', () => {
  it('fills missing sections from defaults', () => {
    const config = normalizeConfig({ sound: { volume: 10 } });
    expect(config.sound.volume).toBe(10);
    expect(config.sound.doneSound).toBe(DEFAULT_CONFIG.sound.doneSound);
    expect(config.pomodoro.duration).toBe(DEFAULT_CONFIG.pomodoro.duration);
  });

  it('normalizes out-of-range values', () => {
    const config = normalizeConfig({ sound: { volume: 900 } });
    expect(config.sound.volume).toBe(100);
  });

  it('falls back on unknown enum values', () => {
    const config = normalizeConfig({ focusMode: { focusModeSound: 'thunder' } });
    expect(config.focusMode.focusModeSound).toBe('off');
  });

  it('survives garbage input', () => {
    expect(normalizeConfig(null).pomodoro.duration).toBe(DEFAULT_CONFIG.pomodoro.duration);
    expect(normalizeConfig('nope').sound.volume).toBe(DEFAULT_CONFIG.sound.volume);
  });

  it('keeps an unknown section value from clobbering siblings', () => {
    const config = normalizeConfig({ reminder: { notifyOnDueDate: false } });
    expect(config.reminder.notifyOnDueDate).toBe(false);
    expect(config.reminder.defaultTaskRemindOption).toBe('AtStart');
  });
});
