import { createStore, produce } from 'solid-js/store';
import { createSignal } from 'solid-js';
import { parseShortSyntax } from '../domain/short-syntax';
import { recordOperation } from '../sync/runner';
import {
  addProjectOp,
  addTagOp,
  addTaskOp,
  deleteProjectOp,
  deleteTagOp,
  deleteTaskOp,
  logFocusSessionOp,
  planTodayOp,
  scheduleTaskOp,
  unscheduleTaskOp,
  updateMetricOp,
  updateProjectOp,
  updateTagOp,
  updateTaskOp,
  upsertMetricOp,
  upsertPlannerDayOp,
  upsertRepeatConfigOp as buildRepeatConfigOp,
  updateRepeatConfigOp,
  deleteRepeatConfigOp,
} from '../sync/outbound';
import type { Operation } from '../core/operation';
import { isFullStateOperation, parseUpstreamSnapshot } from '../sync/snapshot';
import { emptyMetric, type MetricRecord } from '../domain/metrics';
import {
  instanceId,
  instanceSubTaskId,
  nextOccurrenceDay,
  occursOnDay,
  projectDay,
  projectOccurrence,
  type ProjectedOccurrence,
  repeatDueWithTime,
  type TaskRepeatCfg,
} from '../domain/repeat';
import {
  configSectionFromPayload,
  entityIdFromPayload,
  projectFromPayload,
  tagFromPayload,
  taskFromPayload,
  toProject,
  toTag,
  toTask,
  unwrapActionPayload,
} from '../sync/payloads';
import { config, updateConfig } from './config-store';
import {
  INBOX_PROJECT_ID,
  createTask,
  getDayStartMinutes,
  isOverdue,
  isTaskForToday,
  toDayStr,
  todayStr,
  type Project,
  type Tag,
  type Task,
  type TaskPriority,
} from '../domain/models';

export type ViewId =
  | 'today'
  | 'inbox'
  | 'planner'
  | 'schedule'
  | 'boards'
  | 'habits'
  | 'history'
  | 'metrics'
  | 'search'
  | 'settings'
  | `project:${string}`
  | `tag:${string}`;

interface AppState {
  tasks: Record<string, Task>;
  projects: Record<string, Project>;
  tags: Record<string, Tag>;
  /** Daily metrics keyed by `YYYY-MM-DD` (upstream `Metric` entity). */
  metrics: Record<string, MetricRecord>;
  /**
   * Planner days: `YYYY-MM-DD` -> task ids, matching upstream `PlannerState.days`
   * (the PLANNER entity is keyed by day and holds only the id list).
   */
  plannerDays: Record<string, string[]>;
  /** Repeat definitions, keyed by id (upstream TASK_REPEAT_CFG entity). */
  repeatCfgs: Record<string, TaskRepeatCfg>;
  projectOrder: string[];
  tagOrder: string[];
  selectedTaskId: string | null;
  view: ViewId;
}

const SEED_PROJECTS: Project[] = [
  { id: INBOX_PROJECT_ID, title: 'Inbox', icon: 'inbox', created: 0, color: '#8a8a8a' },
];

// A real install starts with no tags; sync or the user adds them.
const SEED_TAGS: Tag[] = [];

const initialState = (): AppState => ({
  tasks: {},
  projects: Object.fromEntries(SEED_PROJECTS.map((p) => [p.id, p])),
  tags: Object.fromEntries(SEED_TAGS.map((t) => [t.id, t])),
  projectOrder: SEED_PROJECTS.map((p) => p.id),
  tagOrder: SEED_TAGS.map((t) => t.id),
  metrics: {},
  plannerDays: {},
  repeatCfgs: {},
  selectedTaskId: null,
  view: 'today',
});

/**
 * localStorage persistence.
 *
 * shortcut: whole-state JSON in localStorage, written on every mutation. Fine
 * for a scaffold; replace with the op-log + IndexedDB pipeline so writes are
 * append-only, syncable and crash-safe (see src/core/op-log.ts).
 */
const STORAGE_KEY = 'superprod.state.v1';

const loadState = (): AppState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    // A reload starts on a clean screen: never restore an open detail panel.
    return { ...initialState(), ...parsed, selectedTaskId: null };
  } catch {
    return initialState();
  }
};

export const [state, setState] = createStore<AppState>(loadState());

/**
 * Set while a remote operation is being applied. Without this, applying a
 * remote change would record a new local op and echo it back to the server.
 */
let applyingRemote = false;

const record = (input: Parameters<typeof recordOperation>[0]): void => {
  if (applyingRemote) return;
  recordOperation(input);
};

const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — the in-memory state still works.
  }
};

/* ------------------------------------------------------------------ timer */

export const [tracking, setTracking] = createSignal<{
  taskId: string;
  startedAt: number;
} | null>(null);

export const [nowTick, setNowTick] = createSignal(Date.now());

setInterval(() => setNowTick(Date.now()), 1000);

export const liveElapsedMs = (taskId: string): number => {
  const current = tracking();
  if (!current || current.taskId !== taskId) return 0;
  return Math.max(0, nowTick() - current.startedAt);
};

export const isTracking = (taskId: string): boolean => tracking()?.taskId === taskId;

const commitElapsed = () => {
  const current = tracking();
  if (!current) return;
  const elapsed = Math.max(0, Date.now() - current.startedAt);
  if (elapsed < 1000) {
    setTracking(null);
    return;
  }
  const day = todayStr();
  setState(
    produce((draft) => {
      const task = draft.tasks[current.taskId];
      if (!task) return;
      task.timeSpent += elapsed;
      task.timeSpentOnDay[day] = (task.timeSpentOnDay[day] ?? 0) + elapsed;
      task.modified = Date.now();
    }),
  );
  setTracking(null);
};

export const toggleTracking = (taskId: string): void => {
  if (isTracking(taskId)) {
    commitElapsed();
  } else {
    commitElapsed();
    setTracking({ taskId, startedAt: Date.now() });
  }
  persist();
};

/* ------------------------------------------------------------------ tasks */

export interface AddTaskInput {
  title: string;
  projectId?: string;
  enableDeadline?: boolean;
}

export const addTask = (input: AddTaskInput): Task => {
  const projectId = input.projectId ?? INBOX_PROJECT_ID;
  const parsed = parseShortSyntax(input.title, {
    enableDeadline: input.enableDeadline,
  });

  // Resolve `+project` as a case-insensitive prefix match, shortest title wins.
  let resolvedProjectId = projectId;
  if (parsed.projectQuery && parsed.projectQuery.length >= 3) {
    const match = state.projectOrder
      .map((id) => state.projects[id])
      .filter(
        (project): project is Project =>
          project !== undefined &&
          project.id !== INBOX_PROJECT_ID &&
          project.title.toLowerCase().replace(/\s/g, '').startsWith(parsed.projectQuery!),
      )
      .sort((a, b) => a.title.length - b.title.length)[0];
    if (match) resolvedProjectId = match.id;
  }

  const tagIds = parsed.tagTitles.map((title) => ensureTag(title));

  const task = createTask({
    title: parsed.title || input.title,
    projectId: resolvedProjectId,
    tagIds,
    timeEstimate: parsed.timeEstimate,
    timeSpent: parsed.timeSpent,
    dueDay: parsed.dueDay ?? null,
    dueWithTime: parsed.dueWithTime ?? null,
    deadlineDay: parsed.deadlineDay ?? null,
    priority: parsed.priority ?? null,
  });

  // Do not auto-select: on mobile the detail panel is full-screen and would
  // hide the list the user just added to.
  setState(produce((draft) => {
    draft.tasks[task.id] = task;
  }));
  persist();
  record(addTaskOp(task, { today: task.dueDay === todayStr() }));
  return task;
};

const ensureTag = (title: string): string => {
  const existing = state.tagOrder
    .map((id) => state.tags[id])
    .find((tag) => tag?.title.toLowerCase() === title.toLowerCase());
  if (existing) return existing.id;

  const tag: Tag = {
    id: `t-${crypto.randomUUID()}`,
    title,
    color: '#8a8a8a',
    created: Date.now(),
  };
  setState(produce((draft) => {
    draft.tags[tag.id] = tag;
    draft.tagOrder.push(tag.id);
  }));
  return tag.id;
};

export const updateTask = (taskId: string, patch: Partial<Task>): void => {
  const modified = Date.now();
  setState(produce((draft) => {
    const task = draft.tasks[taskId];
    if (!task) return;
    Object.assign(task, patch);
    task.modified = modified;
  }));
  persist();
  record(updateTaskOp(taskId, { ...patch, modified }));
};

/** A task plus every descendant, parent first. */
const withDescendants = (taskId: string): Task[] => {
  const root = state.tasks[taskId];
  if (!root) return [];
  return [root, ...root.subTaskIds.flatMap((id) => withDescendants(id))];
};

export const deleteTask = (taskId: string): void => {
  const doomed = state.tasks[taskId];
  if (!doomed) return;
  const family = withDescendants(taskId);
  const ids = new Set(family.map((task) => task.id));
  if (family.some((task) => isTracking(task.id))) commitElapsed();

  // Deleting one occurrence of a series must not bring it back on the next
  // day-change pass: remember the day on the config (upstream
  // `deletedInstanceDates`).
  const cfgId = doomed.repeatCfgId ?? repeatCfgIdOfInstance(taskId);
  const cfg = cfgId ? state.repeatCfgs[cfgId] : undefined;
  const instanceDay = cfg ? instanceDayOf(taskId, cfg.id) : null;
  if (cfg && instanceDay && !cfg.deletedInstanceDates?.includes(instanceDay)) {
    patchRepeatConfig(cfg.id, {
      deletedInstanceDates: [...(cfg.deletedInstanceDates ?? []), instanceDay],
    });
  }

  record(deleteTaskOp(doomed, family.slice(1)));

  setState(
    produce((draft) => {
      if (doomed.parentId) {
        const parent = draft.tasks[doomed.parentId];
        if (parent) parent.subTaskIds = parent.subTaskIds.filter((id) => id !== taskId);
      }
      for (const id of ids) delete draft.tasks[id];
      for (const day of Object.keys(draft.plannerDays)) {
        const kept = (draft.plannerDays[day] ?? []).filter((id) => !ids.has(id));
        if (kept.length === 0) delete draft.plannerDays[day];
        else draft.plannerDays[day] = kept;
      }
      if (draft.selectedTaskId && ids.has(draft.selectedTaskId)) draft.selectedTaskId = null;
    }),
  );
  persist();
};

const repeatCfgIdOfInstance = (taskId: string): string | null => {
  const match = /^rpt_(.+)_(\d{4}-\d{2}-\d{2})$/.exec(taskId);
  return match?.[1] ?? null;
};

const instanceDayOf = (taskId: string, cfgId: string): string | null => {
  const prefix = `rpt_${cfgId}_`;
  return taskId.startsWith(prefix) ? taskId.slice(prefix.length) : null;
};

/**
 * Complete or reopen a task, with the same cascade upstream applies:
 * - completing a parent completes its open subtasks;
 * - completing the last open subtask completes the parent;
 * - reopening a subtask reopens a parent that was auto-completed.
 * Completing a "repeat from completion" instance restarts its series.
 */
export const toggleDone = (taskId: string): void => {
  const task = state.tasks[taskId];
  if (!task) return;
  if (isTracking(taskId)) commitElapsed();

  const nextDone = !task.isDone;
  const now = Date.now();
  const changed = new Map<string, Partial<Task>>();

  const mark = (id: string, done: boolean): void => {
    const target = state.tasks[id];
    if (!target || target.isDone === done) return;
    changed.set(id, { isDone: done, doneOn: done ? now : null, modified: now });
  };

  mark(taskId, nextDone);
  if (nextDone) {
    for (const id of task.subTaskIds) mark(id, true);
  }

  if (task.parentId) {
    const parent = state.tasks[task.parentId];
    if (parent) {
      const siblingsDone = parent.subTaskIds.every((id) =>
        id === taskId ? nextDone : (changed.get(id)?.isDone ?? state.tasks[id]?.isDone ?? true),
      );
      if (nextDone && siblingsDone) mark(parent.id, true);
      if (!nextDone && parent.isDone) mark(parent.id, false);
    }
  }

  setState(
    produce((draft) => {
      for (const [id, patch] of changed) {
        const target = draft.tasks[id];
        if (target) Object.assign(target, patch);
      }
    }),
  );
  persist();
  for (const [id, patch] of changed) record(updateTaskOp(id, patch));

  if (nextDone && task.repeatCfgId) {
    const cfg = state.repeatCfgs[task.repeatCfgId];
    if (cfg?.repeatFromCompletionDate) {
      patchRepeatConfig(cfg.id, { lastTaskCreationDay: todayStr(), lastTaskCreation: now });
    }
  }
};

/** Add a subtask. The parent's `subTaskIds` is derived on replay from `parentId`. */
export const addSubTask = (parentId: string, title: string): Task | undefined => {
  const parent = state.tasks[parentId];
  const clean = title.trim();
  if (!parent || parent.parentId || !clean) return undefined;
  const child = createTask({
    title: clean,
    projectId: parent.projectId,
    parentId,
    tagIds: [],
  });
  setState(
    produce((draft) => {
      draft.tasks[child.id] = child;
      const host = draft.tasks[parentId];
      if (host) {
        host.subTaskIds.push(child.id);
        // A reopened parent with a fresh open subtask is not "done" any more.
        if (host.isDone) {
          host.isDone = false;
          host.doneOn = null;
        }
      }
    }),
  );
  persist();
  record(addTaskOp(child));
  if (parent.isDone) record(updateTaskOp(parentId, { isDone: false, doneOn: null }));
  return child;
};

/** Rename a task or subtask (kept out of `updateTask` so empty titles are rejected). */
export const renameTask = (taskId: string, title: string): void => {
  const clean = title.trim();
  if (!clean) return;
  updateTask(taskId, { title: clean });
};

/** Move a subtask up/down among its siblings. */
export const moveSubTask = (parentId: string, taskId: string, delta: -1 | 1): void => {
  const parent = state.tasks[parentId];
  if (!parent) return;
  const ids = [...parent.subTaskIds];
  const from = ids.indexOf(taskId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to]!, ids[from]!];
  updateTask(parentId, { subTaskIds: ids });
};

/** Turn a subtask into a top-level task. */
export const promoteSubTask = (taskId: string): void => {
  const task = state.tasks[taskId];
  const parent = task?.parentId ? state.tasks[task.parentId] : undefined;
  if (!task || !parent) return;
  setState(
    produce((draft) => {
      const host = draft.tasks[parent.id];
      if (host) host.subTaskIds = host.subTaskIds.filter((id) => id !== taskId);
      const self = draft.tasks[taskId];
      if (self) self.parentId = null;
    }),
  );
  persist();
  record(updateTaskOp(parent.id, { subTaskIds: parent.subTaskIds.filter((id) => id !== taskId) }));
  record(updateTaskOp(taskId, { parentId: null }));
};

export const setPriority = (taskId: string, priority: TaskPriority | null): void => {
  updateTask(taskId, { priority });
};

export const setDueDay = (taskId: string, dueDay: string | null): void => {
  updateTask(taskId, { dueDay, dueWithTime: null });
};

export const scheduleToday = (taskId: string): void => {
  updateTask(taskId, { dueDay: todayStr(), dueWithTime: null });
};

export const removeSchedule = (taskId: string): void => {
  updateTask(taskId, { dueDay: null, dueWithTime: null });
};

/* ------------------------------------------------------------------ views */

export const setView = (view: ViewId): void => {
  setState('view', view);
};

export const selectTask = (taskId: string | null): void => {
  setState('selectedTaskId', taskId);
};

/* --------------------------------------------------------------- selectors */

export const allTasks = (): Task[] =>
  Object.values(state.tasks).sort((a, b) => a.created - b.created);

export const rootTasks = (): Task[] => allTasks().filter((task) => !task.parentId);

/** Today's open tasks: timed ones first by clock time, then the rest in creation order. */
export const tasksForToday = (): Task[] =>
  rootTasks()
    .filter((task) => isTaskForToday(task))
    .sort((a, b) => {
      if (a.dueWithTime != null && b.dueWithTime != null) return a.dueWithTime - b.dueWithTime;
      if (a.dueWithTime != null) return -1;
      if (b.dueWithTime != null) return 1;
      return 0;
    });

/** Root tasks finished on the given logical day. */
export const doneOnDay = (day: string): Task[] =>
  rootTasks()
    .filter((task) => task.isDone && task.doneOn && todayStr(new Date(task.doneOn)) === day)
    .sort((a, b) => (b.doneOn ?? 0) - (a.doneOn ?? 0));

/**
 * The project a task really belongs to.
 *
 * An instance of a repeating task can be filed under Inbox when it was imported
 * before its project was known, while the repeat config still names the real
 * project. The config is the source of truth in that case, so the task shows up
 * in its project tab instead of silently landing in Inbox.
 */
export const effectiveProjectId = (task: Task): string => {
  if (task.projectId !== INBOX_PROJECT_ID || !task.repeatCfgId) return task.projectId;
  const cfgProject = state.repeatCfgs[task.repeatCfgId]?.projectId;
  return cfgProject && state.projects[cfgProject] ? cfgProject : task.projectId;
};

export const tasksForInbox = (): Task[] =>
  rootTasks().filter((task) => effectiveProjectId(task) === INBOX_PROJECT_ID && !task.isDone);

export const tasksForProject = (projectId: string): Task[] =>
  rootTasks().filter((task) => effectiveProjectId(task) === projectId && !task.isDone);

/**
 * The next occurrence of each repeating task in a project (or Inbox) that has no
 * open instance yet, so a daily task is visible in its project even on the days
 * nobody has generated it.
 */
export const upcomingRepeatsForProject = (projectId: string): ProjectedOccurrence[] => {
  const today = todayStr();
  const result: ProjectedOccurrence[] = [];
  for (const cfg of repeatConfigs()) {
    if (cfg.isPaused || !cfg.title?.trim()) continue;
    const cfgProject = cfg.projectId && state.projects[cfg.projectId] ? cfg.projectId : INBOX_PROJECT_ID;
    if (cfgProject !== projectId) continue;
    const hasOpenInstance = Object.values(state.tasks).some(
      (task) => task.repeatCfgId === cfg.id && !task.isDone && !task.parentId,
    );
    if (hasOpenInstance) continue;
    const day = nextOccurrenceDay(cfg, today, { inclusive: true });
    if (!day) continue;
    const occurrence = projectOccurrence(cfg, day);
    if (occurrence && !state.tasks[occurrence.id]) result.push(occurrence);
  }
  return result.sort((a, b) => a.day.localeCompare(b.day) || (a.startMinutes ?? -1) - (b.startMinutes ?? -1));
};

export const tasksForTag = (tagId: string): Task[] =>
  rootTasks().filter((task) => task.tagIds.includes(tagId) && !task.isDone);

export const doneTasks = (): Task[] => rootTasks().filter((task) => task.isDone);

export const projectTags = (projectId: string): Tag[] =>
  state.tagOrder
    .map((id) => state.tags[id])
    .filter((tag): tag is Tag => tag !== undefined)
    .filter((tag) => tasksForProject(projectId).some((t) => t.tagIds.includes(tag.id)));

export const taskById = (taskId: string): Task | undefined => state.tasks[taskId];

export const selectedTask = (): Task | undefined => {
  const id = state.selectedTaskId;
  return id ? state.tasks[id] : undefined;
};

export const todayTotalMs = (): number => {
  const day = todayStr();
  return allTasks().reduce((sum, task) => sum + (task.timeSpentOnDay[day] ?? 0), 0);
};

export const resetAllData = (): void => {
  setState(initialState());
  persist();
};

export const dayKey = toDayStr;

/* ----------------------------------------------------------------- metrics */

export const metricForDay = (day: string): MetricRecord => state.metrics[day] ?? emptyMetric(day);

/** Record a completed focus session on today's metric (upstream stores timestamps). */
export const recordFocusSession = (duration: number): void => {
  const day = todayStr();
  setState(
    produce((draft) => {
      const metric = draft.metrics[day] ?? emptyMetric(day);
      const sessions = metric.focusSessions ?? [];
      metric.focusSessions = [...sessions, Date.now() - duration];
      draft.metrics[day] = metric;
    }),
  );
  persist();
  record(logFocusSessionOp(day, duration));
};

export const setDayReflection = (day: string, text: string): void => {
  setState(
    produce((draft) => {
      const metric = draft.metrics[day] ?? emptyMetric(day);
      metric.reflections = [...(metric.reflections ?? []), { text, created: Date.now() }];
      draft.metrics[day] = metric;
    }),
  );
  persist();
};
/* ------------------------------------------------- projects and tags (CRUD) */

export const addProject = (title: string, color = '#8a8a8a', icon = 'briefcase'): Project => {
  const project: Project = {
    id: `p-${crypto.randomUUID()}`,
    title: title.trim() || 'Untitled project',
    color,
    icon,
    created: Date.now(),
  };
  setState(produce((draft) => {
    draft.projects[project.id] = project;
    draft.projectOrder.push(project.id);
  }));
  persist();
  record(addProjectOp(project));
  return project;
};

export const updateProject = (projectId: string, patch: Partial<Project>): void => {
  setState(produce((draft) => {
    const project = draft.projects[projectId];
    if (!project) return;
    Object.assign(project, patch);
    project.updated = Date.now();
  }));
  persist();
  record(updateProjectOp(projectId, patch));
};

export const deleteProject = (projectId: string): void => {
  if (projectId === INBOX_PROJECT_ID) return;
  // Tasks of a deleted project move to Inbox rather than being destroyed.
  const moved = Object.values(state.tasks).filter((task) => task.projectId === projectId);
  setState(produce((draft) => {
    for (const task of moved) {
      const target = draft.tasks[task.id];
      if (target) target.projectId = INBOX_PROJECT_ID;
    }
    delete draft.projects[projectId];
    draft.projectOrder = draft.projectOrder.filter((id) => id !== projectId);
    if (draft.view === `project:${projectId}`) draft.view = 'inbox';
  }));
  persist();
  for (const task of moved) {
    record(updateTaskOp(task.id, { projectId: INBOX_PROJECT_ID }));
  }
  record(deleteProjectOp(projectId));
};

export const addTag = (title: string, color = '#8a8a8a'): Tag => {
  const existing = state.tagOrder
    .map((id) => state.tags[id])
    .find((tag) => tag && tag.title.toLowerCase() === title.trim().toLowerCase());
  if (existing) return existing;

  const tag: Tag = {
    id: `t-${crypto.randomUUID()}`,
    title: title.trim().toLowerCase() || 'tag',
    color,
    created: Date.now(),
  };
  setState(produce((draft) => {
    draft.tags[tag.id] = tag;
    draft.tagOrder.push(tag.id);
  }));
  persist();
  record(addTagOp(tag));
  return tag;
};

export const deleteTag = (tagId: string): void => {
  setState(produce((draft) => {
    delete draft.tags[tagId];
    draft.tagOrder = draft.tagOrder.filter((id) => id !== tagId);
    for (const task of Object.values(draft.tasks)) {
      if (task.tagIds.includes(tagId)) {
        task.tagIds = task.tagIds.filter((id) => id !== tagId);
      }
    }
    if (draft.view === `tag:${tagId}`) draft.view = 'today';
  }));
  persist();
  for (const task of Object.values(state.tasks)) {
    if (task.tagIds.includes(tagId)) continue;
    record(updateTaskOp(task.id, { tagIds: task.tagIds }));
  }
  record(deleteTagOp(tagId));
};

/* ------------------------------------------------------- planner and schedule */

/** Tasks planned for a day, in planner order. */
export const plannerTasksForDay = (day: string, includeDone = false): Task[] =>
  (state.plannerDays[day] ?? [])
    .map((id) => state.tasks[id])
    .filter((task): task is Task => !!task && (includeDone || !task.isDone));

/** Days that currently hold at least one task, newest last. */
export const plannerDaysWithTasks = (): string[] =>
  Object.keys(state.plannerDays)
    .filter((day) => (state.plannerDays[day] ?? []).length > 0)
    .sort();

const writePlan = (day: string, taskIds: string[]): void => {
  const unique = Array.from(new Set(taskIds));
  setState(
    produce((draft) => {
      if (unique.length === 0) delete draft.plannerDays[day];
      else draft.plannerDays[day] = unique;
    }),
  );
  persist();
  record(upsertPlannerDayOp(day, unique));
};

/** Put a task on a planner day. Moving between days removes the old entry. */
export const planTaskForDay = (taskId: string, day: string): void => {
  const previous = Object.keys(state.plannerDays).filter((key) =>
    (state.plannerDays[key] ?? []).includes(taskId),
  );
  for (const key of previous) {
    if (key === day) continue;
    writePlan(
      key,
      (state.plannerDays[key] ?? []).filter((id) => id !== taskId),
    );
  }

  writePlan(day, [...(state.plannerDays[day] ?? []), taskId]);
  // A planned task is due that day, which is what Today/Planner read.
  updateTask(taskId, { dueDay: day, dueWithTime: null });
};

export const unplanTask = (taskId: string): void => {
  for (const day of Object.keys(state.plannerDays)) {
    const ids = state.plannerDays[day] ?? [];
    if (!ids.includes(taskId)) continue;
    writePlan(
      day,
      ids.filter((id) => id !== taskId),
    );
  }
  updateTask(taskId, { dueDay: null });
};

export const removeTaskFromPlannerDay = (taskId: string, day: string): void => {
  writePlan(
    day,
    (state.plannerDays[day] ?? []).filter((id) => id !== taskId),
  );
};

/** Reorder within a day (upstream `[Planner] Move In List`). */
export const reorderPlannerDay = (day: string, fromIndex: number, toIndex: number): void => {
  const ids = [...(state.plannerDays[day] ?? [])];
  if (fromIndex < 0 || fromIndex >= ids.length) return;
  const [moved] = ids.splice(fromIndex, 1);
  if (!moved) return;
  ids.splice(toIndex, 0, moved);
  writePlan(day, ids);
};

/** Tasks with a time slot on a given local day, sorted by start time. */
export const scheduledTasksForDay = (day: string, includeDone = false): Task[] =>
  Object.values(state.tasks)
    .filter((task) => {
      if (task.parentId) return false;
      if ((task.isDone && !includeDone) || task.dueWithTime == null) return false;
      return toDayStr(new Date(task.dueWithTime as number)) === day;
    })
    .sort((a, b) => (a.dueWithTime ?? 0) - (b.dueWithTime ?? 0));

/** Fix a task to a specific time of day, or clear it when `time` is null. */
export const scheduleTaskAt = (taskId: string, day: string, time: string | null): void => {
  const task = state.tasks[taskId];
  if (!task) return;

  if (!time) {
    updateTask(taskId, { dueWithTime: null, remindAt: null, dueDay: day });
    record(unscheduleTaskOp(task));
    return;
  }

  const [hours, minutes] = time.split(':').map((part) => Number(part));
  const [year, month, date] = day.split('-').map((part) => Number(part));
  const dueWithTime = new Date(year!, (month ?? 1) - 1, date ?? 1, hours ?? 0, minutes ?? 0).getTime();

  updateTask(taskId, { dueWithTime, dueDay: null, remindAt: dueWithTime });
  record(scheduleTaskOp(task, { dueWithTime }));
};

/** Move a task onto today's planner list (upstream `planTasksForToday`). */
export const planForToday = (taskId: string): void => {
  const today = todayStr();
  updateTask(taskId, { dueDay: today });
  record(planTodayOp([taskId], today));
  planTaskForDay(taskId, today);
};

/* ------------------------------------------------------------------- metrics */

export const setDayMetric = (day: string, changes: Partial<MetricRecord>): void => {
  setState(
    produce((draft) => {
      const metric = draft.metrics[day] ?? emptyMetric(day);
      draft.metrics[day] = { ...metric, ...changes, id: day };
    }),
  );
  persist();
  record(updateMetricOp(day, changes));
};

export const upsertDayMetric = (metric: MetricRecord): void => {
  setState(
    produce((draft) => {
      draft.metrics[metric.id] = { ...(draft.metrics[metric.id] ?? {}), ...metric };
    }),
  );
  persist();
  record(upsertMetricOp(metric));
};
export const updateTag = (tagId: string, patch: Partial<Tag>): void => {
  setState(
    produce((draft) => {
      const tag = draft.tags[tagId];
      if (tag) Object.assign(tag, patch);
    }),
  );
  persist();
  record(updateTagOp(tagId, patch));
};

/* ------------------------------------------------------ repeating tasks */

export const repeatConfigs = (): TaskRepeatCfg[] => Object.values(state.repeatCfgs);

/** Store a repeat definition. `record` is false for demo/import seeding. */
export const upsertRepeatConfig = (cfg: TaskRepeatCfg, options = { record: true }): void => {
  setState(
    produce((draft) => {
      draft.repeatCfgs[cfg.id] = cfg;
    }),
  );
  persist();
  if (!options.record) return;

  record(
    buildRepeatConfigOp(cfg),
  );
};

/**
 * Occurrences for a day that have not been materialised as real tasks yet.
 *
 * Upstream creates `rpt_<cfgId>_<day>` instances lazily, so a freshly synced
 * device holds only past instances. Projecting from the configs is what makes
 * future days show anything at all.
 */
export const projectedTasksForDay = (day: string) =>
  projectDay(repeatConfigs(), day).filter((occurrence) => !state.tasks[occurrence.id]);

/** True when a real instance already exists for this occurrence. */
export const isMaterialised = (cfgId: string, day: string): boolean =>
  !!state.tasks[`rpt_${cfgId}_${day}`];

/** Apply a partial config change locally and record one update op. */
export const patchRepeatConfig = (cfgId: string, changes: Partial<TaskRepeatCfg>): void => {
  if (!state.repeatCfgs[cfgId]) return;
  setState(
    produce((draft) => {
      const cfg = draft.repeatCfgs[cfgId];
      if (cfg) Object.assign(cfg, changes);
    }),
  );
  persist();
  record(updateRepeatConfigOp(cfgId, changes));
};

/** Create a brand-new series and return its id. */
export const createRepeatConfig = (cfg: Omit<TaskRepeatCfg, 'id'>, fromTaskId?: string): TaskRepeatCfg => {
  const full: TaskRepeatCfg = { ...cfg, id: crypto.randomUUID().replace(/-/g, '').slice(0, 21) };
  setState(
    produce((draft) => {
      draft.repeatCfgs[full.id] = full;
    }),
  );
  persist();
  record(buildRepeatConfigOp(full, fromTaskId));
  return full;
};

/** Remove a series. Already-created instances stay as ordinary tasks. */
export const deleteRepeatConfig = (cfgId: string): void => {
  if (!state.repeatCfgs[cfgId]) return;
  setState(
    produce((draft) => {
      delete draft.repeatCfgs[cfgId];
      for (const task of Object.values(draft.tasks)) {
        if (task.repeatCfgId === cfgId) task.repeatCfgId = null;
      }
    }),
  );
  persist();
  record(deleteRepeatConfigOp(cfgId));
};

/**
 * Turn an occurrence into a real task (idempotent: the id is deterministic, so
 * two devices doing this for the same day converge on one task).
 *
 * - a config with `startTime` yields a timed task (`dueWithTime`), otherwise an
 *   all-day task (`dueDay`) — the two are mutually exclusive;
 * - subtask templates become subtasks with deterministic ids.
 */
export const materialiseOccurrence = (cfgId: string, day: string): Task | undefined => {
  const id = instanceId(cfgId, day);
  const existing = state.tasks[id];
  if (existing) return existing;
  const cfg = state.repeatCfgs[cfgId];
  if (!cfg || !occursOnDay(cfg, day)) return undefined;
  const title = cfg.title?.trim();
  if (!title) return undefined;

  const timed = !!cfg.startTime;
  const dueWithTime = timed ? repeatDueWithTime(cfg.startTime as string, day, getDayStartMinutes()) : null;
  const parent = createTask({
    id,
    title,
    projectId: cfg.projectId ?? INBOX_PROJECT_ID,
    tagIds: [...(cfg.tagIds ?? [])],
    timeEstimate: cfg.defaultEstimate ?? 0,
    notes: cfg.notes || undefined,
    priority: cfg.priority ?? null,
    repeatCfgId: cfg.id,
    dueDay: timed ? null : day,
    dueWithTime,
    remindAt: timed && cfg.remindAt ? dueWithTime : null,
  });

  const templates = cfg.subTaskTemplates ?? [];
  const children = templates.map((template, index) =>
    createTask({
      id: instanceSubTaskId(id, index),
      title: template.title,
      projectId: parent.projectId,
      parentId: id,
      timeEstimate: template.timeEstimate ?? 0,
      notes: template.notes,
    }),
  );
  parent.subTaskIds = children.map((child) => child.id);

  setState(
    produce((draft) => {
      draft.tasks[parent.id] = parent;
      for (const child of children) draft.tasks[child.id] = child;
    }),
  );
  persist();
  record(addTaskOp(parent));
  for (const child of children) record(addTaskOp(child));
  patchRepeatConfig(cfg.id, { lastTaskCreationDay: day, lastTaskCreation: Date.now() });
  return parent;
};

/**
 * Create today's instance for every series that occurs today. Runs on start and
 * on day change; `waitForCompletion` series are skipped while an earlier
 * instance is still open, and nothing is back-filled for missed days.
 */
export const materialiseToday = (): void => {
  const day = todayStr();
  for (const cfg of repeatConfigs()) {
    if (!occursOnDay(cfg, day)) continue;
    if (cfg.waitForCompletion) {
      const open = Object.values(state.tasks).some(
        (task) => task.repeatCfgId === cfg.id && !task.isDone && task.id !== instanceId(cfg.id, day),
      );
      if (open) continue;
    }
    materialiseOccurrence(cfg.id, day);
  }
};

/** Open tasks whose day has passed — the "overdue" section of Today. */
export const overdueTasks = (): Task[] =>
  rootTasks()
    .filter((task) => !task.isDone && isOverdue(task) && !isTaskForToday(task))
    .sort((a, b) => (a.dueWithTime ?? Date.parse(`${a.dueDay}T00:00:00`)) - (b.dueWithTime ?? Date.parse(`${b.dueDay}T00:00:00`)));

/* ------------------------------------------------------- remote application */

/**
 * Set once a server-side snapshot has been applied, so we stop replaying.
 *
 * The `.v2` suffix is deliberate: builds before the action-envelope fix marked
 * `.v1` while silently dropping most operations, so bumping the key makes those
 * installs re-download and re-apply everything exactly once.
 */
export const SNAPSHOT_IMPORTED_KEY = 'superprod.snapshotImported.v2';

export const hasImportedSnapshot = (): boolean => {
  try {
    return localStorage.getItem(SNAPSHOT_IMPORTED_KEY) === '1';
  } catch {
    return false;
  }
};

export const markSnapshotImported = (): void => {
  try {
    localStorage.setItem(SNAPSHOT_IMPORTED_KEY, '1');
  } catch {
    // Private mode: replaying on next start is harmless, just slower.
  }
};

export const forgetSnapshotImport = (): void => {
  try {
    localStorage.removeItem(SNAPSHOT_IMPORTED_KEY);
  } catch {
    // ignore
  }
};

/**
 * Replace local data with a decrypted full-state snapshot from another client.
 *
 * Imported entities are not re-recorded as operations: the snapshot already
 * represents them, and echoing them back would duplicate the user's history.
 */
const importSnapshot = (state: unknown): void => {
  const { tasks, projects, tags, repeatCfgs } = parseUpstreamSnapshot(state);

  setState(
    produce((draft) => {
      draft.tasks = Object.fromEntries(tasks.map((task) => [task.id, task]));
      draft.projects = Object.fromEntries(projects.map((project) => [project.id, project]));
      draft.projectOrder = projects.map((project) => project.id);
      draft.tags = Object.fromEntries(tags.map((tag) => [tag.id, tag]));
      draft.tagOrder = tags.map((tag) => tag.id);
      draft.repeatCfgs = Object.fromEntries(repeatCfgs.map((cfg) => [cfg.id, cfg]));
      draft.selectedTaskId = null;
    }),
  );

  markSnapshotImported();
};

/** True when there is nothing local worth protecting (fresh install / failed first sync). */
export const isStoreEmpty = (): boolean => Object.keys(state.tasks).length === 0;

/**
 * Apply a full-state snapshot fetched outside the operation stream (the server
 * compacted the history). Refuses shapes it cannot recognise so a bad response
 * can never wipe local data.
 */
export const importSnapshotState = (snapshot: unknown): { tasks: number } => {
  let root = snapshot;
  if (root && typeof root === 'object' && !('task' in root) && 'state' in root) {
    root = (root as { state: unknown }).state;
  }
  if (!root || typeof root !== 'object' || !('task' in root)) {
    throw new Error('Server snapshot has an unrecognised shape; local data left untouched.');
  }
  applyingRemote = true;
  try {
    importSnapshot(root);
  } finally {
    applyingRemote = false;
  }
  return { tasks: Object.keys(state.tasks).length };
};

/**
 * Apply an operation that arrived from another device.
 *
 * Runs with `applyingRemote` set so nothing is echoed back to the server.
 * Unknown action types are ignored rather than throwing, so a newer peer
 * cannot break an older client (forward compatibility).
 */
export const applyRemoteOperation = (op: Operation): void => {
  applyingRemote = true;
  try {
    if (isFullStateOperation(op.entityType, op.opType)) {
      importSnapshot(op.payload);
      return;
    }

    switch (op.entityType) {
      case 'TASK': {
        const parsed = taskFromPayload(op.payload);
        const entityId =
          op.entityId ?? parsed.id ?? entityIdFromPayload(op.payload, 'task') ?? null;

        if (op.opType === 'DEL') {
          if (!entityId) break;
          setState(
            produce((draft) => {
              const gone = draft.tasks[entityId];
              if (gone?.parentId) {
                const host = draft.tasks[gone.parentId];
                if (host) host.subTaskIds = host.subTaskIds.filter((id) => id !== entityId);
              }
              for (const childId of gone?.subTaskIds ?? []) delete draft.tasks[childId];
              delete draft.tasks[entityId];
              for (const day of Object.keys(draft.plannerDays)) {
                draft.plannerDays[day] = (draft.plannerDays[day] ?? []).filter((id) => id !== entityId);
              }
            }),
          );
          break;
        }

        // A complete task (addTask, scheduleTaskWithTime) replaces the record;
        // an `{ id, changes }` patch is merged into what we already have.
        const full = parsed.entity ? toTask(parsed.entity) : null;
        if (full) {
          setState(
            produce((draft) => {
              const existing = draft.tasks[full.id];
              draft.tasks[full.id] = existing ? { ...existing, ...full } : full;
              // Upstream's addTask reducer links a new subtask to its parent.
              const host = full.parentId ? draft.tasks[full.parentId] : undefined;
              if (host && !host.subTaskIds.includes(full.id)) host.subTaskIds.push(full.id);
            }),
          );
          break;
        }

        if (entityId && parsed.changes) {
          setState(
            produce((draft) => {
              const task = draft.tasks[entityId];
              if (task) Object.assign(task, parsed.changes);
            }),
          );
        }
        break;
      }

      case 'PROJECT': {
        const parsed = projectFromPayload(op.payload);
        const entityId = op.entityId ?? parsed.id ?? entityIdFromPayload(op.payload, 'project');
        if (!entityId) break;

        if (op.opType === 'DEL') {
          setState(
            produce((draft) => {
              delete draft.projects[entityId];
              draft.projectOrder = draft.projectOrder.filter((id) => id !== entityId);
            }),
          );
          break;
        }

        const full = parsed.entity ? toProject(parsed.entity) : null;
        if (full) {
          setState(
            produce((draft) => {
              draft.projects[full.id] = draft.projects[full.id]
                ? { ...draft.projects[full.id], ...full }
                : full;
              if (!draft.projectOrder.includes(full.id)) draft.projectOrder.push(full.id);
            }),
          );
          break;
        }

        if (parsed.changes) {
          setState(
            produce((draft) => {
              const project = draft.projects[entityId];
              if (project) Object.assign(project, parsed.changes);
            }),
          );
          break;
        }
        break;
      }

      case 'TAG': {
        const parsed = tagFromPayload(op.payload);
        const entityId = op.entityId ?? parsed.id ?? entityIdFromPayload(op.payload, 'tag');
        if (!entityId || entityId === 'TODAY') break;

        if (op.opType === 'DEL') {
          setState(
            produce((draft) => {
              delete draft.tags[entityId];
              draft.tagOrder = draft.tagOrder.filter((id) => id !== entityId);
            }),
          );
          break;
        }

        const full = parsed.entity ? toTag(parsed.entity) : null;
        if (full) {
          setState(
            produce((draft) => {
              draft.tags[full.id] = draft.tags[full.id]
                ? { ...draft.tags[full.id], ...full }
                : full;
              if (!draft.tagOrder.includes(full.id)) draft.tagOrder.push(full.id);
            }),
          );
          break;
        }

        if (parsed.changes) {
          setState(
            produce((draft) => {
              const tag = draft.tags[entityId];
              if (tag) Object.assign(tag, parsed.changes);
            }),
          );
        }
        break;
      }

      case 'GLOBAL_CONFIG': {
        // Settings arrive as `{ sectionKey, sectionCfg }`. Merge known keys only,
        // so a newer client cannot inject fields this build does not understand.
        const section = configSectionFromPayload(op.payload);
        if (!section) break;
        const current = config[section.sectionKey as keyof typeof config];
        if (!current || typeof current !== 'object') break;
        for (const [key, value] of Object.entries(section.sectionCfg)) {
          if (Object.prototype.hasOwnProperty.call(current, key)) {
            updateConfig(section.sectionKey as never, key as never, value as never);
          }
        }
        break;
      }

      case 'TASK_REPEAT_CFG': {
        if (op.opType === 'DEL') {
          const delId = op.entityId;
          if (!delId) break;
          setState(
            produce((draft) => {
              delete draft.repeatCfgs[delId];
            }),
          );
          break;
        }
        // Payload is `{ taskRepeatCfg }`, where the value is either a full config
        // or `{ id, changes }` (upstream's "Update TaskRepeatCfg").
        const action = unwrapActionPayload(op.payload);
        const raw = action['taskRepeatCfg'] as Record<string, unknown> | undefined;
        if (!raw) break;

        const id = typeof raw['id'] === 'string' ? (raw['id'] as string) : op.entityId;
        if (!id) break;

        const incoming = raw['changes'] as Record<string, unknown> | undefined;
        const value = (incoming ?? raw) as unknown as TaskRepeatCfg;

        setState(
          produce((draft) => {
            draft.repeatCfgs[id] = {
              ...(draft.repeatCfgs[id] ?? { id, repeatCycle: 'DAILY' as const }),
              ...value,
              id,
            };
          }),
        );
        break;
      }

      case 'PLANNER': {
        // Payload is `{ day, taskIds }`; the entity state is `{ days: { day: ids } }`.
        const action = op.payload as { actionPayload?: Record<string, unknown> } | undefined;
        const inner = action?.actionPayload ?? (op.payload as Record<string, unknown>);
        const day = typeof inner?.['day'] === 'string' ? (inner['day'] as string) : op.entityId;
        const taskIds = Array.isArray(inner?.['taskIds'])
          ? (inner['taskIds'] as unknown[]).filter((id): id is string => typeof id === 'string')
          : null;
        if (!day) break;

        setState(
          produce((draft) => {
            if (taskIds) {
              if (taskIds.length === 0) delete draft.plannerDays[day];
              else draft.plannerDays[day] = taskIds;
            }
          }),
        );
        break;
      }

      case 'METRIC': {
        const action = unwrapActionPayload(op.payload);
        const rawMetric = action['metric'] as Record<string, unknown> | undefined;
        const day = op.entityId ?? (typeof action['day'] === 'string' ? (action['day'] as string) : '');

        if (op.opType === 'DEL') {
          if (day) {
            setState(
              produce((draft) => {
                delete draft.metrics[day];
              }),
            );
          }
          break;
        }

        // `[Metric] Log Focus Session` carries `{ day, duration }`.
        if (typeof action['duration'] === 'number' && day) {
          const duration = action['duration'] as number;
          setState(
            produce((draft) => {
              const metric = draft.metrics[day] ?? emptyMetric(day);
              metric.focusSessions = [...(metric.focusSessions ?? []), Date.now() - duration];
              draft.metrics[day] = metric;
            }),
          );
          break;
        }

        if (rawMetric && typeof rawMetric['id'] === 'string') {
          const incoming = rawMetric['changes'] as Record<string, unknown> | undefined;
          const id = rawMetric['id'] as string;
          setState(
            produce((draft) => {
              const metric = draft.metrics[id] ?? emptyMetric(id);
              draft.metrics[id] = (incoming
                ? { ...metric, ...incoming }
                : { ...metric, ...rawMetric }) as unknown as MetricRecord;
            }),
          );
        }
        break;
      }

      default:
        // Unknown entity type from a newer client: ignore, never throw.
        break;
    }
  } finally {
    applyingRemote = false;
  }
  persist();
};