import { describe, expect, it } from 'vitest';
import { isUpstreamActionType } from '../src/core/action-types';
import {
  addProjectOp,
  addTagOp,
  addTaskOp,
  deleteTagOp,
  deleteTaskOp,
  logFocusSessionOp,
  planTodayOp,
  scheduleTaskOp,
  updateTaskOp,
  upsertPlannerDayOp,
} from '../src/sync/outbound';
import { tagFromPayload, taskFromPayload, toTag, toTask, unwrapActionPayload } from '../src/sync/payloads';
import { createTask } from '../src/domain/models';

/**
 * The sync engine only uploads operations whose actionType is a real upstream
 * action (`canUpload` in src/sync/runner.ts). An operation that fails that gate
 * is never sent — silently. These tests guard both halves of the contract:
 * the action string, and the payload envelope other clients replay.
 */
const task = createTask({ title: 'Ship the client', projectId: 'INBOX' });

const operations = [
  addTaskOp(task),
  updateTaskOp(task.id, { isDone: true, doneOn: 1 }),
  deleteTaskOp(task),
  scheduleTaskOp(task, { dueWithTime: 1_792_503_000_000 }),
  planTodayOp([task.id], '2026-11-12'),
  addProjectOp({ id: 'p1', title: 'Work', color: '#fff', icon: null, created: 1 }),
  addTagOp({ id: 't1', title: 'deep', color: '#fff', icon: null, created: 1 }),
  deleteTagOp('t1'),
  upsertPlannerDayOp('2026-11-12', [task.id]),
  logFocusSessionOp('2026-11-12', 1_500_000),
];

describe('outbound operations', () => {
  it('uses action types the uploader accepts', () => {
    for (const op of operations) {
      expect(isUpstreamActionType(op.actionType), `${op.actionType} is not uploadable`).toBe(true);
    }
  });

  it('always wraps the payload in the upstream envelope', () => {
    for (const op of operations) {
      const payload = op.payload as { actionPayload?: unknown; entityChanges?: unknown };
      expect(payload.actionPayload, `${op.actionType} lacks actionPayload`).toBeTruthy();
      expect(Array.isArray(payload.entityChanges), `${op.actionType} lacks entityChanges`).toBe(true);
    }
  });

  it('declares a matching entity change for each operation', () => {
    for (const op of operations) {
      const payload = op.payload as {
        entityChanges: { entityType: string; entityId: string; opType: string }[];
      };
      const matching = payload.entityChanges.find(
        (change) => change.entityType === op.entityType && change.entityId === op.entityId,
      );
      expect(matching, `${op.actionType} has no matching entityChange`).toBeTruthy();
    }
  });
});

describe('round trip through the inbound parser', () => {
  it('re-reads an added task', () => {
    const parsed = taskFromPayload(addTaskOp(task).payload);
    const rebuilt = toTask(parsed.entity);
    expect(rebuilt?.id).toBe(task.id);
    expect(rebuilt?.title).toBe('Ship the client');
  });

  it('re-reads an updated task as a patch', () => {
    const parsed = taskFromPayload(updateTaskOp(task.id, { isDone: true, doneOn: 5 }).payload);
    expect(parsed.id).toBe(task.id);
    // A patch, not a full entity: only the changed fields travel.
    expect(parsed.changes).toMatchObject({ isDone: true, doneOn: 5 });
  });

  it('re-reads a scheduled task', () => {
    const parsed = taskFromPayload(
      scheduleTaskOp(task, { dueWithTime: 1_792_503_000_000 }).payload,
    );
    expect(parsed.entity?.dueWithTime).toBe(1_792_503_000_000);
  });

  it('re-reads a tag', () => {
    const parsed = tagFromPayload(addTagOp({ id: 't9', title: 'quick', color: '#123', icon: null, created: 1 }).payload);
    expect(toTag(parsed.entity)?.title).toBe('quick');
  });

  it('re-reads a planner day', () => {
    const action = unwrapActionPayload(upsertPlannerDayOp('2026-11-13', ['a', 'b']).payload);
    expect(action).toMatchObject({ day: '2026-11-13', taskIds: ['a', 'b'] });
  });

  it('re-reads a focus session', () => {
    const action = unwrapActionPayload(logFocusSessionOp('2026-11-13', 60_000).payload);
    expect(action).toMatchObject({ day: '2026-11-13', duration: 60_000 });
  });
});
