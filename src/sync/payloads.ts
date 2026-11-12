import type { Project, Tag, Task } from '../domain/models';
import { INBOX_PROJECT_ID } from '../domain/models';

/**
 * Upstream operation payloads are wrapped:
 *
 *   { actionPayload: {...}, entityChanges: [...] }
 *
 * and the entity sits under a named key whose meaning depends on the action:
 *
 *   addTask                  { task: Task }
 *   scheduleTaskWithTime     { task: Task, dueWithTime, remindAt }
 *   deleteTask               { task: Task }
 *   Update Tag               { tag: { id, changes } }
 *   Add Project              { project: Project }
 *   Update Global Config     { sectionKey, sectionCfg }
 *
 * This client's own operations use a bare payload, so every helper here accepts
 * both shapes. Getting this wrong silently drops the user's data, which is
 * exactly what happened before these helpers existed.
 */

type Bag = Record<string, unknown>;

const isBag = (value: unknown): value is Bag =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Strip the `{ actionPayload, entityChanges }` envelope when present. */
export const unwrapActionPayload = (payload: unknown): Bag => {
  if (!isBag(payload)) return {};
  const inner = payload['actionPayload'];
  return isBag(inner) ? inner : payload;
};

export interface EntityPayload<T> {
  id: string | null;
  /** A complete entity to create or replace. */
  entity: T | null;
  /** A partial patch, when the payload carried `{ id, changes }`. */
  changes: Bag | null;
}

const remapProjectId = (id: unknown): string =>
  id === 'INBOX_PROJECT' ? INBOX_PROJECT_ID : typeof id === 'string' ? id : INBOX_PROJECT_ID;

/** Accepts `{ entity }`, `{ id, changes }`, or a bare entity. */
const extract = <T>(raw: unknown): EntityPayload<T> => {
  if (!isBag(raw)) return { id: null, entity: null, changes: null };

  const id = typeof raw['id'] === 'string' ? (raw['id'] as string) : null;
  const changes = isBag(raw['changes']) ? (raw['changes'] as Bag) : null;

  // `{ id, changes }` is a patch, not a full entity.
  if (id && changes) return { id, entity: null, changes };

  if (typeof raw['id'] === 'string') {
    return { id, entity: raw as unknown as T, changes: null };
  }

  return { id: null, entity: null, changes: null };
};

export const taskFromPayload = (
  payload: unknown,
): EntityPayload<Partial<Task>> & { task: Partial<Task> | null } => {
  const action = unwrapActionPayload(payload);
  const raw = action['task'];

  if (isBag(raw) && typeof raw['id'] !== 'string' && isBag(raw['changes'])) {
    // Defensive: `{ task: { id?, changes } }` without a top-level id.
    return { id: null, entity: null, changes: raw['changes'] as Bag, task: null };
  }

  const extracted = extract<Partial<Task>>(raw);
  return { ...extracted, task: extracted.entity ?? (extracted.changes as Partial<Task> | null) };
};

export const tagFromPayload = (payload: unknown): EntityPayload<Tag> => {
  const action = unwrapActionPayload(payload);
  return extract<Tag>(action['tag']);
};

export const projectFromPayload = (payload: unknown): EntityPayload<Project> => {
  const action = unwrapActionPayload(payload);
  return extract<Project>(action['project']);
};

/** Entity id from an entity-bearing payload (delete operations carry the task). */
export const entityIdFromPayload = (
  payload: unknown,
  key: 'task' | 'tag' | 'project',
): string | null => {
  const action = unwrapActionPayload(payload);
  const raw = action[key];
  if (!isBag(raw)) return null;
  if (typeof raw['id'] === 'string') return raw['id'] as string;
  const changes = raw['changes'];
  if (isBag(changes) && typeof changes['id'] === 'string') return changes['id'] as string;
  return null;
};

/** `[Global Config] Update Global Config Section` */
export const configSectionFromPayload = (
  payload: unknown,
): { sectionKey: string; sectionCfg: Bag } | null => {
  const action = unwrapActionPayload(payload);
  const sectionKey = action['sectionKey'];
  const sectionCfg = action['sectionCfg'];
  if (typeof sectionKey !== 'string' || !isBag(sectionCfg)) return null;
  return { sectionKey, sectionCfg };
};

/** Coerce an upstream task object into this client's model. */
export const toTask = (raw: unknown): Task | null => {
  if (!isBag(raw)) return null;
  const id = typeof raw['id'] === 'string' ? (raw['id'] as string) : '';
  const title = typeof raw['title'] === 'string' ? (raw['title'] as string) : '';
  if (!id || !title) return null;

  const asArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

  const days: Record<string, number> = {};
  const rawDays = raw['timeSpentOnDay'];
  if (isBag(rawDays)) {
    for (const [day, ms] of Object.entries(rawDays)) {
      if (typeof ms === 'number' && ms >= 0) days[day] = ms;
    }
  }

  return {
    id,
    title,
    notes: typeof raw['notes'] === 'string' ? (raw['notes'] as string) : undefined,
    projectId: remapProjectId(raw['projectId']),
    // TODAY is virtual and must never be stored on a task.
    tagIds: asArray(raw['tagIds']).filter((tagId) => tagId !== 'TODAY'),
    subTaskIds: asArray(raw['subTaskIds']),
    parentId: typeof raw['parentId'] === 'string' ? (raw['parentId'] as string) : null,
    created: typeof raw['created'] === 'number' ? (raw['created'] as number) : Date.now(),
    isDone: raw['isDone'] === true,
    doneOn: typeof raw['doneOn'] === 'number' ? (raw['doneOn'] as number) : null,
    timeEstimate: typeof raw['timeEstimate'] === 'number' ? (raw['timeEstimate'] as number) : 0,
    timeSpent: typeof raw['timeSpent'] === 'number' ? (raw['timeSpent'] as number) : 0,
    timeSpentOnDay: days,
    dueDay: typeof raw['dueDay'] === 'string' ? (raw['dueDay'] as string) : null,
    dueWithTime: typeof raw['dueWithTime'] === 'number' ? (raw['dueWithTime'] as number) : null,
    deadlineDay: typeof raw['deadlineDay'] === 'string' ? (raw['deadlineDay'] as string) : null,
    deadlineWithTime:
      typeof raw['deadlineWithTime'] === 'number' ? (raw['deadlineWithTime'] as number) : null,
    remindAt: typeof raw['remindAt'] === 'number' ? (raw['remindAt'] as number) : null,
    repeatCfgId: typeof raw['repeatCfgId'] === 'string' ? (raw['repeatCfgId'] as string) : null,
    priority:
      raw['priority'] === 1 || raw['priority'] === 2 || raw['priority'] === 3
        ? (raw['priority'] as 1 | 2 | 3)
        : null,
    attachments: Array.isArray(raw['attachments'])
      ? (raw['attachments'] as Task['attachments'])
      : [],
  };
};

export const toProject = (raw: unknown): Project | null => {
  if (!isBag(raw)) return null;
  const id = remapProjectId(raw['id']);
  if (!id) return null;
  const theme = isBag(raw['theme']) ? raw['theme'] : {};
  return {
    id,
    title: typeof raw['title'] === 'string' ? (raw['title'] as string) : 'Project',
    color: typeof theme['primary'] === 'string' ? (theme['primary'] as string) : '#8a8a8a',
    icon: typeof raw['icon'] === 'string' ? (raw['icon'] as string) : null,
    created: typeof raw['created'] === 'number' ? (raw['created'] as number) : Date.now(),
    isArchived: raw['isArchived'] === true,
    isEnableBacklog: raw['isEnableBacklog'] === true,
    isHiddenFromMenu: raw['isHiddenFromMenu'] === true,
  };
};

export const toTag = (raw: unknown): Tag | null => {
  if (!isBag(raw)) return null;
  const id = typeof raw['id'] === 'string' ? (raw['id'] as string) : '';
  if (!id || id === 'TODAY') return null;
  return {
    id,
    title:
      typeof raw['title'] === 'string' && raw['title']
        ? (raw['title'] as string).toLowerCase()
        : id,
    color: typeof raw['color'] === 'string' ? (raw['color'] as string) : '#8a8a8a',
    icon: null,
    created: typeof raw['created'] === 'number' ? (raw['created'] as number) : Date.now(),
  };
};
