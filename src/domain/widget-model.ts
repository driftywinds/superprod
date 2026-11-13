import { todayStr, type Task } from './models';

/**
 * What the Android home-screen widget shows.
 *
 * Today's tasks (plus anything overdue). When there is nothing for today, the
 * following days instead — each under its own heading — until there are enough
 * rows to fill the widget. Repeating occurrences nobody has created yet are
 * included so a daily task is there even before the app generated it.
 */

export interface WidgetRow {
  /** `h` section heading, `k` task row. */
  t: 'h' | 'k';
  id?: string;
  text: string;
  right?: string;
  over?: boolean;
}

export interface WidgetModel {
  /** Logical day the model was built for; the widget shows a stale notice after it. */
  day: string;
  title: string;
  rows: WidgetRow[];
}

export interface WidgetOccurrence {
  id: string;
  title: string;
  startMinutes: number | null;
}

interface Entry {
  id: string;
  title: string;
  /** Minutes since midnight, or -1 for all-day. */
  minutes: number;
  day: string;
  timed: boolean;
}

const timeLabel = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}${suffix}`;
};

const addDays = (day: string, delta: number): string => {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + delta);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const dayHeading = (day: string, today: string): string => {
  if (day === addDays(today, 1)) return 'Tomorrow';
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
};

const shortDate = (day: string): string =>
  new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

const entryOf = (task: Task): Entry | null => {
  if (task.dueWithTime != null) {
    const at = new Date(task.dueWithTime);
    return {
      id: task.id,
      title: task.title,
      minutes: at.getHours() * 60 + at.getMinutes(),
      day: todayStr(at),
      timed: true,
    };
  }
  if (task.dueDay) {
    return { id: task.id, title: task.title, minutes: -1, day: task.dueDay, timed: false };
  }
  return null;
};

const byTime = (a: Entry, b: Entry): number => a.minutes - b.minutes;

export const buildWidgetModel = (input: {
  today: string;
  tasks: readonly Task[];
  occurrences: (day: string) => readonly WidgetOccurrence[];
  /** Stop adding future days once this many task rows are listed. */
  targetRows?: number;
  maxDays?: number;
}): WidgetModel => {
  const { today } = input;
  const targetRows = input.targetRows ?? 8;
  const maxDays = input.maxDays ?? 14;

  const entries = input.tasks
    .filter((task) => !task.isDone && !task.parentId)
    .map(entryOf)
    .filter((entry): entry is Entry => entry !== null);

  const forDay = (day: string): Entry[] => {
    const real = entries.filter((entry) => entry.day === day);
    const known = new Set(real.map((entry) => entry.id));
    const virtual = input.occurrences(day)
      .filter((occurrence) => !known.has(occurrence.id))
      .map<Entry>((occurrence) => ({
        id: occurrence.id,
        title: occurrence.title,
        minutes: occurrence.startMinutes ?? -1,
        day,
        timed: occurrence.startMinutes !== null,
      }));
    // All-day first, then by clock time.
    return [...real, ...virtual].sort(byTime);
  };

  const toRow = (entry: Entry, over = false): WidgetRow => ({
    t: 'k',
    id: entry.id,
    text: entry.title,
    right: over ? shortDate(entry.day) : entry.timed ? timeLabel(entry.minutes) : '',
    over,
  });

  const rows: WidgetRow[] = [];

  const overdue = entries.filter((entry) => entry.day < today).sort((a, b) => a.day.localeCompare(b.day) || byTime(a, b));
  if (overdue.length > 0) {
    rows.push({ t: 'h', text: 'Overdue' }, ...overdue.map((entry) => toRow(entry, true)));
  }

  const todays = forDay(today);
  if (todays.length > 0) {
    if (overdue.length > 0) rows.push({ t: 'h', text: 'Today' });
    rows.push(...todays.map((entry) => toRow(entry)));
    return { day: today, title: 'Today', rows };
  }

  // Nothing today: roll forward to the next days that have something.
  let listed = overdue.length;
  for (let offset = 1; offset <= maxDays && listed < targetRows; offset += 1) {
    const day = addDays(today, offset);
    const dayEntries = forDay(day);
    if (dayEntries.length === 0) continue;
    rows.push({ t: 'h', text: dayHeading(day, today) }, ...dayEntries.map((entry) => toRow(entry)));
    listed += dayEntries.length;
  }

  return { day: today, title: rows.length > 0 ? 'Upcoming' : 'Today', rows };
};
