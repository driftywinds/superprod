import { createSignal } from 'solid-js';
import { IndexedDbOpLogStorage, OpLog } from '../core/op-log';
import { SuperSyncClient, SuperSyncError } from './client';
import { SyncEngine } from './engine';
import { syncCredentials } from './auth';
import { absorbRemoteClock, createOperation } from './operations';
import { config } from '../state/config-store';
import type { Operation } from '../core/operation';

/**
 * Owns the single op-log instance and runs sync cycles.
 *
 * The log is IndexedDB-backed, so pending operations survive a reload and are
 * uploaded on the next cycle — nothing is lost by closing the app mid-edit.
 */

export const opLog = new OpLog(new IndexedDbOpLogStorage());

let loaded: Promise<void> | null = null;
export const ensureOpLogLoaded = (): Promise<void> => {
  loaded ??= opLog.load();
  return loaded;
};

export type SyncState = 'idle' | 'syncing' | 'ok' | 'error' | 'off';

export const [syncState, setSyncState] = createSignal<SyncState>('off');
export const [syncMessage, setSyncMessage] = createSignal<string>('');
export const [lastSyncedAt, setLastSyncedAt] = createSignal<number | null>(null);

/** Applied by the store; set once at startup. */
let remoteApplier: ((op: Operation) => void) | null = null;
export const setRemoteApplier = (applier: (op: Operation) => void): void => {
  remoteApplier = applier;
};

/** Record a local intent. Fire-and-forget: the UI must not wait on disk. */
export const recordOperation = (input: Parameters<typeof createOperation>[0]): void => {
  const op = createOperation(input);
  void ensureOpLogLoaded().then(() => opLog.addLocal(op));
};

const applyRemote = async (op: Operation): Promise<void> => {
  absorbRemoteClock(op.vectorClock);
  remoteApplier?.(op);
};

const makeClient = (): SuperSyncClient | null => {
  const { baseUrl, token } = syncCredentials.load();
  if (!baseUrl || !token) return null;
  return new SuperSyncClient({ baseUrl, token, appVersion: '0.1.0' });
};

export interface SyncOutcome {
  ok: boolean;
  uploaded: number;
  downloaded: number;
  rejected: number;
  message: string;
}

/** One full cycle: push pending ops, pull remote ones, apply them. */
export const syncNow = async (): Promise<SyncOutcome> => {
  const client = makeClient();
  if (!client) {
    setSyncState('off');
    setSyncMessage('No server configured');
    return { ok: false, uploaded: 0, downloaded: 0, rejected: 0, message: 'No server configured' };
  }

  setSyncState('syncing');
  setSyncMessage('Syncing…');
  await ensureOpLogLoaded();

  try {
    const engine = new SyncEngine({ client, opLog, applyRemoteOp: applyRemote });
    const result = await engine.syncOnce();

    const message =
      result.rejected.length > 0
        ? `Synced, ${result.rejected.length} operation(s) rejected`
        : `Synced — ${result.uploaded} up, ${result.downloaded} down`;

    setSyncState(result.rejected.length > 0 ? 'error' : 'ok');
    setSyncMessage(message);
    setLastSyncedAt(Date.now());

    return {
      ok: result.rejected.length === 0,
      uploaded: result.uploaded,
      downloaded: result.downloaded,
      rejected: result.rejected.length,
      message,
    };
  } catch (error) {
    const message =
      error instanceof SuperSyncError
        ? error.isAuthFailure
          ? 'Token rejected — sign in again'
          : `Sync failed (HTTP ${error.status})`
        : `Sync failed: ${error instanceof Error ? error.message : 'unknown error'}`;
    setSyncState('error');
    setSyncMessage(message);
    return { ok: false, uploaded: 0, downloaded: 0, rejected: 0, message };
  }
};

let runningTimer: ReturnType<typeof setInterval> | null = null;

/** Restart the interval loop; safe to call on every settings change. */
export const restartAutoSync = (): void => {
  if (runningTimer) clearInterval(runningTimer);
  runningTimer = null;

  if (!config.sync.isEnabled || config.sync.isManualSyncOnly) return;

  const intervalMs = Math.max(10_000, config.sync.syncInterval || 60_000);
  runningTimer = setInterval(() => {
    if (syncState() === 'syncing') return;
    void syncNow();
  }, intervalMs);
};
