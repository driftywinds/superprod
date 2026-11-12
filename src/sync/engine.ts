import type { OpLog } from '../core/op-log';
import { MAX_OPS_PER_UPLOAD, type Operation } from '../core/operation';
import type { SuperSyncClient } from './client';

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
}

export interface SyncResult {
  uploaded: number;
  rejected: UploadReject[];
  downloaded: number;
  cursor: number;
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

    if (batch.length > 0) {
      const response = await client.uploadOps(batch, opLog.cursor);
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
    }

    const clientId = pending[0]?.clientId;
    let pages = 0;

    while (pages < this.maxPages) {
      pages += 1;
      const page = await client.downloadOps(opLog.cursor, {
        limit: this.downloadPageSize,
        excludeClient: clientId,
      });

      for (const serverOp of page.ops) {
        const incoming = this.options.decryptRemote
          ? await this.options.decryptRemote(serverOp.op)
          : serverOp.op;

        const isNew = await opLog.addRemote(serverOp.op, serverOp.serverSeq);
        if (isNew) {
          await this.options.applyRemoteOp(incoming, serverOp.serverSeq);
          result.downloaded += 1;
        }
        await opLog.advanceCursor(serverOp.serverSeq);
      }

      await opLog.advanceCursor(page.latestSeq);

      if (!page.hasMore || page.ops.length === 0) break;
    }

    result.cursor = opLog.cursor;
    return result;
  }
}
