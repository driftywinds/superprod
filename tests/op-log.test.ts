import { describe, expect, it } from 'vitest';
import { MemoryOpLogStorage, OpLog } from '../src/core/op-log';
import type { Operation } from '../src/core/operation';

const makeOp = (id: string, overrides: Partial<Operation> = {}): Operation => ({
  id,
  clientId: 'clientA',
  actionType: '[Task] Add Task',
  opType: 'CRT',
  entityType: 'TASK',
  entityId: `task-${id}`,
  payload: { title: `Task ${id}` },
  vectorClock: { clientA: 1 },
  timestamp: Date.now(),
  schemaVersion: 1,
  ...overrides,
});

describe('OpLog', () => {
  it('tracks pending local ops', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    await opLog.addLocal(makeOp('1'));
    await opLog.addLocal(makeOp('2'));

    expect(opLog.getPending()).toHaveLength(2);
    expect(opLog.cursor).toBe(0);
  });

  it('is idempotent for duplicate local op ids', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    await opLog.addLocal(makeOp('1'));
    await opLog.addLocal(makeOp('1'));

    expect(opLog.operations).toHaveLength(1);
  });

  it('clears pending once marked uploaded', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    await opLog.addLocal(makeOp('1'));
    await opLog.addLocal(makeOp('2'));

    await opLog.markUploaded(['1'], { '1': 10 });

    expect(opLog.getPending().map((op) => op.id)).toEqual(['2']);
    expect(opLog.operations.find((s) => s.op.id === '1')?.serverSeq).toBe(10);
  });

  it('deduplicates remote ops by op id', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    const remote = makeOp('r1', { clientId: 'clientB' });

    expect(await opLog.addRemote(remote, 1)).toBe(true);
    expect(await opLog.addRemote(remote, 1)).toBe(false);
    expect(opLog.operations).toHaveLength(1);
  });

  it('only moves the cursor forward', async () => {
    const opLog = new OpLog(new MemoryOpLogStorage());
    await opLog.advanceCursor(5);
    await opLog.advanceCursor(3);
    expect(opLog.cursor).toBe(5);
  });

  it('reloads persisted state from storage', async () => {
    const storage = new MemoryOpLogStorage();
    const first = new OpLog(storage);
    await first.addLocal(makeOp('1'));
    await first.addRemote(makeOp('r1', { clientId: 'clientB' }), 7);

    const reopened = new OpLog(storage);
    await reopened.load();

    expect(reopened.operations).toHaveLength(2);
    expect(reopened.cursor).toBe(7);
  });
});
