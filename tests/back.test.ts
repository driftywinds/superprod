import { afterEach, describe, expect, it } from 'vitest';
import { dispatchBack, registerBackHandler } from '../src/services/back';

/**
 * The back registry decides what an Android back press closes. Order matters:
 * the most recently opened overlay must win, because that is what the user sees
 * on top.
 */
const disposers: (() => void)[] = [];

const track = (name: string, handle: () => boolean): void => {
  disposers.push(registerBackHandler(name, handle));
};

afterEach(() => {
  // Dispose even when an assertion failed, so tests cannot leak into each other.
  while (disposers.length > 0) disposers.pop()?.();
});

describe('back handlers', () => {
  it('reports an unhandled press when nothing is registered', () => {
    expect(dispatchBack()).toBe(false);
  });

  it('runs the most recently registered handler first', () => {
    const order: string[] = [];
    track('first', () => {
      order.push('first');
      return true;
    });
    track('second', () => {
      order.push('second');
      return true;
    });

    expect(dispatchBack()).toBe(true);
    expect(order).toEqual(['second']);
  });

  it('falls through handlers that decline the press', () => {
    const order: string[] = [];
    // Registered first, so it is the lower layer.
    track('base', () => {
      order.push('base');
      return true;
    });
    // Registered last, so it runs first and declines.
    track('top', () => {
      order.push('top');
      return false;
    });

    expect(dispatchBack()).toBe(true);
    expect(order).toEqual(['top', 'base']);
  });

  it('stops dispatching once disposed', () => {
    const off = registerBackHandler('temporary', () => true);
    expect(dispatchBack()).toBe(true);
    off();
    expect(dispatchBack()).toBe(false);
  });

  it('survives a handler that throws and keeps looking', () => {
    track('good', () => true);
    // Registered after 'good', so it runs first and throws.
    track('broken', () => {
      throw new Error('boom');
    });

    expect(dispatchBack()).toBe(true);
  });
});
