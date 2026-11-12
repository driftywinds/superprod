import type { Project, Tag, Task } from '../domain/models';
import type { TaskRepeatCfg } from '../domain/repeat';
import { INBOX_PROJECT_ID } from '../domain/models';

/**
 * Maps an upstream SuperSync `SYNC_IMPORT` snapshot (entity `ALL`) into this
 * client's model.
 *
 * Upstream shape: `{ task: { ids[], entities{id→task} }, project: […], tag: […],
 * globalConfig: {…}, metric: …, simpleCounter: …, … }`.
 *
 * Only entities this client can represent faithfully are imported. Anything
 * unknown is ignored rather than guessed at — a wrong guess here would corrupt
 * the user's real data.
 */

/** Upstream ships the Inbox as `INBOX_PROJECT`; this client uses `INBOX`. */
const PROJECT_ID_ALIASES: Record<string, string> = {
  INBOX_PROJECT: INBOX_PROJECT_ID,
};

const remapProjectId = (id: string | undefined): string =>
  (id && PROJECT_ID_ALIASES[id]) || id || INBOX_PROJECT_ID;

interface EntityStateLike {
  ids?: string[];
  entities?: Record<string, unknown>;
}

const entriesOf = (state: unknown): Record<string, unknown>[] => {
  const entityState = state as EntityStateLike | undefined;
  if (!entityState?.entities) return [];
  return Object.values(entityState.entities).filter(
    (value): value is Record<string, unknown> => !!value && typeof value === 'object',
  );
};

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asDayMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [day, ms] of Object.entries(value as Record<string, unknown>)) {
    if (typeof ms === 'number' && ms > 0) out[day] = ms;
  }
  return out;
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export interface ImportedSnapshot {
  tasks: Task[];
  projects: Project[];
  tags: Tag[];
  repeatCfgs: TaskRepeatCfg[];
}

export const parseUpstreamSnapshot = (state: unknown): ImportedSnapshot => {
  const root = (state ?? {}) as Record<string, unknown>;

  const projects: Project[] = entriesOf(root['project']).map((raw) => {
    const theme = (raw['theme'] ?? {}) as Record<string, unknown>;
    const id = remapProjectId(asString(raw['id'], ''));
    return {
      id,
      title: asString(raw['title'], id === INBOX_PROJECT_ID ? 'Inbox' : 'Project'),
      color: typeof theme['primary'] === 'string' ? (theme['primary'] as string) : '#8a8a8a',
      icon: null,
      created: asNumber(raw['created'], Date.now()),
      isArchived: raw['isArchived'] === true,
      isEnableBacklog: raw['isEnableBacklog'] === true,
      isHiddenFromMenu: raw['isHiddenFromMenu'] === true,
    };
  });

  // The Inbox must always exist, even when the snapshot omits it.
  if (!projects.some((project) => project.id === INBOX_PROJECT_ID)) {
    projects.unshift({
      id: INBOX_PROJECT_ID,
      title: 'Inbox',
      color: '#8a8a8a',
      icon: 'inbox',
      created: Date.now(),
    });
  }

  const projectIds = new Set(projects.map((project) => project.id));

  const tags: Tag[] = entriesOf(root['tag']).map((raw) => ({
    id: asString(raw['id'], ''),
    title: asString(raw['title'], 'tag').toLowerCase(),
    color: typeof raw['color'] === 'string' ? (raw['color'] as string) : '#8a8a8a',
    icon: null,
    created: asNumber(raw['created'], Date.now()),
  }));

  const tagIds = new Set(tags.map((tag) => tag.id));

  const tasks: Task[] = entriesOf(root['task'])
    .map((raw): Task | null => {
      const id = asString(raw['id'], '');
      const title = asString(raw['title'], '');
      if (!id || !title) return null;

      const projectId = remapProjectId(
        typeof raw['projectId'] === 'string' ? (raw['projectId'] as string) : undefined,
      );

      return {
        id,
        title,
        notes: typeof raw['notes'] === 'string' ? (raw['notes'] as string) : undefined,
        projectId: projectIds.has(projectId) ? projectId : INBOX_PROJECT_ID,
        tagIds: asStringArray(raw['tagIds']).filter((tagId) => tagIds.has(tagId)),
        subTaskIds: asStringArray(raw['subTaskIds']),
        parentId: typeof raw['parentId'] === 'string' ? (raw['parentId'] as string) : null,
        created: asNumber(raw['created'], Date.now()),
        isDone: raw['isDone'] === true,
        doneOn: typeof raw['doneOn'] === 'number' ? (raw['doneOn'] as number) : null,
        timeEstimate: asNumber(raw['timeEstimate'], 0),
        timeSpent: asNumber(raw['timeSpent'], 0),
        timeSpentOnDay: asDayMap(raw['timeSpentOnDay']),
        dueDay: typeof raw['dueDay'] === 'string' ? (raw['dueDay'] as string) : null,
        dueWithTime:
          typeof raw['dueWithTime'] === 'number' ? (raw['dueWithTime'] as number) : null,
        deadlineDay: typeof raw['deadlineDay'] === 'string' ? (raw['deadlineDay'] as string) : null,
        deadlineWithTime:
          typeof raw['deadlineWithTime'] === 'number'
            ? (raw['deadlineWithTime'] as number)
            : null,
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
    })
    .filter((task): task is Task => task !== null);

  const repeatCfgs: TaskRepeatCfg[] = entriesOf(root['taskRepeatCfg'])
    .map((raw): TaskRepeatCfg | null => {
      const id = asString(raw['id'], '');
      if (!id) return null;
      const cycle = raw['repeatCycle'];
      return {
        // Keep every upstream field (monthly anchors, repeatUntilDay,
        // deletedInstanceDates, subTaskTemplates, …) so editing and re-sending
        // a config never silently drops data.
        ...(raw as unknown as Partial<TaskRepeatCfg>),
        id,
        title: typeof raw['title'] === 'string' ? (raw['title'] as string) : undefined,
        projectId: typeof raw['projectId'] === 'string' ? remapProjectId(raw['projectId'] as string) : null,
        tagIds: asStringArray(raw['tagIds']),
        defaultEstimate: asNumber(raw['defaultEstimate'], 0),
        startTime: typeof raw['startTime'] === 'string' ? (raw['startTime'] as string) : null,
        remindAt: raw['remindAt'] === 'AtStart' || raw['remindAt'] === 'BeforeStart' ? raw['remindAt'] : undefined,
        startDate: typeof raw['startDate'] === 'string' ? (raw['startDate'] as string) : undefined,
        repeatEvery: asNumber(raw['repeatEvery'], 1),
        repeatCycle:
          cycle === 'WEEKLY' || cycle === 'MONTHLY' || cycle === 'YEARLY' ? cycle : 'DAILY',
        isPaused: raw['isPaused'] === true,
        monday: raw['monday'] !== false,
        tuesday: raw['tuesday'] !== false,
        wednesday: raw['wednesday'] !== false,
        thursday: raw['thursday'] !== false,
        friday: raw['friday'] !== false,
        saturday: raw['saturday'] === true,
        sunday: raw['sunday'] === true,
        lastTaskCreationDay:
          typeof raw['lastTaskCreationDay'] === 'string'
            ? (raw['lastTaskCreationDay'] as string)
            : undefined,
        skipOverdue: raw['skipOverdue'] === true,
        notes: typeof raw['notes'] === 'string' ? (raw['notes'] as string) : undefined,
      };
    })
    .filter((cfg): cfg is TaskRepeatCfg => cfg !== null);

  return { tasks, projects, tags, repeatCfgs };
};

export const isFullStateOperation = (entityType: string, opType: string): boolean =>
  entityType === 'ALL' || entityType === 'RECOVERY' || opType === 'SYNC_IMPORT' || opType === 'BACKUP_IMPORT';
