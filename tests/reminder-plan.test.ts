import { describe, expect, it } from 'vitest';
import { planReminders } from '../src/services/reminder-scheduler';
import { createTask } from '../src/domain/models';

const NOW = new Date('2026-11-12T10:00:00').getTime();
const H = 3_600_000;

const task = (id: string, patch: Record<string, unknown> = {}) =>
  createTask({ id, title: id, projectId: 'INBOX', ...patch });

describe('planReminders', () => {
  it('plans future task and deadline reminders, soonest first', () => {
    const plan = planReminders(
      [task('late', { remindAt: NOW + 5 * H }), task('soon', { remindAt: NOW + H, deadlineRemindAt: NOW + 3 * H })],
      [],
      NOW,
      false,
    );
    expect(plan.map((p) => p.taskId)).toEqual(['soon', 'soon', 'late']);
    expect(plan[1]!.title).toBe('Deadline: soon');
  });

  it('skips done tasks, past reminders and anything beyond two weeks', () => {
    const plan = planReminders(
      [
        task('done', { isDone: true, remindAt: NOW + H }),
        task('past', { remindAt: NOW - H }),
        task('far', { remindAt: NOW + 20 * 24 * H }),
      ],
      [],
      NOW,
      false,
    );
    expect(plan).toEqual([]);
  });

  it('plans timed repeat occurrences that are not tasks yet', () => {
    const plan = planReminders(
      [],
      [{ cfgId: 'c', title: 'Paper', day: '2026-11-13', taskId: 'rpt_c_2026-11-13', at: NOW + 23 * H }],
      NOW,
      false,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ taskId: 'rpt_c_2026-11-13', cfgId: 'c', day: '2026-11-13', title: 'Paper' });
  });

  it('gives the same key for the same reminder, and a new key after a snooze', () => {
    const a = planReminders([task('t', { remindAt: NOW + H })], [], NOW, false)[0]!;
    const b = planReminders([task('t', { remindAt: NOW + H })], [], NOW, false)[0]!;
    const snoozed = planReminders([task('t', { remindAt: NOW + 2 * H })], [], NOW, false)[0]!;
    expect(a.key).toBe(b.key);
    expect(snoozed.key).not.toBe(a.key);
  });

  it('plans nothing when reminders are disabled and caps the list', () => {
    expect(planReminders([task('t', { remindAt: NOW + H })], [], NOW, true)).toEqual([]);
    const many = Array.from({ length: 100 }, (_, i) => task(`t${i}`, { remindAt: NOW + (i + 1) * 60_000 }));
    expect(planReminders(many, [], NOW, false)).toHaveLength(60);
  });
});
