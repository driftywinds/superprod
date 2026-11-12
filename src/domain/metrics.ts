import { toDayStr } from './models';

/**
 * Daily metrics, mirroring upstream's small persisted `Metric` entity
 * (FEATURES.md §5.1) — one record per day, everything else is derived.
 */
export interface MetricRecord {
  /** `YYYY-MM-DD`. */
  id: string;
  focusSessions?: number[];
  notes?: string | null;
  remindTomorrow?: boolean;
  reflections?: { text: string; created: number }[];
  impactOfWork?: number | null;
  energyCheckin?: number | null;
  completedTasks?: number | null;
  plannedTasks?: number | null;
}

/** Aggregates derived from tasks + metrics for one day. */
export interface DaySummary {
  day: string;
  timeSpent: number;
  breakTime: number;
  tasksDone: number;
  focusSessions: number;
  focusTime: number;
}

export const emptyMetric = (day: string): MetricRecord => ({ id: day, focusSessions: [] });

export const dayRange = (endDay: string, days: number): string[] => {
  const end = new Date(`${endDay}T00:00:00`);
  const out: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(end);
    date.setDate(date.getDate() - offset);
    out.push(toDayStr(date));
  }
  return out;
};

/** Sum of every task's `timeSpentOnDay` for the given day. */
export const totalTimeForDay = (
  tasks: readonly { timeSpentOnDay: Record<string, number> }[],
  day: string,
): number => tasks.reduce((sum, task) => sum + (task.timeSpentOnDay[day] ?? 0), 0);

/** Number of focus sessions recorded on a day. */
export const focusSessionCount = (metric: MetricRecord | undefined): number =>
  metric?.focusSessions?.length ?? 0;

/**
 * Intensity buckets for the heatmap (0–4), scaled to the busiest day in the
 * window so a quiet week still shows contrast.
 */
export const heatmapLevels = (values: readonly number[]): number[] => {
  const max = Math.max(...values, 0);
  if (max === 0) return values.map(() => 0);
  return values.map((value) => {
    if (value <= 0) return 0;
    const ratio = value / max;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  });
};

/** Consecutive days with any recorded time, counting back from today. */
export const currentStreak = (
  totals: Record<string, number>,
  today: string,
): number => {
  const days = dayRange(today, 365);
  let streak = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const day = days[index];
    if (!day) break;
    if ((totals[day] ?? 0) > 0) streak += 1;
    else break;
  }
  return streak;
};

export const formatMinutes = (ms: number): string => {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};
