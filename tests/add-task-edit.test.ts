import { describe, expect, it } from 'vitest';
import {
  clearWhen,
  removeToken,
  setClock,
  setDay,
  setEstimate,
  setPriority,
  setProject,
  setRelative,
  toggleTag,
} from '../src/domain/add-task-edit';
import { parseShortSyntax } from '../src/domain/short-syntax';

describe('add-task text edits', () => {
  it('sets, replaces and clears priority', () => {
    expect(setPriority('Pay rent', 2)).toBe('Pay rent p2');
    expect(setPriority('Pay rent p2', 3)).toBe('Pay rent p3');
    expect(setPriority('Pay rent p3', null)).toBe('Pay rent');
  });

  it('replaces the estimate', () => {
    expect(setEstimate('Write 30m', '1h')).toBe('Write 1h');
  });

  it('combines a day and a clock the parser reads as one time', () => {
    const text = setClock(setDay('Call mum', 'tomorrow'), '16:00');
    expect(text).toBe('Call mum tomorrow 16:00');
    const parsed = parseShortSyntax(text);
    expect(parsed.title).toBe('Call mum');
    expect(parsed.dueWithTime).toBeDefined();
    expect(new Date(parsed.dueWithTime!).getHours()).toBe(16);
  });

  it('a relative offset replaces other timing', () => {
    expect(setRelative('Tea tomorrow 9:00', 'in 30 min')).toBe('Tea in 30 min');
    expect(clearWhen('Tea tomorrow 9:00')).toBe('Tea');
  });

  it('toggles tags both ways, case-insensitively', () => {
    const on = toggleTag('Plan', 'Work');
    expect(on).toBe('Plan #Work');
    expect(toggleTag(on, 'work')).toBe('Plan');
  });

  it('swaps the project', () => {
    expect(setProject('Plan +home', 'maintime')).toBe('Plan +maintime');
    expect(setProject('Plan +maintime', null)).toBe('Plan');
  });

  it('removes one token without touching similar words', () => {
    const parsed = parseShortSyntax('buy p1 and p1x');
    const token = parsed.tokens[0]!;
    expect(removeToken('buy p1 and p1x', token)).toBe('buy and p1x');
  });
});

describe('sheet vocabulary is understood by the parser', () => {
  it.each(['in 30 min', 'in 1 hour', 'in 2 hours', 'in 2m', 'in 3 hours'])('%s', (phrase) => {
    const parsed = parseShortSyntax(`Tea ${phrase}`);
    expect(parsed.title).toBe('Tea');
    expect(parsed.dueWithTime).toBeGreaterThan(Date.now());
  });
});
