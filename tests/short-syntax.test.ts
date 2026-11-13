import { describe, expect, it } from 'vitest';
import { parseShortSyntax } from '../src/domain/short-syntax';

const HOUR = 60 * 60 * 1000;

describe('parseShortSyntax — title cleanup', () => {
  it('leaves a plain title alone', () => {
    expect(parseShortSyntax('Write the report').title).toBe('Write the report');
  });

  it('collapses whitespace after stripping tokens', () => {
    expect(parseShortSyntax('Write   the #work report').title).toBe('Write the report');
  });
});

describe('tags', () => {
  it('extracts one tag', () => {
    const result = parseShortSyntax('Task #urgent');
    expect(result.tagTitles).toEqual(['urgent']);
    expect(result.title).toBe('Task');
  });

  it('extracts multiple tags and dedupes', () => {
    const result = parseShortSyntax('Meeting #work #important #work');
    expect(result.tagTitles).toEqual(['work', 'important']);
  });

  it('requires a space before #', () => {
    const result = parseShortSyntax('Task#urgent #other');
    expect(result.tagTitles).toEqual(['other']);
    expect(result.title).toContain('Task#urgent');
  });

  it('lowercases tag names', () => {
    expect(parseShortSyntax('x #Urgent').tagTitles).toEqual(['urgent']);
  });
});

describe('project', () => {
  it('extracts a project query', () => {
    const result = parseShortSyntax('Task +Important');
    expect(result.projectQuery).toBe('important');
    expect(result.title).toBe('Task');
  });

  it('requires a space before +', () => {
    const result = parseShortSyntax('Task+Project');
    expect(result.projectQuery).toBeUndefined();
  });
});

describe('priority', () => {
  it('maps p1..p3', () => {
    expect(parseShortSyntax('Task p1').priority).toBe(1);
    expect(parseShortSyntax('Task p2').priority).toBe(2);
    expect(parseShortSyntax('Task p3').priority).toBe(3);
  });

  it('ignores p4 and embedded p1', () => {
    expect(parseShortSyntax('Task p4').priority).toBeUndefined();
    expect(parseShortSyntax('Taskp1').priority).toBeUndefined();
  });
});

describe('durations', () => {
  it('parses a plain estimate', () => {
    expect(parseShortSyntax('Task 30m').timeEstimate).toBe(30 * 60 * 1000);
    expect(parseShortSyntax('Task 1.5h').timeEstimate).toBe(1.5 * HOUR);
  });

  it('parses a spent/estimate pair', () => {
    const result = parseShortSyntax('Task 30m/1h');
    expect(result.timeSpent).toBe(30 * 60 * 1000);
    expect(result.timeEstimate).toBe(HOUR);
  });

  it('parses a compound estimate', () => {
    expect(parseShortSyntax('Task 1h 30m').timeEstimate).toBe(HOUR + 30 * 60 * 1000);
  });

  it('treats a trailing slash as spent only', () => {
    const result = parseShortSyntax('Task 30m/');
    expect(result.timeSpent).toBe(30 * 60 * 1000);
    expect(result.timeEstimate).toBe(0);
  });
});

describe('dates', () => {
  const today = new Date();
  const dayStr = (offset: number) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  };

  it('parses an ISO date to a day', () => {
    const result = parseShortSyntax('Task @2030-10-12');
    expect(result.dueDay).toBe('2030-10-12');
    expect(result.dueWithTime).toBeUndefined();
  });

  it('parses tomorrow', () => {
    expect(parseShortSyntax('Task @tomorrow').dueDay).toBe(dayStr(1));
  });

  it('parses a clock time to a timestamp', () => {
    const result = parseShortSyntax('Task @3pm');
    expect(result.dueWithTime).toBeTypeOf('number');
    const date = new Date(result.dueWithTime as number);
    expect(date.getHours()).toBe(15);
  });

  it('keeps an unknown date expression in the title', () => {
    const result = parseShortSyntax('Task @notadate');
    expect(result.dueDay).toBeUndefined();
    expect(result.dueWithTime).toBeUndefined();
  });

  it('does not treat a lone @ as a date marker, but still reads the plain word', () => {
    // `@ tomorrow` is not the `@date` form; "tomorrow" is read as a natural date
    // on its own and the stray `@` stays in the title.
    const result = parseShortSyntax('Task @ tomorrow');
    expect(result.title).toBe('Task @');
    expect(result.dueDay).toBeDefined();
    expect(result.dueWithTime).toBeUndefined();
  });
});

describe('deadline', () => {
  it('is ignored unless enabled', () => {
    const result = parseShortSyntax('Task !tomorrow');
    expect(result.deadlineDay).toBeUndefined();
    expect(result.title).toContain('!tomorrow');
  });

  it('parses when enabled', () => {
    const today = new Date();
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const result = parseShortSyntax('Task !tomorrow', { enableDeadline: true });
    expect(result.deadlineDay).toBe(expected);
  });
});

describe('combined', () => {
  it('extracts several tokens from one title', () => {
    const result = parseShortSyntax('Fix login bug #auth +Backend 2h p3 @tomorrow');

    expect(result.title).toBe('Fix login bug');
    expect(result.tagTitles).toEqual(['auth']);
    expect(result.projectQuery).toBe('backend');
    expect(result.timeEstimate).toBe(2 * HOUR);
    expect(result.priority).toBe(3);
    expect(result.dueDay).toBeTypeOf('string');
  });
});
