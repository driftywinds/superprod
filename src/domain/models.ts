/**
 * Domain models, matching the upstream shapes in FEATURES.md §1.1, §1.13, §1.14.
 *
 * Field-for-field parity matters: these objects are what later gets persisted
 * and synced. Optional fields are optional because existing synced data lacks
 * them (upstream rule: new fields are `?` with a runtime default).
 */

export type TaskPriority = 1 | 2 | 3;

export type IssueProviderKey = string;

export interface TaskAttachment {
  id: string;
  type: 'FILE' | 'LINK';
  path: string;
  title?: string;
  icon?: string;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  projectId: string;
  tagIds: string[];
  subTaskIds: string[];
  parentId?: string | null;
  created: number;
  updated?: number;
  modified?: number;
  isDone: boolean;
  doneOn?: number | null;
  wontDoOn?: number;
  timeEstimate: number; // ms
  timeSpent: number; // ms
  timeSpentOnDay: Record<string, number>; // dayStr -> ms
  dueDay?: string | null; // YYYY-MM-DD
  dueWithTime?: number | null; // epoch ms — mutually exclusive with dueDay
  hasPlannedTime?: boolean;
  deadlineDay?: string | null;
  deadlineWithTime?: number | null;
  deadlineRemindAt?: number | null;
  remindAt?: number | null;
  reminderId?: string | null;
  repeatCfgId?: string | null;
  attachments: TaskAttachment[];
  priority?: TaskPriority | null;
  issueId?: string;
  issueProviderId?: string;
  issueType?: IssueProviderKey;
}

export interface Project {
  id: string;
  title: string;
  icon?: string | null;
  isArchived?: boolean;
  isEnableBacklog?: boolean;
  isHiddenFromMenu?: boolean;
  color?: string;
  created: number;
  updated?: number;
}

export interface Tag {
  id: string;
  title: string;
  color?: string | null;
  icon?: string | null;
  created: number;
  updated?: number;
}

/** The virtual Today list is not a real tag — never persist it in `task.tagIds`. */
export const TODAY_TAG_ID = 'TODAY';

export const INBOX_PROJECT_ID = 'INBOX';

export const DEFAULT_TASK: Omit<Task, 'id' | 'title' | 'projectId'> = {
  tagIds: [],
  subTaskIds: [],
  created: 0,
  isDone: false,
  timeEstimate: 0,
  timeSpent: 0,
  timeSpentOnDay: {},
  attachments: [],
};

export const createTask = (
  draft: Pick<Task, 'title' | 'projectId'> & Partial<Task>,
): Task => ({
  ...DEFAULT_TASK,
  // Fresh containers per task: spreading DEFAULT_TASK would share one array
  // between every task, so adding a subtask to one added it to all of them.
  tagIds: [],
  subTaskIds: [],
  timeSpentOnDay: {},
  attachments: [],
  created: draft.created ?? Date.now(),
  ...draft,
  id: draft.id ?? crypto.randomUUID(),
});

export const isTaskDone = (task: Task): boolean => task.isDone;

/** `YYYY-MM-DD` in local time — the app's day key everywhere. */
export const toDayStr = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Minutes after midnight at which the logical day rolls over (config `startOfNextDayTime`). */
let dayStartMinutes = 0;

export const setDayStartMinutes = (minutes: number): void => {
  dayStartMinutes = Number.isFinite(minutes) && minutes >= 0 ? minutes : 0;
};
export const getDayStartMinutes = (): number => dayStartMinutes;

/** Today's logical day: before the day-start offset it is still "yesterday". */
export const todayStr = (now: Date = new Date()): string =>
  toDayStr(new Date(now.getTime() - dayStartMinutes * 60_000));

/** A task belongs to Today when scheduled for today or due today (upstream rule). */
export const isTaskForToday = (task: Task, dayStr = todayStr()): boolean => {
  if (task.isDone) return false;
  if (task.dueWithTime != null) return toDayStr(new Date(task.dueWithTime)) === dayStr;
  if (task.dueDay != null) return task.dueDay === dayStr;
  return false;
};

export const isOverdue = (task: Task, now = Date.now()): boolean => {
  if (task.isDone) return false;
  if (task.dueWithTime != null) return task.dueWithTime < now;
  if (task.dueDay != null) return task.dueDay < toDayStr(new Date(now));
  return false;
};

export const remainingMs = (task: Task): number =>
  Math.max(0, task.timeEstimate - task.timeSpent);

export const priorityLabel = (priority: Task['priority']): string | null => {
  if (priority === 3) return 'High';
  if (priority === 2) return 'Medium';
  if (priority === 1) return 'Low';
  return null;
};
