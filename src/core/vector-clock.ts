/**
 * Vector clocks for causality tracking, matching the upstream semantics
 * (`docs/sync-and-op-log/vector-clocks.md`).
 *
 * A clock is a map of clientId -> counter. The server prunes clocks after
 * conflict detection, and the client must apply the same cap so a clock never
 * grows without bound.
 */

export type VectorClock = Readonly<Record<string, number>>;

/** Upstream `MAX_VECTOR_CLOCK_SIZE`. */
export const MAX_VECTOR_CLOCK_SIZE = 20;

export type ClockRelation =
  | 'EQUAL'
  | 'LESS_THAN'
  | 'GREATER_THAN'
  | 'CONCURRENT';

export const EMPTY_CLOCK: VectorClock = Object.freeze({});

/**
 * Total order over the union of both clocks' keys.
 * Zero/absent counters are treated as 0, never as a missing value.
 */
export const compareVectorClocks = (a: VectorClock, b: VectorClock): ClockRelation => {
  let aGreater = false;
  let bGreater = false;

  for (const clientId of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const aValue = a[clientId] ?? 0;
    const bValue = b[clientId] ?? 0;
    if (aValue > bValue) aGreater = true;
    else if (bValue > aValue) bGreater = true;
  }

  if (aGreater && bGreater) return 'CONCURRENT';
  if (aGreater) return 'GREATER_THAN';
  if (bGreater) return 'LESS_THAN';
  return 'EQUAL';
};

/** Pointwise maximum. */
export const mergeVectorClocks = (a: VectorClock, b: VectorClock): VectorClock => {
  const merged: Record<string, number> = { ...a };
  for (const [clientId, value] of Object.entries(b)) {
    merged[clientId] = Math.max(merged[clientId] ?? 0, value);
  }
  return merged;
};

/** Advance one client's counter — the clock of an op that client just created. */
export const incrementVectorClock = (
  clock: VectorClock,
  clientId: string,
  by = 1,
): VectorClock => ({
  ...clock,
  [clientId]: (clock[clientId] ?? 0) + by,
});

/**
 * Keep the `MAX_VECTOR_CLOCK_SIZE` highest counters.
 *
 * Deterministic on the counter first, clientId second, so two clients pruning
 * the same clock independently arrive at the same clock.
 */
export const pruneVectorClock = (
  clock: VectorClock,
  maxSize = MAX_VECTOR_CLOCK_SIZE,
): VectorClock => {
  const entries = Object.entries(clock);
  if (entries.length <= maxSize) return clock;

  entries.sort(([idA, a], [idB, b]) => (b - a) || (idA < idB ? -1 : idA > idB ? 1 : 0));
  return Object.fromEntries(entries.slice(0, maxSize));
};

/** True when `candidate` already incorporates everything in `base`. */
export const dominates = (candidate: VectorClock, base: VectorClock): boolean => {
  const relation = compareVectorClocks(candidate, base);
  return relation === 'GREATER_THAN' || relation === 'EQUAL';
};

/** Defensive read of an on-the-wire clock: drop non-finite / negative counters. */
export const sanitizeVectorClock = (raw: unknown): VectorClock => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const clean: Record<string, number> = {};
  for (const [clientId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      clean[clientId] = Math.trunc(value);
    }
  }
  return clean;
};
