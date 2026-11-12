import { describe, expect, it } from 'vitest';
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
} from '../src/sync/payloads';

/**
 * Payload shapes copied verbatim from a live SuperSync account. The envelope is
 * `{ actionPayload, entityChanges }`; missing it silently discarded every
 * remote task, so these cases are regression guards.
 */
const ADD_TASK = {
  actionPayload: {
    task: {
      id: '9cF-21Y---qjNtcSFXYBh',
      subTaskIds: [],
      timeSpentOnDay: {},
      timeSpent: 0,
      timeEstimate: 0,
      isDone: false,
      title: 'Shave',
      tagIds: [],
      created: 1792468806670,
      attachments: [],
      projectId: 'INBOX_PROJECT',
      dueWithTime: 1792503000000,
      hasPlannedTime: true,
    },
    workContextId: 'TODAY',
    workContextType: 'TAG',
  },
  entityChanges: [],
};

const SCHEDULE_TASK = {
  actionPayload: {
    task: {
      id: '9cF-21Y---qjNtcSFXYBh',
      subTaskIds: [],
      timeSpentOnDay: {},
      timeSpent: 0,
      timeEstimate: 0,
      isDone: false,
      title: 'Shave',
      tagIds: [],
      created: 1792468806670,
      attachments: [],
      projectId: 'INBOX_PROJECT',
      dueWithTime: 1792503000000,
      remindAt: 1792503000000,
    },
  },
  entityChanges: [],
};

const UPDATE_TAG = {
  actionPayload: { tag: { id: 'TODAY', changes: { taskIds: ['9cF-21Y---qjNtcSFXYBh'] } } },
  entityChanges: [],
};

const ADD_PROJECT = {
  actionPayload: {
    project: {
      id: '1T9BqRMnj7MNkZzeBqp7p',
      title: 'MAIN TIME',
      theme: { primary: '#ff7043' },
      taskIds: [],
      isArchived: false,
    },
  },
  entityChanges: [],
};

const DELETE_TASK = {
  actionPayload: {
    task: { id: 'EfRN6RUWRG3aXcCgR_3-I', title: 'Check exam status', projectId: 'INBOX_PROJECT' },
  },
  entityChanges: [],
};

const UPDATE_CONFIG = {
  actionPayload: { sectionKey: 'localization', sectionCfg: { firstDayOfWeek: 1 } },
  entityChanges: [],
};

describe('unwrapActionPayload', () => {
  it('unwraps the upstream envelope', () => {
    expect(unwrapActionPayload(ADD_TASK)).toHaveProperty('task');
  });

  it('passes through this client’s bare payloads', () => {
    const bare = { id: 't1', title: 'x' };
    expect(unwrapActionPayload(bare)).toBe(bare);
  });

  it('survives garbage', () => {
    expect(unwrapActionPayload(null)).toEqual({});
    expect(unwrapActionPayload('nope')).toEqual({});
  });
});

describe('taskFromPayload', () => {
  it('reads an added task through the envelope', () => {
    const parsed = taskFromPayload(ADD_TASK);
    expect(parsed.id).toBe('9cF-21Y---qjNtcSFXYBh');

    const task = toTask(parsed.entity);
    expect(task?.title).toBe('Shave');
    expect(task?.projectId).toBe('INBOX');
    expect(task?.dueWithTime).toBe(1792503000000);
  });

  it('reads a rescheduled task', () => {
    const parsed = taskFromPayload(SCHEDULE_TASK);
    expect(toTask(parsed.entity)?.remindAt).toBe(1792503000000);
  });

  it('drops the virtual TODAY tag', () => {
    const parsed = taskFromPayload({
      actionPayload: { task: { id: 't1', title: 'x', tagIds: ['TODAY', 'tag1'] } },
    });
    expect(toTask(parsed.entity)?.tagIds).toEqual(['tag1']);
  });

  it('reads the id of a deleted task', () => {
    expect(entityIdFromPayload(DELETE_TASK, 'task')).toBe('EfRN6RUWRG3aXcCgR_3-I');
  });
});

describe('tagFromPayload', () => {
  it('reads a tag patch', () => {
    const parsed = tagFromPayload(UPDATE_TAG);
    expect(parsed.id).toBe('TODAY');
    expect(parsed.changes).toEqual({ taskIds: ['9cF-21Y---qjNtcSFXYBh'] });
  });

  it('ignores the virtual TODAY tag itself', () => {
    expect(toTag({ id: 'TODAY', title: 'Today' })).toBeNull();
  });
});

describe('projectFromPayload', () => {
  it('reads a project and its theme colour', () => {
    const parsed = projectFromPayload(ADD_PROJECT);
    const project = toProject(parsed.entity);
    expect(project?.id).toBe('1T9BqRMnj7MNkZzeBqp7p');
    expect(project?.title).toBe('MAIN TIME');
    expect(project?.color).toBe('#ff7043');
  });
});

describe('configSectionFromPayload', () => {
  it('reads a settings section update', () => {
    expect(configSectionFromPayload(UPDATE_CONFIG)).toEqual({
      sectionKey: 'localization',
      sectionCfg: { firstDayOfWeek: 1 },
    });
  });

  it('returns null for task payloads', () => {
    expect(configSectionFromPayload(ADD_TASK)).toBeNull();
  });
});
