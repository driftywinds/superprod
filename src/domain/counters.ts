import { toDayStr } from './models';

/**
 * Simple counters / habits, mirroring upstream `SimpleCounter`
 * (FEATURES.md §6.1). Types keep upstream's exact strings.
 */
export type SimpleCounterType = 'StopWatch' | 'ClickCounter' | 'RepeatedCountdownReminder';

export type StreakMode = 'specific-days' | 'weekly-frequency';

export interface SimpleCounter {
  id: string;
  title: string;
  isEnabled: boolean;
  isHideButton?: boolean;
  icon: string | null;
  type: SimpleCounterType;
  isTrackStreaks?: boolean;
  streakMinValue?: number;
  streakMode?: StreakMode;
  /** `0` = Sunday … `6` = Saturday. */
  streakWeekDays?: Record<number, boolean>;
  streakWeeklyFrequency?: number;
  countdownDuration?: number;
  countOnDay: Record<string, number>;
  isOn: boolean;
}

export const createCounter = (
  title: string,
  overrides: Partial<SimpleCounter> = {},
): SimpleCounter => ({
  id: `c-${crypto.randomUUID()}`,
  title: title.trim() || 'Habit',
  isEnabled: true,
  icon: 'sparkle',
  type: 'ClickCounter',
  isTrackStreaks: true,
  streakMinValue: 1,
  streakMode: 'weekly-frequency',
  streakWeekDays: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 0: true },
  streakWeeklyFrequency: 3,
  countOnDay: {},
  isOn: false,
  ...overrides,
});

export const countForDay = (counter: SimpleCounter, day = toDayStr()): number =>
  counter.countOnDay[day] ?? 0;

/**
 * Streak length in days, counting back from today.
 *
 * A day counts when its value reaches `streakMinValue`. In `weekly-frequency`
 * mode a day is only required on days that are part of the streak window, so
 * three sessions across a week still form a streak — matching upstream's
 * "weekly frequency" intent rather than a strict daily chain.
 */
export const counterStreak = (counter: SimpleCounter, minValue = 1): number => {
  const days = 365;
  const today = new Date();
  let streak = 0;

  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const day = toDayStr(date);
    const value = counter.countOnDay[day] ?? 0;

    if (value >= minValue) {
      streak += 1;
      continue;
    }

    if (offset === 0) continue; // today can still be completed

    if (counter.streakMode === 'specific-days') {
      const weekday = date.getDay();
      if (counter.streakWeekDays?.[weekday] === false) continue;
    }

    break;
  }

  return streak;
};

export const incrementCounter = (counter: SimpleCounter, day = toDayStr()): SimpleCounter => ({
  ...counter,
  countOnDay: { ...counter.countOnDay, [day]: (counter.countOnDay[day] ?? 0) + 1 },
});

export const decrementCounter = (counter: SimpleCounter, day = toDayStr()): SimpleCounter => {
  const next = Math.max(0, (counter.countOnDay[day] ?? 0) - 1);
  return { ...counter, countOnDay: { ...counter.countOnDay, [day]: next } };
};
