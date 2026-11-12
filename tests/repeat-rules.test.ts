import { describe, expect, it } from 'vitest';
import {
  describeRepeat,
  nextOccurrenceDay,
  occursOnDay,
  repeatDueWithTime,
  upcomingOccurrences,
  type TaskRepeatCfg,
} from '../src/domain/repeat';

const base: TaskRepeatCfg = {
  id: 'c',
  title: 'T',
  repeatCycle: 'DAILY',
  repeatEvery: 1,
  startDate: '2026-01-01',
};

describe('monthly', () => {
  it('clamps day 31 to the last day of shorter months', () => {
    const cfg: TaskRepeatCfg = { ...base, repeatCycle: 'MONTHLY', startDate: '2026-01-31' };
    expect(occursOnDay(cfg, '2026-01-31')).toBe(true);
    expect(occursOnDay(cfg, '2026-02-28')).toBe(true);
    expect(occursOnDay(cfg, '2026-02-27')).toBe(false);
    expect(occursOnDay(cfg, '2026-04-30')).toBe(true);
    expect(occursOnDay(cfg, '2026-03-31')).toBe(true);
  });

  it('anchors to the last day when asked', () => {
    const cfg: TaskRepeatCfg = { ...base, repeatCycle: 'MONTHLY', monthlyLastDay: true, startDate: '2026-01-05' };
    expect(occursOnDay(cfg, '2026-02-28')).toBe(true);
    expect(occursOnDay(cfg, '2026-12-31')).toBe(true);
    expect(occursOnDay(cfg, '2026-12-30')).toBe(false);
  });

  it('supports the nth weekday, including "last"', () => {
    const second: TaskRepeatCfg = { ...base, repeatCycle: 'MONTHLY', monthlyWeekOfMonth: 2, monthlyWeekday: 4 };
    // second Thursday of Nov 2026 is the 12th
    expect(occursOnDay(second, '2026-11-12')).toBe(true);
    expect(occursOnDay(second, '2026-11-05')).toBe(false);
    const last: TaskRepeatCfg = { ...base, repeatCycle: 'MONTHLY', monthlyWeekOfMonth: -1, monthlyWeekday: 1 };
    expect(occursOnDay(last, '2026-11-30')).toBe(true); // last Monday
    expect(occursOnDay(last, '2026-11-23')).toBe(false);
  });

  it('honours the month interval', () => {
    const cfg: TaskRepeatCfg = { ...base, repeatCycle: 'MONTHLY', repeatEvery: 3, startDate: '2026-01-10' };
    expect(occursOnDay(cfg, '2026-04-10')).toBe(true);
    expect(occursOnDay(cfg, '2026-03-10')).toBe(false);
  });
});

describe('yearly', () => {
  it('moves Feb 29 to Feb 28 in common years', () => {
    const cfg: TaskRepeatCfg = { ...base, repeatCycle: 'YEARLY', startDate: '2024-02-29' };
    expect(occursOnDay(cfg, '2028-02-29')).toBe(true);
    expect(occursOnDay(cfg, '2027-02-28')).toBe(true);
    expect(occursOnDay(cfg, '2027-03-01')).toBe(false);
  });
});

describe('end date, deleted instances, completion', () => {
  it('stops after repeatUntilDay (inclusive)', () => {
    const cfg = { ...base, repeatUntilDay: '2026-03-10' };
    expect(occursOnDay(cfg, '2026-03-10')).toBe(true);
    expect(occursOnDay(cfg, '2026-03-11')).toBe(false);
  });

  it('skips days whose instance was deleted', () => {
    const cfg = { ...base, deletedInstanceDates: ['2026-03-10'] };
    expect(occursOnDay(cfg, '2026-03-10')).toBe(false);
    expect(occursOnDay(cfg, '2026-03-11')).toBe(true);
  });

  it('counts from the last completion when repeatFromCompletionDate is set', () => {
    const cfg: TaskRepeatCfg = {
      ...base,
      repeatEvery: 3,
      repeatFromCompletionDate: true,
      lastTaskCreationDay: '2026-03-10',
    };
    expect(occursOnDay(cfg, '2026-03-13')).toBe(true);
    expect(occursOnDay(cfg, '2026-03-12')).toBe(false);
  });

  it('never repeats with an invalid interval', () => {
    expect(occursOnDay({ ...base, repeatEvery: 0 }, '2026-03-10')).toBe(false);
  });
});

describe('scanning', () => {
  it('finds the next and the upcoming occurrences', () => {
    const weekly: TaskRepeatCfg = {
      ...base,
      repeatCycle: 'WEEKLY',
      monday: true,
      wednesday: true,
      startDate: '2026-11-02',
    };
    expect(nextOccurrenceDay(weekly, '2026-11-12')).toBe('2026-11-16');
    expect(upcomingOccurrences(weekly, '2026-11-12', 3)).toEqual(['2026-11-16', '2026-11-18', '2026-11-23']);
    expect(nextOccurrenceDay({ ...weekly, repeatUntilDay: '2026-11-13' }, '2026-11-12')).toBeNull();
  });

  it('includes the start day when inclusive', () => {
    expect(nextOccurrenceDay(base, '2026-11-12', { inclusive: true })).toBe('2026-11-12');
  });
});

describe('time of day', () => {
  it('places a clock time on the logical day', () => {
    const at = new Date(repeatDueWithTime('09:30', '2026-11-12'));
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([12, 9, 30]);
  });

  it('puts times before the day-start offset on the next calendar day', () => {
    const at = new Date(repeatDueWithTime('01:00', '2026-11-12', 4 * 60));
    expect([at.getDate(), at.getHours()]).toEqual([13, 1]);
  });
});

describe('description', () => {
  it('summarises common schedules', () => {
    expect(describeRepeat({ ...base })).toBe('Every day');
    expect(
      describeRepeat({ ...base, repeatCycle: 'WEEKLY', monday: true, tuesday: true, wednesday: true, thursday: true, friday: true }),
    ).toBe('Every weekday');
    expect(describeRepeat({ ...base, repeatEvery: 2, startTime: '08:00' })).toBe('Every 2 days at 08:00');
  });
});
