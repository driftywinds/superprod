import { createStore, produce } from 'solid-js/store';
import { createSignal } from 'solid-js';
import { parseShortSyntax } from '../domain/short-syntax';
import { recordOperation } from '../sync/runner';
import type { Operation } from '../core/operation';
import { isFullStateOperation, parseUpstreamSnapshot } from '../sync/snapshot';
import { emptyMetric, type MetricRecord } from '../domain/metrics';
import {
  configSectionFromPayload,
  entityIdFromPayload,
  projectFromPayload,
  tagFromPayload,
  taskFromPayload,
  toProject,
  toTag,
  toTask,
} from '../sync/payloads';
import { config, updateConfig } from './config-store';
import {
  INBOX_PROJECT_ID,
  createTask,
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
    return { ...initialState(), ...parsed };
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
  record({ actionType: '[Task] Add Task', opType: 'CRT', entityType: 'TASK', entityId: task.id, payload: task });
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
  record({
    actionType: '[Task] Update Task',
    opType: 'UPD',
    entityType: 'TASK',
    entityId: taskId,
    payload: { ...patch, modified },
  });
};

export const deleteTask = (taskId: string): void => {
  if (isTracking(taskId)) commitElapsed();
  setState(produce((draft) => {
    const task = draft.tasks[taskId];
    if (!task) return;
    if (task.parentId) {
      const parent = draft.tasks[task.parentId];
      if (parent) parent.subTaskIds = parent.subTaskIds.filter((id) => id !== taskId);
    }
    delete draft.tasks[taskId];
    if (draft.selectedTaskId === taskId) draft.selectedTaskId = null;
  }));
  persist();
  record({ actionType: '[Task] Delete Task', opType: 'DEL', entityType: 'TASK', entityId: taskId, payload: {} });
};

export const toggleDone = (taskId: string): void => {
  if (isTracking(taskId)) commitElapsed();
  setState(produce((draft) => {
    const task = draft.tasks[taskId];
    if (!task) return;
    task.isDone = !task.isDone;
    task.doneOn = task.isDone ? Date.now() : null;
    task.modified = Date.now();
  }));
  persist();
  const updated = state.tasks[taskId];
  if (updated) {
    record({
      actionType: '[Task] Toggle Done',
      opType: 'UPD',
      entityType: 'TASK',
      entityId: taskId,
      payload: { isDone: updated.isDone, doneOn: updated.doneOn },
    });
  }
};

export const addSubTask = (parentId: string, title: string): void => {
  const parent = state.tasks[parentId];
  if (!parent) return;
  const child = createTask({
    title,
    projectId: parent.projectId,
    parentId,
    tagIds: [...parent.tagIds],
  });
  setState(produce((draft) => {
    draft.tasks[child.id] = child;
    draft.tasks[parentId]?.subTaskIds.push(child.id);
  }));
  persist();
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

export const tasksForToday = (): Task[] =>
  rootTasks().filter((task) => isTaskForToday(task));

export const tasksForInbox = (): Task[] =>
  rootTasks().filter((task) => task.projectId === INBOX_PROJECT_ID && !task.isDone);

export const tasksForProject = (projectId: string): Task[] =>
  rootTasks().filter((task) => task.projectId === projectId && !task.isDone);

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
  record({
    actionType: '[Project] Add Project',
    opType: 'CRT',
    entityType: 'PROJECT',
    entityId: project.id,
    payload: project,
  });
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
  record({
    actionType: '[Project] Update Project',
    opType: 'UPD',
    entityType: 'PROJECT',
    entityId: projectId,
    payload: patch,
  });
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
    record({
      actionType: '[Task] Update Task',
      opType: 'UPD',
      entityType: 'TASK',
      entityId: task.id,
      payload: { projectId: INBOX_PROJECT_ID },
    });
  }
  record({
    actionType: '[Project] Delete Project',
    opType: 'DEL',
    entityType: 'PROJECT',
    entityId: projectId,
    payload: {},
  });
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
  record({
    actionType: '[Tag] Add Tag',
    opType: 'CRT',
    entityType: 'TAG',
    entityId: tag.id,
    payload: tag,
  });
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
    record({
      actionType: '[Task] Update Task',
      opType: 'UPD',
      entityType: 'TASK',
      entityId: task.id,
      payload: { tagIds: task.tagIds },
    });
  }
  record({ actionType: '[Tag] Delete Tag', opType: 'DEL', entityType: 'TAG', entityId: tagId, payload: {} });
};

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
  const { tasks, projects, tags } = parseUpstreamSnapshot(state);

  setState(
    produce((draft) => {
      draft.tasks = Object.fromEntries(tasks.map((task) => [task.id, task]));
      draft.projects = Object.fromEntries(projects.map((project) => [project.id, project]));
      draft.projectOrder = projects.map((project) => project.id);
      draft.tags = Object.fromEntries(tags.map((tag) => [tag.id, tag]));
      draft.tagOrder = tags.map((tag) => tag.id);
      draft.selectedTaskId = null;
    }),
  );

  markSnapshotImported();
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
              delete draft.tasks[entityId];
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

      default:
        // Unknown entity type from a newer client: ignore, never throw.
        break;
    }
  } finally {
    applyingRemote = false;
  }
  persist();
};