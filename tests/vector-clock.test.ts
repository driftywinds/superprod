import { describe, expect, it } from 'vitest';
import {
  EMPTY_CLOCK,
  MAX_VECTOR_CLOCK_SIZE,
  compareVectorClocks,
  dominates,
  incrementVectorClock,
  mergeVectorClocks,
  pruneVectorClock,
  sanitizeVectorClock,
} from '../src/core/vector-clock';

describe('compareVectorClocks', () => {
  it('treats missing and empty clocks as equal', () => {
    expect(compareVectorClocks(EMPTY_CLOCK, EMPTY_CLOCK)).toBe('EQUAL');
    expect(compareVectorClocks({}, { a: 0 })).toBe('EQUAL');
  });

  it('detects strict dominance', () => {
    expect(compareVectorClocks({ a: 2 }, { a: 1 })).toBe('GREATER_THAN');
    expect(compareVectorClocks({ a: 1 }, { a: 2 })).toBe('LESS_THAN');
    expect(compareVectorClocks({ a: 1, b: 2 }, { a: 1, b: 1 })).toBe('GREATER_THAN');
  });

  it('detects concurrency', () => {
    expect(compareVectorClocks({ a: 2 }, { b: 2 })).toBe('CONCURRENT');
    expect(compareVectorClocks({ a: 2, b: 1 }, { a: 1, b: 2 })).toBe('CONCURRENT');
  });
});

describe('merge and increment', () => {
  it('takes the pointwise maximum', () => {
    expect(mergeVectorClocks({ a: 3, b: 1 }, { a: 1, c: 4 })).toEqual({ a: 3, b: 1, c: 4 });
  });

  it('advances a single client counter', () => {
    expect(incrementVectorClock({ a: 1 }, 'a')).toEqual({ a: 2 });
    expect(incrementVectorClock({ a: 1 }, 'b')).toEqual({ a: 1, b: 1 });
  });

  it('merged clock dominates both inputs', () => {
    const a = { a: 3, b: 1 };
    const b = { a: 2, c: 2 };
    const merged = mergeVectorClocks(a, b);
    expect(dominates(merged, a)).toBe(true);
    expect(dominates(merged, b)).toBe(true);
  });
});

describe('pruneVectorClock', () => {
  it('leaves small clocks untouched', () => {
    const clock = { a: 1, b: 2 };
    expect(pruneVectorClock(clock)).toBe(clock);
  });

  it('keeps the highest counters up to the cap', () => {
    const clock: Record<string, number> = {};
    for (let i = 0; i < MAX_VECTOR_CLOCK_SIZE + 5; i += 1) clock[`c${i}`] = i;
    const pruned = pruneVectorClock(clock);
    expect(Object.keys(pruned)).toHaveLength(MAX_VECTOR_CLOCK_SIZE);
    expect(pruned.c0).toBeUndefined();
    expect(pruned[`c${MAX_VECTOR_CLOCK_SIZE + 4}`]).toBe(MAX_VECTOR_CLOCK_SIZE + 4);
  });

  it('is deterministic so two clients prune identically', () => {
    const clock: Record<string, number> = {};
    for (let i = 0; i < MAX_VECTOR_CLOCK_SIZE + 3; i += 1) clock[`c${i}`] = 7;
    expect(pruneVectorClock(clock)).toEqual(pruneVectorClock({ ...clock }));
  });
});

describe('sanitizeVectorClock', () => {
  it('drops junk from the wire', () => {
    expect(
      sanitizeVectorClock({ a: 2, b: 'x', c: -1, d: NaN, e: 1.9 }),
    ).toEqual({ a: 2, e: 1 });
  });

  it('returns empty for non-objects', () => {
    expect(sanitizeVectorClock(null)).toEqual({});
    expect(sanitizeVectorClock([1, 2])).toEqual({});
  });
});
