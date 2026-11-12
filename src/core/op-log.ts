import type { Operation } from './operation';

/**
 * Durable, append-only operation log.
 *
 * Invariants that matter for sync correctness:
 * - An op is immutable once written; corrections are new ops.
 * - Ops are written in creation order and replayed in that order.
 * - Remote ops are deduplicated by op id, so a re-delivery is harmless.
 * - `lastServerSeq` only moves forward.
 */

export interface StoredOperation {
  op: Operation;
  /** Server sequence assigned on a successful upload; absent while pending. */
  serverSeq?: number;
}

export interface OpLogSnapshot {
  ops: StoredOperation[];
  lastServerSeq: number;
}

export interface OpLogStorage {
  loadAll(): Promise<OpLogSnapshot>;
  appendLocal(op: Operation): Promise<void>;
  appendRemote(op: Operation, serverSeq: number): Promise<void>;
  markUploaded(opIds: string[], serverSeqByOpId: Record<string, number>): Promise<void>;
  setLastServerSeq(seq: number): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryOpLogStorage implements OpLogStorage {
  private ops: StoredOperation[] = [];
  private lastServerSeq = 0;

  async loadAll(): Promise<OpLogSnapshot> {
    return { ops: [...this.ops], lastServerSeq: this.lastServerSeq };
  }

  async appendLocal(op: Operation): Promise<void> {
    this.ops.push({ op });
  }

  async appendRemote(op: Operation, serverSeq: number): Promise<void> {
    this.ops.push({ op, serverSeq });
    this.lastServerSeq = Math.max(this.lastServerSeq, serverSeq);
  }

  async markUploaded(
    opIds: string[],
    serverSeqByOpId: Record<string, number>,
  ): Promise<void> {
    const ids = new Set(opIds);
    this.ops = this.ops.map((stored) =>
      ids.has(stored.op.id)
        ? { ...stored, serverSeq: serverSeqByOpId[stored.op.id] ?? stored.serverSeq }
        : stored,
    );
  }

  async setLastServerSeq(seq: number): Promise<void> {
    this.lastServerSeq = Math.max(this.lastServerSeq, seq);
  }

  async clear(): Promise<void> {
    this.ops = [];
    this.lastServerSeq = 0;
  }
}

const DB_NAME = 'superprod-op-log';
const DB_VERSION = 1;
const OPS_STORE = 'ops';
const META_STORE = 'meta';
const LAST_SEQ_KEY = 'lastServerSeq';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPS_STORE)) {
        db.createObjectStore(OPS_STORE, { keyPath: 'op.id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const promisify = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** IndexedDB implementation for web and Capacitor (both ship a real IndexedDB). */
export class IndexedDbOpLogStorage implements OpLogStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= openDb();
    return this.dbPromise;
  }

  async loadAll(): Promise<OpLogSnapshot> {
    const db = await this.db();
    const tx = db.transaction([OPS_STORE, META_STORE], 'readonly');
    const stored = (await promisify(
      tx.objectStore(OPS_STORE).getAll(),
    )) as StoredOperation[];
    const seq = (await promisify(tx.objectStore(META_STORE).get(LAST_SEQ_KEY))) as
      | number
      | undefined;

    stored.sort((a, b) => a.op.timestamp - b.op.timestamp);
    return { ops: stored, lastServerSeq: seq ?? 0 };
  }

  private async write(mode: IDBTransactionMode): Promise<IDBTransaction> {
    return (await this.db()).transaction([OPS_STORE, META_STORE], mode);
  }

  async appendLocal(op: Operation): Promise<void> {
    const tx = await this.write('readwrite');
    tx.objectStore(OPS_STORE).put({ op });
    await this.done(tx);
  }

  async appendRemote(op: Operation, serverSeq: number): Promise<void> {
    const tx = await this.write('readwrite');
    tx.objectStore(OPS_STORE).put({ op, serverSeq });
    tx.objectStore(META_STORE).put(serverSeq, LAST_SEQ_KEY);
    await this.done(tx);
  }

  async markUploaded(
    opIds: string[],
    serverSeqByOpId: Record<string, number>,
  ): Promise<void> {
    const tx = await this.write('readwrite');
    const store = tx.objectStore(OPS_STORE);
    for (const opId of opIds) {
      const stored = (await promisify(store.get(opId))) as StoredOperation | undefined;
      if (!stored) continue;
      store.put({ ...stored, serverSeq: serverSeqByOpId[opId] ?? stored.serverSeq });
    }
    await this.done(tx);
  }

  async setLastServerSeq(seq: number): Promise<void> {
    const tx = await this.write('readwrite');
    tx.objectStore(META_STORE).put(seq, LAST_SEQ_KEY);
    await this.done(tx);
  }

  async clear(): Promise<void> {
    const tx = await this.write('readwrite');
    tx.objectStore(OPS_STORE).clear();
    tx.objectStore(META_STORE).clear();
    await this.done(tx);
  }

  private done(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}

/** Thin facade over storage that keeps the in-memory view in step. */
export class OpLog {
  private ops: StoredOperation[] = [];
  private lastServerSeq = 0;
  private loaded = false;

  constructor(private readonly storage: OpLogStorage) {}

  async load(): Promise<void> {
    const snapshot = await this.storage.loadAll();
    this.ops = snapshot.ops;
    this.lastServerSeq = snapshot.lastServerSeq;
    this.loaded = true;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.load();
  }

  get operations(): readonly StoredOperation[] {
    return this.ops;
  }

  get cursor(): number {
    return this.lastServerSeq;
  }

  async addLocal(op: Operation): Promise<void> {
    await this.ensureLoaded();
    if (this.ops.some((stored) => stored.op.id === op.id)) return;
    this.ops.push({ op });
    await this.storage.appendLocal(op);
  }

  async addRemote(op: Operation, serverSeq: number): Promise<boolean> {
    await this.ensureLoaded();
    this.lastServerSeq = Math.max(this.lastServerSeq, serverSeq);
    if (this.ops.some((stored) => stored.op.id === op.id)) return false;
    this.ops.push({ op, serverSeq });
    await this.storage.appendRemote(op, serverSeq);
    return true;
  }

  getPending(): Operation[] {
    return this.ops.filter((stored) => stored.serverSeq === undefined).map((s) => s.op);
  }

  async markUploaded(
    opIds: string[],
    serverSeqByOpId: Record<string, number>,
  ): Promise<void> {
    const ids = new Set(opIds);
    this.ops = this.ops.map((stored) =>
      ids.has(stored.op.id)
        ? { ...stored, serverSeq: serverSeqByOpId[stored.op.id] ?? stored.serverSeq }
        : stored,
    );
    await this.storage.markUploaded(opIds, serverSeqByOpId);
  }

  async advanceCursor(serverSeq: number): Promise<void> {
    if (serverSeq <= this.lastServerSeq) return;
    this.lastServerSeq = serverSeq;
    await this.storage.setLastServerSeq(serverSeq);
  }

  async clear(): Promise<void> {
    this.ops = [];
    this.lastServerSeq = 0;
    await this.storage.clear();
  }
}
