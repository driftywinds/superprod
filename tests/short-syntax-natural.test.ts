import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseShortSyntax } from '../src/domain/short-syntax';

// Thursday 12 Nov 2026, 10:00 local.
const NOW = new Date(2026, 10, 12, 10, 0, 0);
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe('natural dates and times (no @ needed)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('reads a bare 24h clock time and keeps the rest as the title', () => {
    const r = parseShortSyntax('Call mum 16:00');
    expect(r.title).toBe('Call mum');
    expect(r.dueWithTime).toBe(at(2026, 11, 12, 16, 0));
  });

  it('rolls a clock time that already passed to tomorrow', () => {
    expect(parseShortSyntax('Stretch 9am').dueWithTime).toBe(at(2026, 11, 13, 9, 0));
  });

  it('reads am/pm with or without a space and an optional "at"', () => {
    expect(parseShortSyntax('x 3pm').dueWithTime).toBe(at(2026, 11, 12, 15, 0));
    expect(parseShortSyntax('x at 3 pm').dueWithTime).toBe(at(2026, 11, 12, 15, 0));
    expect(parseShortSyntax('x 4:30 pm').dueWithTime).toBe(at(2026, 11, 12, 16, 30));
  });

  it('reads relative offsets', () => {
    expect(parseShortSyntax('Tea in 2m').dueWithTime).toBe(NOW.getTime() + 2 * 60_000);
    expect(parseShortSyntax('Tea in 30 min').dueWithTime).toBe(NOW.getTime() + 30 * 60_000);
    expect(parseShortSyntax('Tea in 3 hours').dueWithTime).toBe(NOW.getTime() + 3 * 3_600_000);
    expect(parseShortSyntax('Tea in 2 days').dueDay).toBe('2026-11-14');
    expect(parseShortSyntax('Tea in 1 week').dueDay).toBe('2026-11-19');
    expect(parseShortSyntax('Tea in 2m').title).toBe('Tea');
  });

  it('reads day words alone as an all-day date', () => {
    expect(parseShortSyntax('Pay rent tomorrow').dueDay).toBe('2026-11-13');
    expect(parseShortSyntax('Pay rent tomorrow').dueWithTime).toBeUndefined();
    expect(parseShortSyntax('Pay rent wednesday').dueDay).toBe('2026-11-18');
    expect(parseShortSyntax('Pay rent on friday').title).toBe('Pay rent');
    expect(parseShortSyntax('Pay rent 2026-12-24').dueDay).toBe('2026-12-24');
  });

  it('combines a day and a time in either order', () => {
    expect(parseShortSyntax('Meet 3 pm wednesday').dueWithTime).toBe(at(2026, 11, 18, 15, 0));
    expect(parseShortSyntax('Meet wednesday 3pm').dueWithTime).toBe(at(2026, 11, 18, 15, 0));
    const r = parseShortSyntax('Standup tomorrow 9am #work +proj p1 30m');
    expect(r.dueWithTime).toBe(at(2026, 11, 13, 9, 0));
    expect(r).toMatchObject({ title: 'Standup', tagTitles: ['work'], projectQuery: 'proj', priority: 1, timeEstimate: 30 * 60_000 });
  });

  it('keeps @ forms working and combinable', () => {
    expect(parseShortSyntax('x @tomorrow').dueDay).toBe('2026-11-13');
    expect(parseShortSyntax('x @3pm').dueWithTime).toBe(at(2026, 11, 12, 15, 0));
    expect(parseShortSyntax('x @tomorrow @9am').dueWithTime).toBe(at(2026, 11, 13, 9, 0));
  });

  it('does not mistake durations or ordinary words for dates', () => {
    expect(parseShortSyntax('Write report 2h').dueWithTime).toBeUndefined();
    expect(parseShortSyntax('Write report 2h').timeEstimate).toBe(2 * 3_600_000);
    expect(parseShortSyntax('Buy 3 apples').dueDay).toBeUndefined();
    expect(parseShortSyntax('Review monday.com export').dueDay).toBeUndefined();
    expect(parseShortSyntax('Sunday roast').dueDay).toBe('2026-11-15'); // a weekday word is a date
  });

  it('reports exactly what it understood, for the UI', () => {
    const r = parseShortSyntax('Call mum tomorrow 16:00 in 5m #home +work p2 1h');
    expect(r.tokens.map((t) => `${t.kind}:${t.text}`).sort()).toEqual(
      ['clock:16:00', 'day:tomorrow', 'estimate:1h', 'priority:p2', 'project:+work', 'relative:in 5m', 'tag:#home'].sort(),
    );
  });
});
