import type { EntityType } from './entity-types';
import type { VectorClock } from './vector-clock';

/**
 * Operation types, matching the upstream wire contract
 * (`packages/shared-schema/src/supersync-http-contract.ts`).
 */
export const SUPER_SYNC_OP_TYPES = [
  'CRT',
  'UPD',
  'DEL',
  'MOV',
  'BATCH',
  'SYNC_IMPORT',
  'BACKUP_IMPORT',
  'REPAIR',
] as const;

export type SuperSyncOpType = (typeof SUPER_SYNC_OP_TYPES)[number];

export const SUPER_SYNC_IMPORT_REASONS = [
  'PASSWORD_CHANGED',
  'FILE_IMPORT',
  'BACKUP_RESTORE',
  'FORCE_UPLOAD',
  'SERVER_MIGRATION',
  'REPAIR',
] as const;

export type SuperSyncImportReason = (typeof SUPER_SYNC_IMPORT_REASONS)[number];

/** Server rejects anything larger, in one request. */
export const MAX_OPS_PER_UPLOAD = 100;
export const MAX_ENTITY_IDS_PER_OP = 1000;

/** Upstream `CURRENT_SCHEMA_VERSION` gate is 1..100. */
export const SCHEMA_VERSION = 1;

export interface Operation {
  id: string;
  clientId: string;
  actionType: string;
  opType: SuperSyncOpType;
  entityType: EntityType;
  entityId?: string;
  entityIds?: string[];
  payload: unknown;
  vectorClock: VectorClock;
  timestamp: number;
  schemaVersion: number;
  isPayloadEncrypted?: boolean;
  syncImportReason?: SuperSyncImportReason;
  repairBaseServerSeq?: number;
}

export interface ServerOperation {
  serverSeq: number;
  op: Operation;
  receivedAt: number;
}

/** Client ids are constrained by the server: alphanumeric, `_`, `-`, max 255. */
export const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const MAX_CLIENT_ID_LENGTH = 255;

export const isValidClientId = (clientId: string): boolean =>
  clientId.length > 0 &&
  clientId.length <= MAX_CLIENT_ID_LENGTH &&
  CLIENT_ID_PATTERN.test(clientId);

/**
 * Shape check used before upload. The server validates semantics per op; this
 * only avoids sending something that cannot possibly be accepted.
 */
export const isUploadableOperation = (op: Operation): boolean =>
  op.id.length > 0 &&
  op.id.length <= 255 &&
  isValidClientId(op.clientId) &&
  op.actionType.length > 0 &&
  SUPER_SYNC_OP_TYPES.includes(op.opType) &&
  op.entityType.length > 0 &&
  op.schemaVersion >= 1 &&
  op.schemaVersion <= 100 &&
  Number.isFinite(op.timestamp);
