import { beforeAll, describe, expect, it } from 'vitest';
import { SuperSyncClient } from '../src/sync/client';
import { decryptPayload } from '../src/sync/encryption';
import { parseUpstreamSnapshot } from '../src/sync/snapshot';

/**
 * Live check against a real self-hosted SuperSync server.
 *
 * Read-only on purpose: it verifies auth, status, devices and op download
 * without writing anything into the account's real sync log.
 *
 * Run with:
 *   SYNC_BASE_URL=... SYNC_TOKEN=... pnpm vitest run tests/sync-live.test.ts
 * Skipped when the env vars are absent, so CI and offline runs stay green.
 */
const baseUrl = process.env.SYNC_BASE_URL;
const token = process.env.SYNC_TOKEN;

const describeLive = baseUrl && token ? describe : describe.skip;

describeLive('live SuperSync server', () => {
  // Built in beforeAll: describe.skip still runs this factory body, so
  // constructing here would throw when the env vars are absent.
  let client: SuperSyncClient;

  beforeAll(() => {
    client = new SuperSyncClient({ baseUrl: baseUrl!, token: token!, appVersion: '0.1.0' });
  });

  it('authenticates and reports status', async () => {
    const status = await client.getStatus();
    expect(status.latestSeq).toBeTypeOf('number');
    expect(status.storageQuotaBytes).toBeGreaterThan(0);
    // Surface the numbers in the test output for a human to eyeball.
    console.log('[sync] status', {
      latestSeq: status.latestSeq,
      devicesOnline: status.devicesOnline,
      usedMB: (status.storageUsedBytes / 1024 / 1024).toFixed(2),
      quotaMB: (status.storageQuotaBytes / 1024 / 1024).toFixed(0),
    });
  });

  it('lists devices', async () => {
    const devices = await client.getDevices();
    expect(Array.isArray(devices)).toBe(true);
    console.log('[sync] devices', devices);
  });

  it('lists restore points', async () => {
    const points = await client.getRestorePoints();
    expect(Array.isArray(points)).toBe(true);
    console.log('[sync] restore points', points.length);
  });

  it('downloads operations without writing any', async () => {
    const page = await client.downloadOps(0, { limit: 5 });
    expect(page.latestSeq).toBeTypeOf('number');
    expect(Array.isArray(page.ops)).toBe(true);
    console.log('[sync] downloaded page', {
      ops: page.ops.length,
      hasMore: page.hasMore,
      latestSeq: page.latestSeq,
      firstOp: page.ops[0]
        ? {
            entityType: page.ops[0].op.entityType,
            opType: page.ops[0].op.opType,
            serverSeq: page.ops[0].serverSeq,
            vectorClockKeys: Object.keys(page.ops[0].op.vectorClock).length,
          }
        : null,
    });
  });

  it('decrypts the account snapshot with the real encryption password', async () => {
    const password = process.env.SYNC_PASSWORD;
    if (!password) {
      console.log('[sync] SYNC_PASSWORD not set — skipping decryption check');
      return;
    }

    const page = await client.downloadOps(0, { limit: 50 });
    const encrypted = page.ops.find((entry) => entry.op.isPayloadEncrypted);
    expect(encrypted, 'account should have encrypted ops').toBeTruthy();

    const plaintext = await decryptPayload(encrypted!.op.payload as string, password);
    const parsed = JSON.parse(plaintext) as Record<string, unknown>;
    console.log('[sync] decrypted payload keys:', Object.keys(parsed).join(', '));

    const snapshotOp = page.ops.find(
      (entry) => entry.op.entityType === 'ALL' && entry.op.isPayloadEncrypted,
    );
    if (snapshotOp) {
      const snapshotText = await decryptPayload(snapshotOp.op.payload as string, password);
      const imported = parseUpstreamSnapshot(JSON.parse(snapshotText));
      console.log('[sync] snapshot import', {
        tasks: imported.tasks.length,
        projects: imported.projects.length,
        tags: imported.tags.length,
      });
      expect(imported.projects.some((project) => project.id === 'INBOX')).toBe(true);
      expect(imported.tasks.every((task) => typeof task.title === 'string')).toBe(true);
    }
  }, 60_000);

  it('rejects a bad token with an auth failure', async () => {
    const bad = new SuperSyncClient({
      baseUrl: baseUrl!,
      token: 'not-a-real-token',
      appVersion: '0.1.0',
    });
    await bad.getStatus().then(
      () => {
        throw new Error('expected 401');
      },
      (error: unknown) => {
        expect((error as { status?: number }).status).toBe(401);
      },
    );
  });
});
