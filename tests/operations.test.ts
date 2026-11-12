import { describe, expect, it } from 'vitest';
import { createOperation, CLIENT_ID } from '../src/sync/operations';
import { SCHEMA_VERSION } from '../src/core/operation';

describe('createOperation', () => {
  it('produces a wire-valid operation', () => {
    const op = createOperation({
      actionType: '[Task] Add Task',
      opType: 'CRT',
      entityType: 'TASK',
      entityId: 't1',
      payload: { id: 't1', title: 'x' },
    });

    expect(op.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(op.clientId).toBe(CLIENT_ID);
    expect(op.clientId).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(op.entityType).toBe('TASK');
    expect(op.opType).toBe('CRT');
    expect(op.schemaVersion).toBe(SCHEMA_VERSION);
    expect(op.timestamp).toBeGreaterThan(0);
  });

  it('advances its own clock on every operation', () => {
    const first = createOperation({
      actionType: 'a',
      opType: 'CRT',
      entityType: 'TASK',
      payload: {},
    });
    const second = createOperation({
      actionType: 'a',
      opType: 'CRT',
      entityType: 'TASK',
      payload: {},
    });

    expect(second.vectorClock[CLIENT_ID]).toBe((first.vectorClock[CLIENT_ID] ?? 0) + 1);
  });

  it('gives every operation a unique id', () => {
    const ids = new Set(
      Array.from({ length: 20 }, () =>
        createOperation({ actionType: 'a', opType: 'UPD', entityType: 'TASK', payload: {} }).id,
      ),
    );
    expect(ids.size).toBe(20);
  });
});
