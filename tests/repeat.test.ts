import { describe, expect, it } from 'vitest';
import {
  instanceId,
  occursOnDay,
  projectDay,
  projectOccurrence,
  timeToMinutes,
  type TaskRepeatCfg,
} from '../src/domain/repeat';

/**
 * Fixture copied from a real SuperSync account: the repeating task "Paper" in
 * project MAIN TIME, every weekday at 09:00 from 2026-10-21.
 *
 * Before this module existed, a freshly synced device showed nothing for future
 * days, because upstream only materialises `rpt_<cfg>_<day>` instances as they
 * are created locally.
 */
const PAPER: TaskRepeatCfg = {
  id: 'q6LbsU2yEjIDy_qEm1Eyd',
  title: 'Paper',
  projectId: '1T9BqRMnj7MNkZzeBqp7p',
  startTime: '09:00',
  startDate: '2026-10-21',
  repeatEvery: 1,
  remindAt: 'AtStart',
  isPaused: false,
  quickSetting: 'DAILY',
  repeatCycle: 'DAILY',
  repeatFromCompletionDate: false,
  waitForCompletion: false,
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: false,
  sunday: false,
  tagIds: [],
  order: 0,
  skipOverdue: true,
  defaultEstimate: 0,
};

describe('repeat occurrences', () => {
  it('appears on weekdays after the start date', () => {
    expect(occursOnDay(PAPER, '2026-11-12')).toBe(true); // Thursday
    expect(occursOnDay(PAPER, '2026-11-13')).toBe(true); // Friday
    expect(occursOnDay(PAPER, '2026-11-16')).toBe(true); // next Monday
  });

  it('fires on weekends too, because DAILY ignores weekday flags', () => {
    // Upstream's DAILY branch only checks the day interval; saturday:false and
    // sunday:false are ignored unless the cycle is WEEKLY.
    expect(occursOnDay(PAPER, '2026-11-14')).toBe(true); // Saturday
    expect(occursOnDay(PAPER, '2026-11-15')).toBe(true); // Sunday
  });

  it('honours weekday flags for WEEKLY cycles', () => {
    const weekly: TaskRepeatCfg = { ...PAPER, repeatCycle: 'WEEKLY' };
    expect(occursOnDay(weekly, '2026-11-14')).toBe(false); // Saturday
    expect(occursOnDay(weekly, '2026-11-16')).toBe(true); // Monday
  });

  it('never occurs before the start date', () => {
    expect(occursOnDay(PAPER, '2026-10-20')).toBe(false);
    expect(occursOnDay(PAPER, '2026-10-21')).toBe(true);
  });

  it('stops when paused', () => {
    expect(occursOnDay({ ...PAPER, isPaused: true }, '2026-11-12')).toBe(false);
  });

  it('honours the daily interval when repeatEvery is greater than one', () => {
    expect(occursOnDay({ ...PAPER, repeatEvery: 3 }, '2026-10-22')).toBe(false);
    expect(occursOnDay({ ...PAPER, repeatEvery: 3 }, '2026-10-24')).toBe(true);
  });

  it('honours weekly intervals', () => {
    const weekly: TaskRepeatCfg = { ...PAPER, repeatCycle: 'WEEKLY', repeatEvery: 2 };
    // 2026-10-21 is a Wednesday and is the start week.
    expect(occursOnDay(weekly, '2026-10-21')).toBe(true);
    expect(occursOnDay(weekly, '2026-10-28')).toBe(false);
    expect(occursOnDay(weekly, '2026-11-04')).toBe(true);
  });

  it('honours monthly and yearly cycles', () => {
    const monthly: TaskRepeatCfg = { ...PAPER, repeatCycle: 'MONTHLY', repeatEvery: 1 };
    expect(occursOnDay(monthly, '2026-11-21')).toBe(true);
    expect(occursOnDay(monthly, '2026-11-22')).toBe(false);

    const yearly: TaskRepeatCfg = { ...PAPER, repeatCycle: 'YEARLY', repeatEvery: 1 };
    expect(occursOnDay(yearly, '2027-10-21')).toBe(true);
    expect(occursOnDay(yearly, '2027-10-22')).toBe(false);
  });
});

describe('projection output', () => {
  it('carries the title, project, time and instance id', () => {
    const occurrence = projectOccurrence(PAPER, '2026-11-12');
    expect(occurrence).toMatchObject({
      id: instanceId(PAPER.id, '2026-11-12'),
      title: 'Paper',
      projectId: '1T9BqRMnj7MNkZzeBqp7p',
      startMinutes: 540,
    });
    expect(occurrence?.id).toBe(`rpt_${PAPER.id}_2026-11-12`);
  });

  it('returns nothing before the start date', () => {
    expect(projectOccurrence(PAPER, '2026-10-20')).toBeNull();
  });

  it('sorts timed occurrences by start time', () => {
    const evening: TaskRepeatCfg = { ...PAPER, id: 'evening', startTime: '21:00' };
    const morning: TaskRepeatCfg = { ...PAPER, id: 'morning', startTime: '07:00' };
    const day = projectDay([evening, morning], '2026-11-12');
    expect(day.map((entry) => entry.startMinutes)).toEqual([420, 1260]);
  });

  it('parses times and ignores junk', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes(null)).toBeNull();
    expect(timeToMinutes('not-a-time')).toBeNull();
  });
});
