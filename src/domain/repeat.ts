import { toDayStr } from './models';

/**
 * Repeating tasks, mirroring upstream's `TaskRepeatCfg`
 * (FEATURES.md §1.x, `features/task-repeat-cfg`).
 *
 * Instance tasks are materialised by the client as `rpt_<cfgId>_<YYYY-MM-DD>`,
 * so a client that only reads the server never sees future occurrences: they do
 * not exist as tasks until some client generates them. The planner and schedule
 * therefore project occurrences from the configs themselves.
 */

export type RepeatCycle = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type RepeatQuickSetting = RepeatCycle | 'MONDAY_TO_FRIDAY' | 'CUSTOM';
export type RemindAt = 'AtStart' | 'BeforeStart';

export interface TaskRepeatCfg {
  id: string;
  title?: string;
  projectId?: string | null;
  tagIds?: string[];
  defaultEstimate?: number;
  startTime?: string | null;
  remindAt?: RemindAt;
  startDate?: string;
  repeatEvery?: number;
  repeatCycle: RepeatCycle;
  quickSetting?: RepeatQuickSetting;
  isPaused?: boolean;
  /** 0 = Sunday … 6 = Saturday. */
  monday?: boolean;
  tuesday?: boolean;
  wednesday?: boolean;
  thursday?: boolean;
  friday?: boolean;
  saturday?: boolean;
  sunday?: boolean;
  lastTaskCreationDay?: string;
  repeatFromCompletionDate?: boolean;
  waitForCompletion?: boolean;
  skipOverdue?: boolean;
  shouldInheritSubtasks?: boolean;
  disableAutoUpdateSubtasks?: boolean;
  notes?: string;
  order?: number;
  subTaskTemplates?: unknown[];
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

/** True when at least one weekday is selected (upstream quick settings do this). */
export const hasWeekdaySelection = (cfg: TaskRepeatCfg): boolean =>
  REPEAT_WEEKDAY_KEYS.some((key) => cfg[key] === true);

export const instanceId = (cfgId: string, day: string): string => `rpt_${cfgId}_${day}`;

const parseDay = (day: string): Date => new Date(`${day}T00:00:00`);

const daysBetween = (a: Date, b: Date): number =>
  Math.round((b.getTime() - a.getTime()) / 86_400_000);

/**
 * Does this config produce an occurrence on `day`?
 *
 * Rules, in the order upstream applies them:
 * - paused configs never produce anything
 * - nothing before the start date
 * - weekdays gate DAILY/WEEKLY schedules (an empty selection means "every day")
 * - `repeatEvery` is the interval in cycles of the active unit
 */
export const occursOnDay = (cfg: TaskRepeatCfg, day: string): boolean => {
  if (cfg.isPaused) return false;

  const target = parseDay(day);
  const start = cfg.startDate ? parseDay(cfg.startDate) : null;
  if (start && target < start) return false;

  const every = Math.max(1, Math.round(cfg.repeatEvery ?? 1));
  const weekday = target.getDay();

  switch (cfg.repeatCycle) {
    case 'DAILY': {
      if (hasWeekdaySelection(cfg) && !isWeekdayEnabled(cfg, weekday)) return false;
      if (hasWeekdaySelection(cfg)) {
        // Selected weekdays repeat every `every` weeks.
        if (start && every > 1) {
          const weeks = Math.floor(daysBetween(start, target) / 7);
          return weeks % every === 0;
        }
        return true;
      }
      if (!start) return true;
      return daysBetween(start, target) % every === 0;
    }

    case 'WEEKLY': {
      if (!isWeekdayEnabled(cfg, weekday)) return false;
      if (!start) return true;
      const startWeek = startOfWeek(start);
      const targetWeek = startOfWeek(target);
      const weeks = Math.round(daysBetween(startWeek, targetWeek) / 7);
      return weeks >= 0 && weeks % every === 0;
    }

    case 'MONTHLY': {
      if (!start) return target.getDate() === 1;
      const months =
        (target.getFullYear() - start.getFullYear()) * 12 +
        (target.getMonth() - start.getMonth());
      return months >= 0 && months % every === 0 && target.getDate() === start.getDate();
    }

    case 'YEARLY': {
      if (!start) return false;
      const years = target.getFullYear() - start.getFullYear();
      return (
        years >= 0 &&
        years % every === 0 &&
        target.getMonth() === start.getMonth() &&
        target.getDate() === start.getDate()
      );
    }

    default:
      return false;
  }
};

const startOfWeek = (date: Date): Date => {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Weeks run Monday..Sunday for interval maths, independent of display order.
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
};

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
  if (Number.isNaN(hours)) return null;
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

export const minutesToTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Project the occurrences of one config that fall on `day`. */
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

/** All occurrences across configs for one day, timed ones sorted by start time. */
export const projectDay = (
  configs: readonly TaskRepeatCfg[],
  day: string,
): ProjectedOccurrence[] =>
  configs
    .map((cfg) => projectOccurrence(cfg, day))
    .filter((value): value is ProjectedOccurrence => value !== null)
    .sort((a, b) => (a.startMinutes ?? -1) - (b.startMinutes ?? -1));

export const todayKey = (): string => toDayStr();
