import { toDayStr } from './models';

/**
 * Repeating tasks, mirroring upstream's `TaskRepeatCfg`
 * (`features/task-repeat-cfg`, verified against `get-next-repeat-occurrence`,
 * `get-newest-possible-due-date`, `recurrence-date.util` and
 * `get-nth-weekday-of-month.util`).
 *
 * Instance tasks are materialised by the client as `rpt_<cfgId>_<YYYY-MM-DD>`,
 * so a client that only reads the server never sees future occurrences: they do
 * not exist as tasks until some client generates them. Planner, schedule and
 * Today therefore project occurrences from the configs themselves, and a
 * projection turns into a real task the moment the user acts on it.
 *
 * All date maths below happens on *noon* local dates so DST never shifts a day.
 */

export type RepeatCycle = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type RepeatQuickSetting =
  | 'DAILY'
  | 'WEEKLY_CURRENT_WEEKDAY'
  | 'MONTHLY_CURRENT_DATE'
  | 'MONTHLY_FIRST_DAY'
  | 'MONTHLY_LAST_DAY'
  | 'MONTHLY_NTH_WEEKDAY'
  | 'MONDAY_TO_FRIDAY'
  | 'YEARLY_CURRENT_DATE'
  | 'CUSTOM';
export type RemindAt = 'AtStart' | 'BeforeStart' | string;

/** 1..4 = first..fourth, -1 = last. */
export type MonthlyWeekOfMonth = 1 | 2 | 3 | 4 | -1;
export type MonthlyWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SubTaskTemplate {
  title: string;
  timeEstimate?: number;
  notes?: string;
}

export interface TaskRepeatCfg {
  id: string;
  title?: string | null;
  projectId?: string | null;
  tagIds?: string[];
  defaultEstimate?: number;
  priority?: 1 | 2 | 3 | null;
  startTime?: string | null;
  remindAt?: RemindAt;
  /** Local `YYYY-MM-DD`; when unset the schedule counts from 1970-01-01. */
  startDate?: string;
  /** Inclusive last day an occurrence may fall on; unset repeats forever. */
  repeatUntilDay?: string;
  repeatEvery?: number;
  repeatCycle: RepeatCycle;
  quickSetting?: RepeatQuickSetting;
  isPaused?: boolean;
  monday?: boolean;
  tuesday?: boolean;
  wednesday?: boolean;
  thursday?: boolean;
  friday?: boolean;
  saturday?: boolean;
  sunday?: boolean;
  monthlyWeekOfMonth?: MonthlyWeekOfMonth;
  monthlyWeekday?: MonthlyWeekday;
  monthlyLastDay?: boolean;
  lastTaskCreation?: number;
  lastTaskCreationDay?: string;
  repeatFromCompletionDate?: boolean;
  waitForCompletion?: boolean;
  skipOverdue?: boolean;
  shouldInheritSubtasks?: boolean;
  disableAutoUpdateSubtasks?: boolean;
  notes?: string;
  order?: number;
  subTaskTemplates?: SubTaskTemplate[];
  /** Days whose instance the user deleted; never regenerated. */
  deletedInstanceDates?: string[];
}

export const REPEAT_WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export const isWeekdayEnabled = (cfg: TaskRepeatCfg, weekday: number): boolean =>
  cfg[REPEAT_WEEKDAY_KEYS[weekday] ?? 'monday'] === true;

/** True when at least one weekday is selected. */
export const hasWeekdaySelection = (cfg: TaskRepeatCfg): boolean =>
  REPEAT_WEEKDAY_KEYS.some((key) => cfg[key] === true);

export const instanceId = (cfgId: string, day: string): string => `rpt_${cfgId}_${day}`;
export const instanceSubTaskId = (parentId: string, index: number): string =>
  `${parentId}_sub_${index}`;

/* ------------------------------------------------------------ date helpers */

/** Noon on the given local `YYYY-MM-DD`. */
const noon = (day: string): Date => {
  const [y, m, d] = day.split('-').map((part) => Number(part));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
};

const diffInDays = (a: Date, b: Date): number => {
  const from = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const to = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
};

const diffInWeeks = (a: Date, b: Date): number => Math.floor(diffInDays(a, b) / 7);

const diffInMonths = (a: Date, b: Date): number =>
  (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

const daysInMonth = (year: number, month: number): number =>
  new Date(year, month + 1, 0).getDate();

const onCycle = (diff: number, every: number): boolean => diff >= 0 && diff % every === 0;

/** The `n`-th (or last, `-1`) `weekday` of a month, at noon. */
export const nthWeekdayOfMonth = (
  year: number,
  month: number,
  weekday: MonthlyWeekday,
  n: MonthlyWeekOfMonth,
): Date => {
  if (n === -1) {
    const result = new Date(year, month + 1, 0, 12);
    result.setDate(result.getDate() - ((result.getDay() - weekday + 7) % 7));
    return result;
  }
  const first = new Date(year, month, 1, 12);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7, 12);
};

export const hasNthWeekdayAnchor = (cfg: TaskRepeatCfg): boolean => {
  const w = cfg.monthlyWeekOfMonth;
  const d = cfg.monthlyWeekday;
  return (
    Number.isInteger(w) &&
    (w === -1 || (w! >= 1 && w! <= 4)) &&
    Number.isInteger(d) &&
    d! >= 0 &&
    d! <= 6
  );
};

/** After completion the schedule counts from the last completion (#11266). */
const effectiveStartDay = (cfg: TaskRepeatCfg): string => {
  if (
    cfg.repeatFromCompletionDate &&
    cfg.lastTaskCreationDay &&
    (cfg.startDate ?? '') <= cfg.lastTaskCreationDay
  ) {
    return cfg.lastTaskCreationDay;
  }
  return cfg.startDate || '1970-01-01';
};

export const hasValidRepeatEvery = (cfg: TaskRepeatCfg): boolean =>
  Number.isInteger(cfg.repeatEvery ?? 1) && (cfg.repeatEvery ?? 1) >= 1;

/* --------------------------------------------------------- occurrence rules */

/**
 * Does this config produce an occurrence on `day`?
 *
 * Rules, as upstream applies them:
 * - paused configs, days past `repeatUntilDay` and deleted instances: never
 * - nothing before the (effective) start date
 * - DAILY is purely `daysSinceStart % repeatEvery === 0` and ignores weekday
 *   flags; WEEKLY gates on them
 * - MONTHLY anchors to the start day-of-month (clamped to short months), the
 *   last day of the month, or the Nth weekday of the month
 * - YEARLY anchors to the start month/day (Feb 29 falls on Feb 28 off-leap)
 */
export const occursOnDay = (cfg: TaskRepeatCfg, day: string): boolean => {
  if (cfg.isPaused) return false;
  if (!hasValidRepeatEvery(cfg)) return false;
  if (cfg.repeatUntilDay && day > cfg.repeatUntilDay) return false;
  if (cfg.deletedInstanceDates?.includes(day)) return false;

  const target = noon(day);
  const start = noon(effectiveStartDay(cfg));
  if (target < start) return false;

  const every = cfg.repeatEvery ?? 1;

  switch (cfg.repeatCycle) {
    case 'DAILY':
      return onCycle(diffInDays(start, target), every);

    case 'WEEKLY':
      return (
        isWeekdayEnabled(cfg, target.getDay()) && onCycle(diffInWeeks(start, target), every)
      );

    case 'MONTHLY': {
      if (!onCycle(diffInMonths(start, target), every)) return false;
      if (hasNthWeekdayAnchor(cfg)) {
        const candidate = nthWeekdayOfMonth(
          target.getFullYear(),
          target.getMonth(),
          cfg.monthlyWeekday as MonthlyWeekday,
          cfg.monthlyWeekOfMonth as MonthlyWeekOfMonth,
        );
        return candidate.getDate() === target.getDate();
      }
      const wanted = cfg.monthlyLastDay ? 31 : start.getDate();
      return (
        target.getDate() === Math.min(wanted, daysInMonth(target.getFullYear(), target.getMonth()))
      );
    }

    case 'YEARLY': {
      if (!onCycle(target.getFullYear() - start.getFullYear(), every)) return false;
      if (target.getMonth() !== start.getMonth()) return false;
      return (
        target.getDate() ===
        Math.min(start.getDate(), daysInMonth(target.getFullYear(), target.getMonth()))
      );
    }

    default:
      return false;
  }
};

const addDaysStr = (day: string, delta: number): string => {
  const date = noon(day);
  date.setDate(date.getDate() + delta);
  return toDayStr(date);
};

/**
 * First occurrence strictly after `fromDay` (or on it when `inclusive`), within
 * roughly two years. Scans day by day, which is cheap and keeps every rule in
 * `occursOnDay` the single source of truth.
 */
export const nextOccurrenceDay = (
  cfg: TaskRepeatCfg,
  fromDay: string,
  options: { inclusive?: boolean; maxDays?: number } = {},
): string | null => {
  const limit = options.maxDays ?? 366 * 2;
  let cursor = options.inclusive ? fromDay : addDaysStr(fromDay, 1);
  for (let i = 0; i < limit; i++) {
    if (occursOnDay(cfg, cursor)) return cursor;
    cursor = addDaysStr(cursor, 1);
  }
  return null;
};

/** The next `count` occurrences — what the editor previews. */
export const upcomingOccurrences = (
  cfg: TaskRepeatCfg,
  fromDay: string,
  count: number,
  options: { inclusive?: boolean } = {},
): string[] => {
  const days: string[] = [];
  let cursor = nextOccurrenceDay(cfg, fromDay, { inclusive: options.inclusive });
  while (cursor && days.length < count) {
    days.push(cursor);
    cursor = nextOccurrenceDay(cfg, cursor);
  }
  return days;
};

/* -------------------------------------------------------------- projection */

export interface ProjectedOccurrence {
  /** Stable virtual id: `rpt_<cfgId>_<day>`. */
  id: string;
  cfgId: string;
  day: string;
  title: string;
  projectId: string;
  /** Minutes since midnight, when the config pins a start time. */
  startMinutes: number | null;
  estimateMs: number;
  isProjection: true;
}

export const timeToMinutes = (time: string | null | undefined): number | null => {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map((part) => Number(part));
  if (hours === undefined || Number.isNaN(hours)) return null;
  const mins = minutes === undefined || Number.isNaN(minutes) ? 0 : minutes;
  return hours * 60 + mins;
};

export const minutesToTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Epoch ms of a repeat's `startTime` on a logical day. A clock time earlier
 * than the start-of-next-day offset belongs to the late night of that logical
 * day, so it lands on the next calendar day (upstream `getRepeatDueWithTime`).
 */
export const repeatDueWithTime = (
  startTime: string,
  day: string,
  startOfNextDayMinutes = 0,
): number => {
  const minutes = timeToMinutes(startTime) ?? 0;
  const date = noon(day);
  if (minutes < startOfNextDayMinutes) date.setDate(date.getDate() + 1);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date.getTime();
};

/** Project the occurrence of one config that falls on `day`. */
export const projectOccurrence = (
  cfg: TaskRepeatCfg,
  day: string,
): ProjectedOccurrence | null => {
  if (!occursOnDay(cfg, day)) return null;
  const title = cfg.title?.trim();
  if (!title) return null;

  return {
    id: instanceId(cfg.id, day),
    cfgId: cfg.id,
    day,
    title,
    projectId: cfg.projectId ?? 'INBOX',
    startMinutes: timeToMinutes(cfg.startTime),
    estimateMs: cfg.defaultEstimate ?? 0,
    isProjection: true,
  };
};

/** All occurrences across configs for one day; all-day first, timed by start. */
export const projectDay = (
  configs: readonly TaskRepeatCfg[],
  day: string,
): ProjectedOccurrence[] =>
  configs
    .map((cfg) => projectOccurrence(cfg, day))
    .filter((value): value is ProjectedOccurrence => value !== null)
    .sort((a, b) => (a.startMinutes ?? -1) - (b.startMinutes ?? -1));

export const todayKey = (): string => toDayStr();

/* ------------------------------------------------------------ describing */

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDINALS: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third', '4': 'fourth', '-1': 'last' };

/** "Every weekday", "Every 2 weeks on Mon, Wed" — the one-line summary. */
export const describeRepeat = (cfg: TaskRepeatCfg): string => {
  const every = cfg.repeatEvery ?? 1;
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[cfg.repeatCycle];
  const base = every === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`;
  let text = base;

  if (cfg.repeatCycle === 'WEEKLY') {
    const days = REPEAT_WEEKDAY_KEYS.map((_, i) => i)
      .filter((i) => isWeekdayEnabled(cfg, i))
      .map((i) => WEEKDAY_NAMES[i]);
    if (days.length === 5 && !isWeekdayEnabled(cfg, 0) && !isWeekdayEnabled(cfg, 6) && every === 1) {
      text = 'Every weekday';
    } else if (days.length > 0) {
      text = `${base} on ${days.join(', ')}`;
    }
  } else if (cfg.repeatCycle === 'MONTHLY') {
    if (hasNthWeekdayAnchor(cfg)) {
      text = `${base} on the ${ORDINALS[String(cfg.monthlyWeekOfMonth)]} ${
        WEEKDAY_NAMES[cfg.monthlyWeekday as number]
      }`;
    } else if (cfg.monthlyLastDay) {
      text = `${base} on the last day`;
    }
  }

  if (cfg.startTime) text += ` at ${cfg.startTime}`;
  if (cfg.repeatUntilDay) text += `, until ${cfg.repeatUntilDay}`;
  return text;
};
