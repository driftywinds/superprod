import { describe, expect, it } from 'vitest';
import { buildWidgetModel } from '../src/domain/widget-model';
import { createTask } from '../src/domain/models';

const TODAY = '2026-11-12';
const t = (id: string, patch: Record<string, unknown> = {}) =>
  createTask({ id, title: id, projectId: 'INBOX', ...patch });
const noRepeats = () => [];

describe('buildWidgetModel', () => {
  it('lists today, all-day first then by time, and ignores done tasks and subtasks', () => {
    const model = buildWidgetModel({
      today: TODAY,
      tasks: [
        t('late', { dueWithTime: new Date('2026-11-12T15:30:00').getTime() }),
        t('early', { dueWithTime: new Date('2026-11-12T09:00:00').getTime() }),
        t('allday', { dueDay: TODAY }),
        t('done', { dueDay: TODAY, isDone: true }),
        t('sub', { dueDay: TODAY, parentId: 'allday' }),
        t('tomorrow', { dueDay: '2026-11-13' }),
      ],
      occurrences: noRepeats,
    });
    expect(model.title).toBe('Today');
    expect(model.rows.map((r) => r.text)).toEqual(['allday', 'early', 'late']);
    expect(model.rows[1]!.right).toBe('9:00am');
    expect(model.rows[2]!.right).toBe('3:30pm');
  });

  it('puts overdue first under its own heading', () => {
    const model = buildWidgetModel({
      today: TODAY,
      tasks: [t('old', { dueDay: '2026-11-10' }), t('now', { dueDay: TODAY })],
      occurrences: noRepeats,
    });
    expect(model.rows.map((r) => `${r.t}:${r.text}`)).toEqual(['h:Overdue', 'k:old', 'h:Today', 'k:now']);
    expect(model.rows[1]!.over).toBe(true);
  });

  it('rolls forward to the next days when today is empty', () => {
    const model = buildWidgetModel({
      today: TODAY,
      tasks: [t('b', { dueDay: '2026-11-14' }), t('a', { dueDay: '2026-11-13' })],
      occurrences: noRepeats,
    });
    expect(model.title).toBe('Upcoming');
    expect(model.rows.map((r) => `${r.t}:${r.text}`)).toEqual([
      'h:Tomorrow',
      'k:a',
      expect.stringMatching(/^h:Saturday/),
      'k:b',
    ]);
  });

  it('includes repeating occurrences that are not tasks yet, without duplicating real ones', () => {
    const model = buildWidgetModel({
      today: TODAY,
      tasks: [t('rpt_c_2026-11-12', { dueDay: TODAY })],
      occurrences: (day) => [
        { id: `rpt_c_${day}`, title: 'Paper', startMinutes: 540 },
        { id: `rpt_d_${day}`, title: 'Gym', startMinutes: null },
      ],
    });
    // `Paper` is the same occurrence as the real task, so it appears once.
    expect(model.rows.map((r) => r.text)).toEqual(['rpt_c_2026-11-12', 'Gym']);
  });

  it('stops adding future days once the widget is full and handles no tasks at all', () => {
    const tasks = Array.from({ length: 12 }, (_, i) => t(`x${i}`, { dueDay: `2026-11-${String(13 + (i % 6)).padStart(2, '0')}` }));
    const model = buildWidgetModel({ today: TODAY, tasks, occurrences: noRepeats, targetRows: 4 });
    expect(model.rows.filter((r) => r.t === 'k').length).toBeLessThanOrEqual(8);
    expect(buildWidgetModel({ today: TODAY, tasks: [], occurrences: noRepeats }).rows).toEqual([]);
  });
});
