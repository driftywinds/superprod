import { describe, expect, it } from 'vitest';

/**
 * The focus state machine is driven by timers, so these tests exercise the
 * pure arithmetic the UI and auto-advance rely on.
 */
import { focusProgress } from '../src/state/focus';

describe('focusProgress', () => {
  const base = {
    isActive: true,
    isRunning: true,
    phase: 'work' as const,
    mode: 'Pomodoro' as const,
    cycle: 1,
    startedAt: Date.now(),
    accumulated: 0,
  };

  it('is zero at the start', () => {
    expect(focusProgress({ ...base, duration: 60_000, accumulated: 0, startedAt: Date.now() })).toBeLessThan(0.05);
  });

  it('clamps at one when overrun', () => {
    expect(focusProgress({ ...base, duration: 1_000, accumulated: 5_000, startedAt: null })).toBe(1);
  });

  it('reports half way through', () => {
    expect(focusProgress({ ...base, duration: 10_000, accumulated: 5_000, startedAt: null })).toBe(0.5);
  });

  it('is zero for an open-ended (Flowtime) phase', () => {
    expect(focusProgress({ ...base, duration: 0 })).toBe(0);
  });
});
