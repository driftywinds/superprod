import type { Operation, SuperSyncOpType } from '../core/operation';
import type { EntityType } from '../core/entity-types';
import { incrementVectorClock, type VectorClock } from '../core/vector-clock';
import { SCHEMA_VERSION } from '../core/operation';

/**
 * Builds operations from local actions.
 *
 * One user intent = one operation (upstream rule). The payload is the changed
 * entity fragment; `opType` says how to apply it.
 *
 * shortcut: payloads use this client's own shapes, not the upstream NgRx action
 * payloads. Two superprod devices interoperate; the official Super Productivity
 * client cannot replay these ops yet. Aligning payloads with upstream's
 * action/reducer contract is the remaining work for cross-client sync.
 */

const CLIENT_ID_KEY = 'superprod.clientId';
const CLOCK_KEY = 'superprod.vectorClock';

const randomId = (): string => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let id = '';
  for (const byte of bytes) id += alphabet[byte % alphabet.length];
  return id;
};

const loadClientId = (): string => {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing && /^[a-zA-Z0-9_-]{1,255}$/.test(existing)) return existing;
    const created = `client_${randomId()}`;
    localStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    return `client_${randomId()}`;
  }
};

export const CLIENT_ID = loadClientId();

let clock: VectorClock = loadClock();

function loadClock(): VectorClock {
  try {
    const raw = localStorage.getItem(CLOCK_KEY);
    return raw ? (JSON.parse(raw) as VectorClock) : {};
  } catch {
    return {};
  }
}

const persistClock = () => {
  try {
    localStorage.setItem(CLOCK_KEY, JSON.stringify(clock));
  } catch {
    // Non-fatal: a lost clock can only create extra conflicts, not data loss.
  }
};

export interface OperationInput {
  actionType: string;
  opType: SuperSyncOpType;
  entityType: EntityType;
  entityId?: string;
  payload: unknown;
}

export const createOperation = (input: OperationInput): Operation => {
  clock = incrementVectorClock(clock, CLIENT_ID);
  persistClock();

  return {
    id: crypto.randomUUID(),
    clientId: CLIENT_ID,
    actionType: input.actionType,
    opType: input.opType,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload,
    vectorClock: clock,
    timestamp: Date.now(),
    schemaVersion: SCHEMA_VERSION,
  };
};

/** Fold a remote clock into ours so later local ops causally follow it. */
export const absorbRemoteClock = (remote: VectorClock): void => {
  const merged: Record<string, number> = { ...clock };
  for (const [clientId, value] of Object.entries(remote)) {
    merged[clientId] = Math.max(merged[clientId] ?? 0, value);
  }
  clock = merged;
  persistClock();
};
