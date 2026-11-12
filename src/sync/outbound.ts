import { ActionType } from '../core/action-types';
import type { EntityType } from '../core/entity-types';
import type { Operation } from '../core/operation';
import type { SuperSyncOpType } from '../core/operation';
import type { Project, Tag, Task } from '../domain/models';
import type { MetricRecord } from '../domain/metrics';
import type { TaskRepeatCfg } from '../domain/repeat';
import { createOperation } from './operations';

/**
 * Outbound operations in SuperSync's exact wire format.
 *
 * Two things must match upstream or other clients cannot replay what we send
 * (and the server may reject it):
 *
 * 1. `actionType` — an exact string from `op-log/core/action-types.enum.ts`.
 * 2. `payload` — `{ actionPayload, entityChanges }`, where `actionPayload` is
 *    the action's own props and `entityChanges` is the state diff
 *    (Create: full entity, Update: partial, Delete: tombstone).
 *
 * `src/core/action-types.ts` gates uploads on (1); this module owns (2).
 */

export interface EntityChange {
  entityType: EntityType;
  entityId: string;
  opType: SuperSyncOpType;
  changes: unknown;
}

/** What the operation records; `createOperation` stamps clock/id/timestamp. */
export interface OutboundIntent {
  actionType: string;
  opType: SuperSyncOpType;
  entityType: EntityType;
  entityId: string;
  actionPayload: Record<string, unknown>;
  entityChanges: EntityChange[];
}

const change = (
  entityType: EntityType,
  entityId: string,
  opType: SuperSyncOpType,
  changes: unknown,
): EntityChange => ({ entityType, entityId, opType, changes });

export const buildOperation = (intent: OutboundIntent): Operation =>
  createOperation({
    actionType: intent.actionType,
    opType: intent.opType,
    entityType: intent.entityType,
    entityId: intent.entityId,
    // The envelope every upstream client expects.
    payload: {
      actionPayload: intent.actionPayload,
      entityChanges: intent.entityChanges,
    },
  });

/* ------------------------------------------------------------------- tasks */

/**
 * `[Task Shared] addTask`
 *
 * `workContextId`/`workContextType` describe which list the task was added to.
 * Adding to Today is expressed through the work context, never a `TODAY` tag.
 */
export const addTaskOp = (task: Task, context: { today: boolean } = { today: false }) =>
  buildOperation({
    actionType: ActionType.TASK_SHARED_ADD,
    opType: 'CRT',
    entityType: 'TASK',
    entityId: task.id,
    actionPayload: {
      task,
      workContextId: context.today ? 'TODAY' : task.projectId,
      workContextType: context.today ? 'TAG' : 'PROJECT',
      isAddToBacklog: false,
      isAddToBottom: false,
    },
    entityChanges: [change('TASK', task.id, 'CRT', task)],
  });

/** `[Task Shared] updateTask` — `changes` holds only the fields that moved. */
export const updateTaskOp = (taskId: string, changes: Partial<Task>) =>
  buildOperation({
    actionType: ActionType.TASK_SHARED_UPDATE,
    opType: 'UPD',
    entityType: 'TASK',
    entityId: taskId,
    actionPayload: { task: { id: taskId, changes }, isIgnoreShortSyntax: false },
    entityChanges: [change('TASK', taskId, 'UPD', changes)],
  });

/** `[Task Shared] deleteTask` — upstream sends the whole task for restore. */
export const deleteTaskOp = (task: Task, subTasks: Task[] = []) =>
  buildOperation({
    actionType: ActionType.TASK_SHARED_DELETE,
    opType: 'DEL',
    entityType: 'TASK',
    entityId: task.id,
    actionPayload: { task: { ...task, subTasks } },
    entityChanges: [
      change('TASK', task.id, 'DEL', { id: task.id }),
      ...subTasks.map((sub) => change('TASK', sub.id, 'DEL', { id: sub.id })),
    ],
  });

/**
 * `[Task Shared] scheduleTaskWithTime` — sets a timed slot and its reminder.
 *
 * The action carries the task *already updated* (`dueWithTime` applied), which
 * is how upstream's reducer consumes it; `entityChanges` then records the patch.
 */
export const scheduleTaskOp = (
  task: Task,
  options: { dueWithTime: number | null; remindAt?: number | null },
) => {
  const remindAt = options.remindAt ?? options.dueWithTime;
  const scheduled: Task = { ...task, dueWithTime: options.dueWithTime, dueDay: null, remindAt };

  return buildOperation({
    actionType: ActionType.TASK_SHARED_SCHEDULE_WITH_TIME,
    opType: 'UPD',
    entityType: 'TASK',
    entityId: task.id,
    actionPayload: {
      task: scheduled,
      dueWithTime: options.dueWithTime,
      remindAt,
      isMoveToBacklog: false,
    },
    entityChanges: [
      change('TASK', task.id, 'UPD', {
        dueWithTime: options.dueWithTime,
        remindAt,
        dueDay: null,
      }),
    ],
  });
};

/** `[Task Shared] unscheduleTask` */
export const unscheduleTaskOp = (task: Task) =>
  buildOperation({
    actionType: ActionType.TASK_SHARED_UNSCHEDULE,
    opType: 'UPD',
    entityType: 'TASK',
    entityId: task.id,
    actionPayload: { id: task.id },
    entityChanges: [change('TASK', task.id, 'UPD', { dueWithTime: null, remindAt: null, dueDay: null })],
  });

/** `[Task Shared] planTasksForToday` — the virtual Today list. */
export const planTodayOp = (taskIds: string[], today: string) =>
  buildOperation({
    actionType: ActionType.TASK_SHARED_PLAN_FOR_TODAY,
    opType: 'UPD',
    entityType: 'TASK',
    entityId: taskIds[0] ?? today,
    actionPayload: { taskIds, today },
    entityChanges: taskIds.map((id) => change('TASK', id, 'UPD', { dueDay: today })),
  });

/* ---------------------------------------------------------------- projects */

export const addProjectOp = (project: Project) =>
  buildOperation({
    actionType: ActionType.PROJECT_ADD,
    opType: 'CRT',
    entityType: 'PROJECT',
    entityId: project.id,
    actionPayload: { project },
    entityChanges: [change('PROJECT', project.id, 'CRT', project)],
  });

export const updateProjectOp = (projectId: string, changes: Partial<Project>) =>
  buildOperation({
    actionType: ActionType.PROJECT_UPDATE,
    opType: 'UPD',
    entityType: 'PROJECT',
    entityId: projectId,
    actionPayload: { id: projectId, changes },
    entityChanges: [change('PROJECT', projectId, 'UPD', changes)],
  });

export const deleteProjectOp = (projectId: string) =>
  buildOperation({
    actionType: ActionType.TASK_SHARED_DELETE_PROJECT,
    opType: 'DEL',
    entityType: 'PROJECT',
    entityId: projectId,
    actionPayload: { id: projectId },
    entityChanges: [change('PROJECT', projectId, 'DEL', { id: projectId })],
  });

/* -------------------------------------------------------------------- tags */

export const addTagOp = (tag: Tag) =>
  buildOperation({
    actionType: ActionType.TAG_ADD,
    opType: 'CRT',
    entityType: 'TAG',
    entityId: tag.id,
    actionPayload: { tag },
    entityChanges: [change('TAG', tag.id, 'CRT', tag)],
  });

export const updateTagOp = (tagId: string, changes: Partial<Tag>) =>
  buildOperation({
    actionType: ActionType.TAG_UPDATE,
    opType: 'UPD',
    entityType: 'TAG',
    entityId: tagId,
    actionPayload: { tag: { id: tagId, changes }, isSkipSnack: true },
    entityChanges: [change('TAG', tagId, 'UPD', changes)],
  });

export const deleteTagOp = (tagId: string) =>
  buildOperation({
    actionType: ActionType.TAG_DELETE,
    opType: 'DEL',
    entityType: 'TAG',
    entityId: tagId,
    actionPayload: { id: tagId },
    entityChanges: [change('TAG', tagId, 'DEL', { id: tagId })],
  });

/* ----------------------------------------------------------------- planner */

/**
 * `[Planner] Upsert Planner Day`
 *
 * The PLANNER entity is keyed by day and its state is
 * `{ days: { [day]: taskIds[] } }`, so the entity id is the day string.
 */
export const upsertPlannerDayOp = (day: string, taskIds: string[]) =>
  buildOperation({
    actionType: ActionType.PLANNER_UPSERT_DAY,
    opType: 'UPD',
    entityType: 'PLANNER',
    entityId: day,
    actionPayload: { day, taskIds },
    entityChanges: [change('PLANNER', day, 'UPD', { days: { [day]: taskIds } })],
  });

/* ------------------------------------------------------------ repeat config */

/** `[TaskRepeatCfg][Task] Add TaskRepeatCfg to Task` */
export const upsertRepeatConfigOp = (cfg: TaskRepeatCfg, taskId?: string) =>
  buildOperation({
    actionType: ActionType.REPEAT_CFG_ADD,
    opType: 'CRT',
    entityType: 'TASK_REPEAT_CFG',
    entityId: cfg.id,
    actionPayload: {
      taskRepeatCfg: cfg,
      taskId: taskId ?? '',
      startTime: cfg.startTime ?? null,
      remindAt: cfg.remindAt ?? 'AtStart',
    },
    entityChanges: [change('TASK_REPEAT_CFG', cfg.id, 'CRT', cfg)],
  });

/** `[TaskRepeatCfg] Update TaskRepeatCfg` — only the fields that moved. */
export const updateRepeatConfigOp = (id: string, changes: Partial<TaskRepeatCfg>) =>
  buildOperation({
    actionType: ActionType.REPEAT_CFG_UPDATE,
    opType: 'UPD',
    entityType: 'TASK_REPEAT_CFG',
    entityId: id,
    actionPayload: { taskRepeatCfg: { id, changes }, isAskToUpdateAllTaskInstances: false },
    entityChanges: [change('TASK_REPEAT_CFG', id, 'UPD', changes)],
  });

/** `[TaskRepeatCfg] Delete TaskRepeatCfg` */
export const deleteRepeatConfigOp = (id: string) =>
  buildOperation({
    actionType: ActionType.REPEAT_CFG_DELETE,
    opType: 'DEL',
    entityType: 'TASK_REPEAT_CFG',
    entityId: id,
    actionPayload: { id },
    entityChanges: [change('TASK_REPEAT_CFG', id, 'DEL', { id })],
  });

/* ------------------------------------------------------------------ metric */

/** `[Metric] Log Focus Session` — the entity id is the day. */
export const logFocusSessionOp = (day: string, duration: number) =>
  buildOperation({
    actionType: ActionType.METRIC_LOG_FOCUS_SESSION,
    opType: 'UPD',
    entityType: 'METRIC',
    entityId: day,
    actionPayload: { day, duration },
    entityChanges: [change('METRIC', day, 'UPD', { focusSessions: [initialSessionStart(duration)] })],
  });

const initialSessionStart = (duration: number): number => Date.now() - duration;

export const upsertMetricOp = (metric: MetricRecord) =>
  buildOperation({
    actionType: ActionType.METRIC_UPSERT,
    opType: 'UPD',
    entityType: 'METRIC',
    entityId: metric.id,
    actionPayload: { metric },
    entityChanges: [change('METRIC', metric.id, 'UPD', metric)],
  });

export const updateMetricOp = (day: string, changes: Partial<MetricRecord>) =>
  buildOperation({
    actionType: ActionType.METRIC_UPDATE,
    opType: 'UPD',
    entityType: 'METRIC',
    entityId: day,
    actionPayload: { metric: { id: day, changes } },
    entityChanges: [change('METRIC', day, 'UPD', changes)],
  });
