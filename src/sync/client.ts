import type { Operation, ServerOperation } from '../core/operation';
import { NetworkError, httpJson } from './http';
import { logger } from '../services/logger';

/**
 * SuperSync HTTP client — the endpoints and payloads mirror
 * `packages/super-sync-server/src/sync/sync.routes.ts` and
 * `packages/shared-schema/src/supersync-http-contract.ts`.
 *
 * Server surface (all under `<baseUrl>/api`, JWT bearer auth):
 *   POST   /sync/ops              upload operations
 *   GET    /sync/ops              download operations since a server sequence
 *   POST   /sync/snapshot         upload a full-state snapshot
 *   GET    /sync/status           latest seq, devices online, storage usage
 *   GET    /sync/devices          device list with last-seen times
 *   DELETE /sync/data             delete all sync data
 *   GET    /sync/restore-points   list restore points
 *   GET    /sync/restore/:seq     state snapshot at a server sequence
 *   POST   /register/magic-link   start email login
 *   POST   /login/magic-link/verify  finish email login -> { token }
 *
 * Deliberately not implemented yet: WebSocket live notifications
 * (`/api/sync/ws`), gzip request bodies, E2E encryption. They are additive —
 * see FEATURES.md §10 and PARITY.md §10.
 */

export interface SyncStatus {
  latestSeq: number;
  devicesOnline: number;
  snapshotAge?: number;
  storageUsedBytes: number;
  storageQuotaBytes: number;
}

export interface SyncDevice {
  clientId: string;
  lastSeenAt: number;
}

export interface UploadResult {
  opId: string;
  accepted: boolean;
  serverSeq?: number;
  error?: string;
  errorCode?: string;
  existingClock?: Record<string, number>;
}

export interface UploadOpsResponse {
  results: UploadResult[];
  newOps?: ServerOperation[];
  latestSeq: number;
  hasMorePiggyback?: boolean;
  deduplicated?: boolean;
}

export interface DownloadOpsResponse {
  ops: ServerOperation[];
  hasMore: boolean;
  latestSeq: number;
  gapDetected?: boolean;
  snapshotVectorClock?: Record<string, number>;
  serverTime?: number;
}

export interface RestorePoint {
  serverSeq: number;
  timestamp: number;
  type: string;
  clientId: string;
  description?: string;
}

export interface SnapshotResponse {
  state: unknown;
  serverSeq: number;
  generatedAt: number;
}

export type SyncErrorCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_OP_ID'
  | 'INVALID_OP_TYPE'
  | 'INVALID_ENTITY_TYPE'
  | 'INVALID_ENTITY_ID'
  | 'INVALID_PAYLOAD'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_VECTOR_CLOCK'
  | 'INVALID_TIMESTAMP'
  | 'MISSING_ENTITY_ID'
  | 'INVALID_SCHEMA_VERSION'
  | 'INVALID_CLIENT_ID'
  | 'CONFLICT_CONCURRENT'
  | 'CONFLICT_SUPERSEDED'
  | 'REPAIR_STALE'
  | 'DUPLICATE_OPERATION'
  | 'SYNC_IMPORT_EXISTS'
  | 'RATE_LIMITED'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'ENCRYPTED_OPS_NOT_SUPPORTED'
  | 'E2EE_REQUIRED'
  | 'CLIENT_UPDATE_REQUIRED'
  | 'INTERNAL_ERROR';

export class SuperSyncError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorCode?: SyncErrorCode | string,
  ) {
    super(message);
    this.name = 'SuperSyncError';
  }

  /** The account's token is gone or was replaced on another device. */
  get isAuthFailure(): boolean {
    return this.status === 401;
  }

  get isRateLimited(): boolean {
    return this.status === 429 || this.errorCode === 'RATE_LIMITED';
  }

  get isRetryable(): boolean {
    return this.status >= 500 || this.isRateLimited;
  }
}

export interface SuperSyncClientOptions {
  baseUrl: string;
  token: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Sent as `appVersion` so the server can gate old clients. */
  appVersion?: string;
}

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export class SuperSyncClient {
  private readonly baseUrl: string;
  private readonly token: string;
  /** Only set when a test injects a fetch; otherwise the native transport wins. */
  private readonly injectedFetch?: typeof fetch;
  private readonly appVersion?: string;

  constructor(options: SuperSyncClientOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.token = options.token;
    this.injectedFetch = options.fetchImpl;
    this.appVersion = options.appVersion;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    };

    let result;
    try {
      result = await httpJson(
        url,
        { method: init.method ?? 'GET', headers, body: init.body as string | undefined },
        this.injectedFetch,
      );
    } catch (error) {
      if (error instanceof NetworkError) {
        logger.error('sync', `request failed: ${path}`, { hint: error.hint });
        throw new SuperSyncError(`${error.message} ${error.hint}`, 0, 'NETWORK');
      }
      throw error;
    }

    if (!result.ok) {
      const body = (result.body ?? {}) as { error?: string; errorCode?: string };
      logger.warn('sync', `HTTP ${result.status} ${path}`, body);
      throw new SuperSyncError(body.error ?? `HTTP ${result.status}`, result.status, body.errorCode);
    }

    return result.body as T;
  }

  /** Upload up to `MAX_OPS_PER_UPLOAD` operations; the server validates each one. */
  async uploadOps(
    ops: Operation[],
    lastKnownServerSeq?: number,
  ): Promise<UploadOpsResponse> {
    return this.request<UploadOpsResponse>('/sync/ops', {
      method: 'POST',
      body: JSON.stringify({ ops, lastKnownServerSeq }),
    });
  }

  /**
   * Download operations after `sinceSeq`. Pass `excludeClient` so this device
   * does not re-download its own uploads.
   */
  async downloadOps(
    sinceSeq: number,
    options: { limit?: number; excludeClient?: string } = {},
  ): Promise<DownloadOpsResponse> {
    const params = new URLSearchParams({ sinceSeq: String(sinceSeq) });
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.excludeClient) params.set('excludeClient', options.excludeClient);
    if (this.appVersion) params.set('appVersion', this.appVersion);
    return this.request<DownloadOpsResponse>(`/sync/ops?${params.toString()}`);
  }

  async getStatus(): Promise<SyncStatus> {
    return this.request<SyncStatus>('/sync/status');
  }

  async getDevices(): Promise<SyncDevice[]> {
    const body = await this.request<{ devices: SyncDevice[] }>('/sync/devices');
    return body.devices;
  }

  async getRestorePoints(): Promise<RestorePoint[]> {
    const body = await this.request<{ restorePoints: RestorePoint[] }>(
      '/sync/restore-points',
    );
    return body.restorePoints;
  }

  async restoreAt(serverSeq: number): Promise<SnapshotResponse> {
    return this.request<SnapshotResponse>(`/sync/restore/${serverSeq}`);
  }

  /** Full-state upload. Params mirror the server's snapshot schema. */
  async uploadSnapshot(snapshot: {
    state: unknown;
    clientId: string;
    reason: 'initial' | 'recovery' | 'migration';
    vectorClock: Record<string, number>;
    schemaVersion?: number;
  }): Promise<{ accepted: boolean; serverSeq?: number; error?: string }> {
    return this.request('/sync/snapshot', {
      method: 'POST',
      body: JSON.stringify(snapshot),
    });
  }

  async deleteAllData(): Promise<boolean> {
    const body = await this.request<{ success: boolean }>('/sync/data', {
      method: 'DELETE',
    });
    return body.success;
  }
}
