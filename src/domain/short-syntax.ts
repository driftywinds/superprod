import { toDayStr, type TaskPriority } from './models';

/**
 * Add-task short syntax (FEATURES.md §1.4, upstream `shortSyntax()`):
 *
 *   #tag        tag (needs a space before `#`)
 *   +project    project, prefix match, min 3 chars
 *   `1h 30m`    time estimate; `30m/1h` = spent/estimate
 *   @date       due date ("today", "tomorrow", "friday", "2026-01-31", "3pm")
 *   !date       deadline (opt-in upstream via settings)
 *   p1 p2 p3    priority High/Medium/Low
 *
 * Returns the cleaned title plus what was recognised. Unrecognised text stays
 * in the title, which is what the upstream parser does too.
 *
 * shortcut: the date parser covers today/tomorrow/yesterday, ISO dates, weekday
 * names and simple clock times. It does not implement chrono's full grammar
 * (ranges, "next month", non-English date words). Upgrade to a locale-aware
 * parser before claiming date parity — see PARITY.md §1 short-syntax row.
 */

export interface ShortSyntaxResult {
  title: string;
  tagTitles: string[];
  projectQuery?: string;
  timeEstimate: number;
  timeSpent: number;
  dueDay?: string;
  dueWithTime?: number;
  deadlineDay?: string;
  priority?: TaskPriority;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const parseClock = (raw: string): { hours: number; minutes: number } | null => {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(raw.trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();

  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
};

interface ParsedDate {
  day?: string;
  timestamp?: number;
}

const parseDateExpression = (raw: string, now: Date): ParsedDate | null => {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  const today = startOfDay(now);

  if (text === 'today') return { day: toDayStr(today) };
  if (text === 'tomorrow') return { day: toDayStr(addDays(today, 1)) };
  if (text === 'yesterday') return { day: toDayStr(addDays(today, -1)) };

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return { day: `${iso[1]}-${iso[2]}-${iso[3]}` };

  const weekdayIndex = WEEKDAYS.indexOf(text as (typeof WEEKDAYS)[number]);
  if (weekdayIndex >= 0) {
    const delta = (weekdayIndex - today.getDay() + 7) % 7 || 7;
    return { day: toDayStr(addDays(today, delta)) };
  }

  // "3pm" / "15:00" / "15:30" — a time implies a timestamp.
  if (/^\d{1,2}(:\d{2})?\s*(am|pm)?$/i.test(text)) {
    const clock = parseClock(text);
    if (!clock) return null;
    const candidate = new Date(today);
    candidate.setHours(clock.hours, clock.minutes, 0, 0);
    if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 1);
    return { timestamp: candidate.getTime() };
  }

  return null;
};

const TIME_TOKEN = /(?:^|\s)(?:t)?((?:\d+(?:\.\d+)?\s*[hm]\s*)+)(?:\/\s*((?:\d+(?:\.\d+)?\s*[hm]\s*)*))?/gi;

const parseDuration = (raw: string): number => {
  let total = 0;
  for (const match of raw.matchAll(/(\d+(?:\.\d+)?)\s*([hm])/gi)) {
    const amount = Number(match[1] ?? 0);
    const unit = (match[2] ?? 'm').toLowerCase();
    total += unit === 'h' ? amount * HOUR : amount * MINUTE;
  }
  return total;
};

export const parseShortSyntax = (
  input: string,
  options: { enableDeadline?: boolean } = {},
): ShortSyntaxResult => {
  const now = new Date();
  let title = ` ${input} `;

  const tagTitles: string[] = [];
  let projectQuery: string | undefined;
  let timeEstimate = 0;
  let timeSpent = 0;
  let dueDay: string | undefined;
  let dueWithTime: number | undefined;
  let deadlineDay: string | undefined;
  let priority: TaskPriority | undefined;

  // Tags: `#name`, requires a preceding space. Repeated tags all apply.
  title = title.replace(/(^|\s)#([^\s#+@!]+)/g, (_match, lead: string, name: string) => {
    const clean = name.trim();
    if (!clean) return _match;
    tagTitles.push(clean.toLowerCase());
    return lead;
  });

  // Project: `+name`, prefix match handled by the caller.
  title = title.replace(/(^|\s)\+([^\s#+@!]+)/g, (_match, lead: string, name: string) => {
    projectQuery = name.trim().toLowerCase();
    return lead;
  });

  // Priority: `p1`-`p3` as a standalone token.
  title = title.replace(/(^|\s)p([1-3])(?=\s|$)/gi, (_match, lead: string, level: string) => {
    priority = Number(level) as TaskPriority;
    return lead;
  });

  // Deadline: `!date` (opt-in upstream).
  if (options.enableDeadline) {
    title = title.replace(/(^|\s)!([^\s#+@!]+)/g, (_match, lead: string, expr: string) => {
      const parsed = parseDateExpression(expr, now);
      if (!parsed?.day) return _match;
      deadlineDay = parsed.day;
      return lead;
    });
  }

  // Due date: `@expr`.
  title = title.replace(/(^|\s)@([^\s#+@!]+)/g, (_match, lead: string, expr: string) => {
    const parsed = parseDateExpression(expr, now);
    if (!parsed) return _match;
    if (parsed.timestamp !== undefined) dueWithTime = parsed.timestamp;
    else if (parsed.day) dueDay = parsed.day;
    return lead;
  });

  // Durations: `1h`, `30m`, `30m/1h`, `1h 30m / 2h`.
  title = title.replace(TIME_TOKEN, (_match, spentPart: string, estimatePart?: string) => {
    if (estimatePart === undefined) {
      timeEstimate = parseDuration(spentPart);
      return ' ';
    }
    timeSpent = parseDuration(spentPart);
    timeEstimate = parseDuration(estimatePart);
    return ' ';
  });

  const cleaned = title.replace(/\s+/g, ' ').trim();

  return {
    title: cleaned,
    tagTitles: [...new Set(tagTitles)],
    projectQuery,
    timeEstimate,
    timeSpent,
    dueDay,
    dueWithTime,
    deadlineDay,
    priority,
  };
};
