import { toDayStr, type TaskPriority } from './models';

/**
 * Add-task short syntax (FEATURES.md §1.4, upstream `shortSyntax()`):
 *
 *   #tag        tag (needs a space before `#`)
 *   +project    project, prefix match, min 3 chars
 *   `1h 30m`    time estimate; `30m/1h` = spent/estimate
 *   @date       due date ("today", "tomorrow", "friday", "2026-01-31", "3pm")
 *   plain words dates and times need no `@`: `16:00`, `3pm`, `at 4:30 pm`, `tomorrow`,
 *               `wednesday`, `tomorrow 9am`, `3 pm wednesday`, `2026-12-24`, `in 2m`, `in 3 hours`,
 *               `in 2 days`. A day and a clock time combine into one date-and-time.
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

/** A piece of the input the parser understood, with the exact text it came from. */
export interface ParsedToken {
  kind: 'tag' | 'project' | 'priority' | 'estimate' | 'day' | 'clock' | 'relative' | 'deadline';
  text: string;
}

export interface ShortSyntaxResult {
  /** What was recognised, so a UI can show it and let the user remove it. */
  tokens: ParsedToken[];
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

/** Today at that time, or tomorrow when it has already passed. */
const nextClockOccurrence = (clock: { hours: number; minutes: number }, now: Date): number => {
  const candidate = startOfDay(now);
  candidate.setHours(clock.hours, clock.minutes, 0, 0);
  if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 1);
  return candidate.getTime();
};

const atTime = (day: string, clock: { hours: number; minutes: number }): number => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, clock.hours, clock.minutes, 0, 0).getTime();
};

interface ParsedDate {
  day?: string;
  /** Time of day without a date. */
  clock?: { hours: number; minutes: number };
  /** Kept for callers that want a ready timestamp (time-only, next occurrence). */
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

  if (text === 'tonight') return { day: toDayStr(today) };
  if (text === 'tmrw' || text === 'tmr') return { day: toDayStr(addDays(today, 1)) };

  const weekdayIndex = WEEKDAYS.indexOf(text as (typeof WEEKDAYS)[number]);
  if (weekdayIndex >= 0) {
    const delta = (weekdayIndex - today.getDay() + 7) % 7 || 7;
    return { day: toDayStr(addDays(today, delta)) };
  }

  // "3pm" / "15:00" / "15:30" — a time implies a timestamp.
  if (/^\d{1,2}(:\d{2})?\s*(am|pm)?$/i.test(text)) {
    const clock = parseClock(text);
    if (!clock) return null;
    return { clock, timestamp: nextClockOccurrence(clock, now) };
  }

  return null;
};

const END = String.raw`(?=[.,;!?]*(?:\s|$))`;
const START = String.raw`(?<=^|\s)`;
const DAY_WORDS = `today|tonight|tomorrow|tmrw|tmr|${WEEKDAYS.join('|')}|\\d{4}-\\d{2}-\\d{2}`;

const RELATIVE = new RegExp(
  `${START}in\\s+(\\d+(?:\\.\\d+)?)\\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w)${END}`,
  'i',
);
const CLOCK = new RegExp(
  `${START}(?:at\\s+)?(\\d{1,2}:\\d{2}\\s*(?:am|pm)?|\\d{1,2}\\s*(?:am|pm))${END}`,
  'i',
);
const DAY = new RegExp(`${START}(?:(?:on|next|this)\\s+)?(${DAY_WORDS})${END}`, 'i');

/**
 * Dates and times written as plain words — no `@` needed. Each kind is taken at
 * most once (the first match) and removed from the title; the caller combines a
 * day and a clock time into a single date-and-time.
 */
const extractNaturalWhen = (
  input: string,
  now: Date,
  when: {
    day?: string;
    clock?: { hours: number; minutes: number };
    relativeTs?: number;
    relativeDay?: string;
  },
  tokens: ParsedToken[],
): string => {
  let text = input;

  const relative = RELATIVE.exec(text);
  if (relative && when.relativeTs === undefined && when.relativeDay === undefined) {
    const amount = Number(relative[1]);
    const unit = (relative[2] ?? 'm').toLowerCase();
    if (unit.startsWith('m')) {
      when.relativeTs = now.getTime() + amount * MINUTE;
    } else if (unit.startsWith('h')) {
      when.relativeTs = now.getTime() + amount * HOUR;
    } else if (unit.startsWith('d')) {
      when.relativeDay = toDayStr(addDays(startOfDay(now), Math.round(amount)));
    } else {
      when.relativeDay = toDayStr(addDays(startOfDay(now), Math.round(amount * 7)));
    }
    tokens.push({ kind: 'relative', text: relative[0].trim() });
    text = text.replace(relative[0], ' ');
  }

  const clock = CLOCK.exec(text);
  if (clock && when.clock === undefined) {
    const parsed = parseClock(clock[1] ?? '');
    if (parsed) {
      when.clock = parsed;
      tokens.push({ kind: 'clock', text: clock[0].trim() });
      text = text.replace(clock[0], ' ');
    }
  }

  const day = DAY.exec(text);
  if (day && when.day === undefined) {
    const parsed = parseDateExpression(day[1] ?? '', now);
    if (parsed?.day) {
      when.day = parsed.day;
      tokens.push({ kind: 'day', text: day[0].trim() });
      text = text.replace(day[0], ' ');
    }
  }

  return text;
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
  const tokens: ParsedToken[] = [];
  const when: {
    day?: string;
    clock?: { hours: number; minutes: number };
    relativeTs?: number;
    relativeDay?: string;
  } = {};

  // Tags: `#name`, requires a preceding space. Repeated tags all apply.
  title = title.replace(/(^|\s)#([^\s#+@!]+)/g, (_match, lead: string, name: string) => {
    const clean = name.trim();
    if (!clean) return _match;
    tagTitles.push(clean.toLowerCase());
    tokens.push({ kind: 'tag', text: `#${clean}` });
    return lead;
  });

  // Project: `+name`, prefix match handled by the caller.
  title = title.replace(/(^|\s)\+([^\s#+@!]+)/g, (_match, lead: string, name: string) => {
    projectQuery = name.trim().toLowerCase();
    tokens.push({ kind: 'project', text: `+${name.trim()}` });
    return lead;
  });

  // Priority: `p1`-`p3` as a standalone token.
  title = title.replace(/(^|\s)p([1-3])(?=\s|$)/gi, (_match, lead: string, level: string) => {
    priority = Number(level) as TaskPriority;
    tokens.push({ kind: 'priority', text: `p${level}` });
    return lead;
  });

  // Deadline: `!date` (opt-in upstream).
  if (options.enableDeadline) {
    title = title.replace(/(^|\s)!([^\s#+@!]+)/g, (_match, lead: string, expr: string) => {
      const parsed = parseDateExpression(expr, now);
      if (!parsed?.day) return _match;
      deadlineDay = parsed.day;
      tokens.push({ kind: 'deadline', text: `!${expr}` });
      return lead;
    });
  }

  // Due date: `@expr`.
  title = title.replace(/(^|\s)@([^\s#+@!]+)/g, (_match, lead: string, expr: string) => {
    const parsed = parseDateExpression(expr, now);
    if (!parsed) return _match;
    if (parsed.clock) {
      when.clock = parsed.clock;
      tokens.push({ kind: 'clock', text: `@${expr}` });
    } else if (parsed.day) {
      when.day = parsed.day;
      tokens.push({ kind: 'day', text: `@${expr}` });
    }
    return lead;
  });

  title = extractNaturalWhen(title, now, when, tokens);

  // A day and a clock time make one date-and-time; either alone stays on its own.
  if (when.relativeTs !== undefined) dueWithTime = when.relativeTs;
  else if (when.relativeDay) dueDay = when.relativeDay;
  else if (when.day && when.clock) dueWithTime = atTime(when.day, when.clock);
  else if (when.clock) dueWithTime = nextClockOccurrence(when.clock, now);
  else if (when.day) dueDay = when.day;

  // Durations: `1h`, `30m`, `30m/1h`, `1h 30m / 2h`.
  title = title.replace(TIME_TOKEN, (_match, spentPart: string, estimatePart?: string) => {
    tokens.push({ kind: 'estimate', text: _match.trim() });
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
    tokens,
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
