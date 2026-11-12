import { describe, expect, it, vi } from 'vitest';
import { SuperSyncClient, SuperSyncError } from '../src/sync/client';
import { MemoryOpLogStorage, OpLog } from '../src/core/op-log';
import { SyncEngine } from '../src/sync/engine';
import type { Operation } from '../src/core/operation';

const makeOp = (id: string, overrides: Partial<Operation> = {}): Operation => ({
  id,
  clientId: 'clientA',
  actionType: '[Task] Add Task',
  opType: 'CRT',
  entityType: 'TASK',
  entityId: `task-${id}`,
  payload: {},
  vectorClock: { clientA: 1 },
  timestamp: 1000,
  schemaVersion: 1,
  ...overrides,
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const clientWith = (fetchImpl: typeof fetch) =>
  new SuperSyncClient({ baseUrl: 'https://sync.test', token: 'tok', fetchImpl });

describe('SuperSyncClient', () => {
  it('sends the bearer token and hits the documented paths', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ latestSeq: 4 }));
    const client = clientWith(fetchImpl as unknown as typeof fetch);

    await client.getStatus();

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://sync.test/api/sync/status');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('strips trailing slashes from the base URL', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ latestSeq: 1 }));
    const client = new SuperSyncClient({
      baseUrl: 'https://sync.test///',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.getStatus();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://sync.test/api/sync/status');
  });

  it('builds download query params', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ ops: [], hasMore: false, latestSeq: 9 }));
    const client = new SuperSyncClient({
      baseUrl: 'https://sync.test',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      appVersion: '0.1.0',
    });

    await client.downloadOps(5, { limit: 100, excludeClient: 'clientA' });

    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain('sinceSeq=5');
    expect(url).toContain('limit=100');
    expect(url).toContain('excludeClient=clientA');
    expect(url).toContain('appVersion=0.1.0');
  });

  it('surfaces the server error code and auth failures', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ error: 'Token revoked', errorCode: 'INVALID_CLIENT_ID' }, 401));
    const client = clientWith(fetchImpl as unknown as typeof fetch);

    await expect(client.getStatus()).rejects.toBeInstanceOf(SuperSyncError);
    await client.getStatus().catch((error: SuperSyncError) => {
      expect(error.status).toBe(401);
      expect(error.isAuthFailure).toBe(true);
    });
  });

  it('classifies 429 as retryable', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ error: 'slow down', errorCode: 'RATE_LIMITED' }, 429));
    const client = clientWith(fetchImpl as unknown as typeof fetch);

    await client.getStatus().catch((error: SuperSyncError) => {
      expect(error.isRateLimited).toBe(true);
      expect(error.isRetryable).toBe(true);
    });
  });
});

describe('SyncEngine', () => {
  it('uploads pending ops, then downloads with the cursor advanced', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    await opLog.addLocal(makeOp('1'));

    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => { calls.push(String(url));
      if (String(url).includes('/sync/ops') && init?.method === 'POST') {
        return jsonResponse({
          results: [{ opId: '1', accepted: true, serverSeq: 11 }],
          latestSeq: 11,
        });
      }
      return jsonResponse({ ops: [], hasMore: false, latestSeq: 11 });
    });

    const engine = new SyncEngine({
      client: clientWith(fetchImpl as unknown as typeof fetch),
      opLog,
      applyRemoteOp: () => undefined,
    });

    const result = await engine.syncOnce();

    expect(result.uploaded).toBe(1);
    expect(result.downloaded).toBe(0);
    expect(opLog.getPending()).toHaveLength(0);
    expect(result.cursor).toBe(11);
    expect(calls[0]).toContain('/sync/ops');
  });

  it('applies remote ops in order and advances the cursor', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    const applied: string[] = [];

    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ ops: [
          { serverSeq: 1, receivedAt: 1, op: makeOp('r1', { clientId: 'B' }) },
          { serverSeq: 2, receivedAt: 2, op: makeOp('r2', { clientId: 'B' }) },
        ],
        hasMore: false,
        latestSeq: 2,
      }),
    );

    const engine = new SyncEngine({
      client: clientWith(fetchImpl as unknown as typeof fetch),
      opLog,
      applyRemoteOp: (op) => {
        applied.push(op.id);
      },
    });

    const result = await engine.syncOnce();

    expect(applied).toEqual(['r1', 'r2']);
    expect(result.downloaded).toBe(2);
    expect(opLog.cursor).toBe(2);
  });

  it('keeps rejected ops pending and reports them', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    await opLog.addLocal(makeOp('1'));

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => { if (init?.method === 'POST') {
        return jsonResponse({
          results: [
            { opId: '1', accepted: false, error: 'conflict', errorCode: 'CONFLICT_CONCURRENT' },
          ],
          latestSeq: 3,
        });
      }
      return jsonResponse({ ops: [], hasMore: false, latestSeq: 3 });
    });

    const engine = new SyncEngine({
      client: clientWith(fetchImpl as unknown as typeof fetch),
      opLog,
      applyRemoteOp: () => undefined,
    });

    const result = await engine.syncOnce();

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.errorCode).toBe('CONFLICT_CONCURRENT');
    expect(opLog.getPending()).toHaveLength(1);
  });

  it('pages until hasMore is false, with a hard stop', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    let page = 0;

    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => { page += 1; const seq = page;
      return jsonResponse({
        ops: seq <= 3 ? [{ serverSeq: seq, receivedAt: seq, op: makeOp(`r${seq}`) }] : [],
        hasMore: seq < 3,
        latestSeq: seq,
      });
    });

    const engine = new SyncEngine({
      client: clientWith(fetchImpl as unknown as typeof fetch),
      opLog,
      applyRemoteOp: () => undefined,
      maxPages: 10,
    });

    await engine.syncOnce();
    expect(opLog.cursor).toBe(3);
  });

  it('stops after maxPages even when the server keeps reporting hasMore', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    let page = 0;

    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => {
      page += 1;
      return jsonResponse({
        ops: [{ serverSeq: page, receivedAt: page, op: makeOp(`r${page}`) }],
        hasMore: true,
        latestSeq: page,
      });
    });

    const engine = new SyncEngine({
      client: clientWith(fetchImpl as unknown as typeof fetch),
      opLog,
      applyRemoteOp: () => undefined,
      maxPages: 4,
    });

    await engine.syncOnce();
    expect(page).toBe(4);
  });

  it('stops on an empty page even if the server claims hasMore', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    let page = 0;

    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => {
      page += 1;
      return jsonResponse({ ops: [], hasMore: true, latestSeq: page });
    });

    const engine = new SyncEngine({
      client: clientWith(fetchImpl as unknown as typeof fetch),
      opLog,
      applyRemoteOp: () => undefined,
      maxPages: 4,
    });

    await engine.syncOnce();
    expect(page).toBe(1);
  });
});

describe('SyncEngine gap handling', () => {
  const pageWithGap = () =>
    vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ ops: [], hasMore: false, latestSeq: 84, gapDetected: true }),
    );

  it('does not advance the cursor past a gap it cannot fill', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    await opLog.load();
    await opLog.advanceCursor(10);
    const client = clientWith(pageWithGap() as unknown as typeof fetch);

    const result = await new SyncEngine({ client, opLog, applyRemoteOp: vi.fn() }).syncOnce();

    expect(result.gapUnresolved).toBe(true);
    expect(opLog.cursor).toBe(10);
  });

  it('loads a snapshot for a gap, then moves the cursor to the head', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    await opLog.load();
    const loadSnapshot = vi.fn(async (_seq: number) => {});
    const client = clientWith(pageWithGap() as unknown as typeof fetch);

    const result = await new SyncEngine({ client, opLog, applyRemoteOp: vi.fn(), loadSnapshot }).syncOnce();

    expect(loadSnapshot).toHaveBeenCalledWith(84);
    expect(result.snapshotLoaded).toBe(true);
    expect(opLog.cursor).toBe(84);
  });

  it('treats an empty page from cursor 0 with a non-zero head as a gap', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    await opLog.load();
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ ops: [], hasMore: false, latestSeq: 84 }),
    );
    const loadSnapshot = vi.fn(async (_seq: number) => {});

    await new SyncEngine({ client: clientWith(fetchImpl as unknown as typeof fetch), opLog, applyRemoteOp: vi.fn(), loadSnapshot }).syncOnce();

    expect(loadSnapshot).toHaveBeenCalledWith(84);
  });
});

describe('upload envelope', () => {
  it('sends the clientId and a requestId at the top level (server schema requires them)', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ results: [], latestSeq: 1 }),
    );
    const client = clientWith(fetchImpl as unknown as typeof fetch);

    await client.uploadOps([makeOp('a')], 7);

    const body = JSON.parse(String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.clientId).toBe('clientA');
    expect(body.lastKnownServerSeq).toBe(7);
    expect(body.requestId).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(body.ops).toHaveLength(1);
  });

  it('still downloads when the upload is rejected, then reports the error', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    await opLog.load();
    await opLog.addLocal(makeOp('p1'));
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) =>
      String(url).includes('/sync/ops?')
        ? jsonResponse({ ops: [], hasMore: false, latestSeq: 0 })
        : jsonResponse({ error: 'Validation failed' }, 400),
    );
    const client = clientWith(fetchImpl as unknown as typeof fetch);

    await expect(
      new SyncEngine({ client, opLog, applyRemoteOp: vi.fn() }).syncOnce(),
    ).rejects.toBeInstanceOf(SuperSyncError);

    expect(fetchImpl.mock.calls.some(([u]) => String(u).includes('/sync/ops?'))).toBe(true);
    expect(opLog.getPending()).toHaveLength(1); // not dropped
  });
});

describe('upload gate', () => {
  it('keeps operations rejected by canUpload pending and unsent', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    await opLog.load();
    await opLog.addLocal(makeOp('x', { actionType: '[Task] Add Task' }));
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ ops: [], hasMore: false, latestSeq: 0 }),
    );
    const client = clientWith(fetchImpl as unknown as typeof fetch);

    await new SyncEngine({ client, opLog, applyRemoteOp: vi.fn(), canUpload: () => false }).syncOnce();

    expect(fetchImpl.mock.calls.some(([u]) => String(u).includes('POST'))).toBe(false);
    expect(fetchImpl.mock.calls.every(([, init]) => (init as RequestInit)?.method !== 'POST')).toBe(true);
    expect(opLog.getPending()).toHaveLength(1);
  });
});
