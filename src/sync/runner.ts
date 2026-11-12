import { createSignal } from 'solid-js';
import { IndexedDbOpLogStorage, OpLog } from '../core/op-log';
import { SuperSyncClient, SuperSyncError } from './client';
import { SyncEngine } from './engine';
import { syncCredentials } from './auth';
import { absorbRemoteClock, createOperation } from './operations';
import { decryptPayload, encryptPayload, looksEncrypted } from './encryption';
import { APP_VERSION } from '../app-version';
import {
  forgetSnapshotImport,
  hasImportedSnapshot,
  importSnapshotState,
  isStoreEmpty,
} from '../state/store';
import { config } from '../state/config-store';
import type { Operation } from '../core/operation';
import { logger } from '../services/logger';
import { isUpstreamActionType } from '../core/action-types';

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

/**
 * Seal an operation for upload when the account is end-to-end encrypted.
 *
 * The server rejects unencrypted payloads on an E2EE account (`E2EE_REQUIRED`),
 * so this is not optional once a password is configured.
 */
const sealForUpload = async (op: Operation): Promise<Operation> => {
  const password = syncCredentials.load().encryptPassword;
  if (!password) return op;

  const ciphertext = await encryptPayload(JSON.stringify(op.payload), password);
  return { ...op, payload: ciphertext, isPayloadEncrypted: true };
};

/** Open a remote payload; plaintext ops pass through untouched. */
const openRemote = async (op: Operation): Promise<Operation> => {
  if (!op.isPayloadEncrypted) return op;

  const password = syncCredentials.load().encryptPassword;
  if (!password) {
    throw new Error(
      'This account is end-to-end encrypted. Add the encryption password in Settings → Sync.',
    );
  }
  if (!looksEncrypted(op.payload)) return op;

  const plaintext = await decryptPayload(op.payload as string, password);
  return { ...op, payload: JSON.parse(plaintext), isPayloadEncrypted: false };
};

const applyRemote = async (op: Operation): Promise<void> => {
  const key = `${op.entityType}/${op.opType}`;
  applyTally[key] = (applyTally[key] ?? 0) + 1;
  absorbRemoteClock(op.vectorClock);
  remoteApplier?.(op);
};

const makeClient = (): SuperSyncClient | null => {
  const { baseUrl, token } = syncCredentials.load();
  if (!baseUrl || !token) return null;
  return new SuperSyncClient({ baseUrl, token, appVersion: APP_VERSION });
};

export interface SyncOutcome {
  ok: boolean;
  uploaded: number;
  downloaded: number;
  rejected: number;
  message: string;
}

/** One full cycle: push pending ops, pull remote ones, apply them. */
/**
 * Rewind and pull everything again.
 *
 * Recovery path for a client whose cursor advanced past the snapshot before the
 * importer existed: without this its data would never appear.
 */
export const reimportFromServer = async (): Promise<SyncOutcome> => {
  forgetSnapshotImport();
  await opLog.resetCursor();
  logger.info('sync', 'cursor reset for full re-import');
  return syncNow();
};

/**
 * A device whose history was never applied (no snapshot imported) rewinds once
 * per install, even if it already holds local tasks: pending ops are uploaded
 * first, so replaying the server history in order converges on the same state.
 * The flag is persisted so a healthy device does not re-download on every start.
 */
const AUTO_REWIND_KEY = 'superprod.autoRewind.v1';
let autoRewound = false;

/**
 * Set when a new build must re-apply operations an older build already handled.
 *
 * Operations are deduped by id and the cursor sits past them, so a build that
 * ignored an entity (repeat configs, planner days, metrics) would never look at
 * those ops again — the data only appeared after a reinstall. A version change
 * sets this flag, which forces one full replay and then clears itself.
 */
export const FORCE_REPLAY_KEY = 'superprod.forceReplay.v1';

export const requestReplay = (): void => {
  try {
    localStorage.setItem(FORCE_REPLAY_KEY, '1');
    logger.info('sync', 'replay requested for this build');
  } catch {
    // ignore: a missing replay is retried on the next version bump
  }
};

const takeReplayRequest = (): boolean => {
  try {
    if (localStorage.getItem(FORCE_REPLAY_KEY) !== '1') return false;
    localStorage.removeItem(FORCE_REPLAY_KEY);
    return true;
  } catch {
    return false;
  }
};

const wasAutoRewound = (): boolean => {
  try {
    return localStorage.getItem(AUTO_REWIND_KEY) === '1';
  } catch {
    return false;
  }
};

const markAutoRewound = (): void => {
  try {
    localStorage.setItem(AUTO_REWIND_KEY, '1');
  } catch {
    // ignore: worst case one extra replay next start
  }
};

/** Per-cycle tally of applied remote ops by `entity/opType` — never any content. */
let applyTally: Record<string, number> = {};

/** Fetch and apply the server's full state when its op history was compacted. */
const loadServerSnapshot = async (client: SuperSyncClient, serverSeq: number): Promise<void> => {
  const snapshot = await client.restoreAt(serverSeq);
  let state: unknown = snapshot.state;

  if (typeof state === 'string') {
    const password = syncCredentials.load().encryptPassword;
    if (looksEncrypted(state)) {
      if (!password) {
        throw new Error(
          'This account is end-to-end encrypted. Add the encryption password in Settings → Sync.',
        );
      }
      state = JSON.parse(await decryptPayload(state, password));
    } else {
      state = JSON.parse(state);
    }
  }

  const { tasks } = importSnapshotState(state);
  logger.info('sync', 'server snapshot applied', { serverSeq, tasks });
};

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
  // Logged after the load: before it, pending and cursor are always 0.
  logger.info('sync', 'cycle started', { pending: opLog.getPending().length, cursor: opLog.cursor });

  // A device whose cursor moved ahead of its data (older builds advanced it
  // past a compacted history) would otherwise ask for "ops after 84" forever.
  applyTally = {};
  let rewoundThisCycle = false;
  // A new build replays the server history once, so entities an older build
  // dropped (repeat configs, planner days, metrics) are applied by the new code.
  if (takeReplayRequest()) {
    forgetSnapshotImport();
    await opLog.resetCursor();
    logger.warn('sync', 'new build: replaying all remote operations');
  }

  if (!autoRewound && opLog.cursor > 0 && !hasImportedSnapshot() && (isStoreEmpty() || !wasAutoRewound())) {
    autoRewound = true;
    rewoundThisCycle = true;
    await opLog.resetCursor();
    logger.warn('sync', 'history never applied on this device; rewinding once', {
      storeEmpty: isStoreEmpty(),
    });
  }

  try {
    const engine = new SyncEngine({
      client,
      opLog,
      applyRemoteOp: applyRemote,
      transformForUpload: sealForUpload,
      decryptRemote: openRemote,
      // Until a snapshot has been applied, re-run every downloaded operation:
      // the cursor may already be past the SYNC_IMPORT that carries the data.
      replayExisting: () => !hasImportedSnapshot(),
      loadSnapshot: (serverSeq) => loadServerSnapshot(client, serverSeq),
      canUpload: (op) => isUpstreamActionType(op.actionType) || op.actionType.endsWith('] LWW Update'),
    });
    const result = await engine.syncOnce();

    const message =
      result.rejected.length > 0
        ? `Synced, ${result.rejected.length} operation(s) rejected`
        : `Synced — ${result.uploaded} up, ${result.downloaded} down`;

    if (rewoundThisCycle) markAutoRewound();
    logger.info('sync', 'cycle finished', {
      applied: applyTally,
      uploaded: result.uploaded,
      downloaded: result.downloaded,
      rejected: result.rejected.length,
      cursor: result.cursor,
      snapshotLoaded: result.snapshotLoaded === true,
      gapUnresolved: result.gapUnresolved === true,
    });
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
    // A status of 0 means the request never reached the server: show the real
    // reason (CORS / unreachable host) instead of "HTTP 0".
    const message =
      error instanceof SuperSyncError
        ? error.status === 0
          ? error.message
          : error.isAuthFailure
            ? 'Token rejected — sign in again'
            : `Sync failed (HTTP ${error.status}): ${error.message}`
        : `Sync failed: ${error instanceof Error ? error.message : 'unknown error'}`;
    logger.error('sync', 'cycle failed', { message });
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
