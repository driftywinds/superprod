import type { OpLog } from '../core/op-log';
import { MAX_OPS_PER_UPLOAD, type Operation } from '../core/operation';
import type { SuperSyncClient } from './client';
import { logger } from '../services/logger';

export interface SyncEngineOptions {
  client: SuperSyncClient;
  opLog: OpLog;
  /** Called for every remote op that arrives, in server order. */
  applyRemoteOp: (op: Operation, serverSeq: number) => Promise<void> | void;
  /** Page size for downloads; server caps at 1000. */
  downloadPageSize?: number;
  /** Safety stop so one sync call cannot loop forever. */
  maxPages?: number;
  /**
   * Applied to each operation immediately before upload — used to seal the
   * payload for an end-to-end encrypted account.
   */
  transformForUpload?: (op: Operation) => Promise<Operation>;
  /** Applied to each remote operation before it reaches the store. */
  decryptRemote?: (op: Operation) => Promise<Operation>;
  /**
   * Replay operations even when they are already in the log.
   *
   * Set while the client is still bootstrapping from a server-side snapshot:
   * the ops were stored before the applier could handle them, so they must be
   * applied again rather than skipped as duplicates.
   */
  replayExisting?: () => boolean;
  /**
   * Called when the server cannot serve the operations between our cursor and
   * its latest sequence (they were compacted into a snapshot). Must apply the
   * full state as of `serverSeq`. Without it the cursor is left where it is, so
   * the gap is reported on every cycle instead of being silently skipped.
   */
  loadSnapshot?: (serverSeq: number) => Promise<void>;
}

export interface SyncResult {
  uploaded: number;
  rejected: UploadReject[];
  downloaded: number;
  cursor: number;
  /** True when a full snapshot was applied instead of replaying operations. */
  snapshotLoaded?: boolean;
  /** True when the server reported a gap that nothing could fill. */
  gapUnresolved?: boolean;
}

export interface UploadReject {
  opId: string;
  error?: string;
  errorCode?: string;
}

/**
 * One sync cycle: push local ops, then pull everything after the cursor.
 *
 * Order matters — upload first so the server sequence we download from
 * already includes our own writes, then download with `excludeClient` so we
 * do not replay them. Rejected ops stay pending (they are never silently
 * dropped); a conflict rejection is surfaced to the caller.
 */
export class SyncEngine {
  private readonly downloadPageSize: number;
  private readonly maxPages: number;

  constructor(private readonly options: SyncEngineOptions) {
    this.downloadPageSize = options.downloadPageSize ?? 500;
    this.maxPages = options.maxPages ?? 50;
  }

  async syncOnce(): Promise<SyncResult> {
    const { client, opLog } = this.options;
    const result: SyncResult = { uploaded: 0, rejected: [], downloaded: 0, cursor: opLog.cursor };

    const pending = opLog.getPending();
    const rawBatch = pending.slice(0, MAX_OPS_PER_UPLOAD);
    const batch = this.options.transformForUpload
      ? await Promise.all(rawBatch.map((op) => this.options.transformForUpload!(op)))
      : rawBatch;

    // A failed upload must not block the download half of the cycle: a device
    // with a stuck batch would otherwise never receive anything. The error is
    // re-thrown once the download has run so the caller still sees it.
    let uploadError: unknown = null;

    if (batch.length > 0) {
      try {
        const response = await client.uploadOps(batch, opLog.cursor, batch[0]?.clientId);
        const acceptedIds: string[] = [];
        const serverSeqByOpId: Record<string, number> = {};

        for (const uploadResult of response.results) {
          if (uploadResult.accepted) {
            acceptedIds.push(uploadResult.opId);
            if (uploadResult.serverSeq !== undefined) {
              serverSeqByOpId[uploadResult.opId] = uploadResult.serverSeq;
            }
            result.uploaded += 1;
          } else {
            result.rejected.push({
              opId: uploadResult.opId,
              error: uploadResult.error,
              errorCode: uploadResult.errorCode,
            });
          }
        }

        if (acceptedIds.length > 0) {
          await opLog.markUploaded(acceptedIds, serverSeqByOpId);
        }
        await opLog.advanceCursor(response.latestSeq);
      } catch (error) {
        uploadError = error;
        logger.warn('sync', 'upload failed; continuing with download', {
          pending: batch.length,
        });
      }
    }

    const clientId = pending[0]?.clientId;
    let pages = 0;

    while (pages < this.maxPages) {
      pages += 1;
      const page = await client.downloadOps(opLog.cursor, {
        limit: this.downloadPageSize,
        excludeClient: clientId,
      });

      logger.debug('sync', 'download page', {
        ops: page.ops.length,
        hasMore: page.hasMore,
        latestSeq: page.latestSeq,
        gapDetected: page.gapDetected === true,
        cursor: opLog.cursor,
      });

      // The server no longer holds the ops between our cursor and its head.
      // Jumping the cursor forward here would mark data as "synced" that this
      // device never received — the device would then stay empty forever.
      const gap =
        page.gapDetected === true ||
        (opLog.cursor === 0 && page.ops.length === 0 && page.latestSeq > 0);
      if (gap) {
        if (this.options.loadSnapshot) {
          await this.options.loadSnapshot(page.latestSeq);
          await opLog.advanceCursor(page.latestSeq);
          result.snapshotLoaded = true;
        } else {
          result.gapUnresolved = true;
        }
        break;
      }

      for (const serverOp of page.ops) {
        const incoming = this.options.decryptRemote
          ? await this.options.decryptRemote(serverOp.op)
          : serverOp.op;

        const isNew = await opLog.addRemote(serverOp.op, serverOp.serverSeq);
        const shouldApply = isNew || this.options.replayExisting?.() === true;
        if (shouldApply) {
          await this.options.applyRemoteOp(incoming, serverOp.serverSeq);
          if (isNew) result.downloaded += 1;
        }
        await opLog.advanceCursor(serverOp.serverSeq);
      }

      await opLog.advanceCursor(page.latestSeq);

      if (!page.hasMore || page.ops.length === 0) break;
    }

    result.cursor = opLog.cursor;
    if (uploadError) throw uploadError;
    return result;
  }
}
