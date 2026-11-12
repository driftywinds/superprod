import { createStore, produce } from 'solid-js/store';
import { createSignal } from 'solid-js';
import { parseShortSyntax } from '../domain/short-syntax';
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
  projectOrder: string[];
  tagOrder: string[];
  selectedTaskId: string | null;
  view: ViewId;
}

const SEED_PROJECTS: Project[] = [
  { id: INBOX_PROJECT_ID, title: 'Inbox', icon: 'inbox', created: 0, color: '#8a8a8a' },
  { id: 'p-work', title: 'Work', icon: 'briefcase', created: 0, color: '#e5e5e5' },
  { id: 'p-personal', title: 'Personal', icon: 'home', created: 0, color: '#5c5c5c' },
];

const SEED_TAGS: Tag[] = [
  { id: 't-deep', title: 'deep-work', color: '#e5e5e5', created: 0 },
  { id: 't-quick', title: 'quick', color: '#8a8a8a', created: 0 },
];

const initialState = (): AppState => ({
  tasks: {},
  projects: Object.fromEntries(SEED_PROJECTS.map((p) => [p.id, p])),
  tags: Object.fromEntries(SEED_TAGS.map((t) => [t.id, t])),
  projectOrder: SEED_PROJECTS.map((p) => p.id),
  tagOrder: SEED_TAGS.map((t) => t.id),
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
  setState(produce((draft) => {
    const task = draft.tasks[taskId];
    if (!task) return;
    Object.assign(task, patch);
    task.modified = Date.now();
  }));
  persist();
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
