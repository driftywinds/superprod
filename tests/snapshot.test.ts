import { describe, expect, it } from 'vitest';
import { isFullStateOperation, parseUpstreamSnapshot } from '../src/sync/snapshot';

/** Shapes copied from a real SuperSync `SYNC_IMPORT` snapshot. */
const SNAPSHOT = {
  task: {
    ids: ['t1', 't2'],
    entities: {
      t1: {
        id: 't1',
        title: 'Getting started',
        projectId: 'INBOX_PROJECT',
        tagIds: ['tag1', 'missing-tag'],
        subTaskIds: ['t2'],
        created: 1792467857786,
        isDone: false,
        timeEstimate: 3_600_000,
        timeSpent: 1_800_000,
        timeSpentOnDay: { '2026-11-12': 1_800_000, bad: 'x' },
        notes: 'hello',
        attachments: [{ id: 'a1', type: 'LINK', path: 'https://example.com' }],
      },
      t2: {
        id: 't2',
        title: 'A subtask',
        projectId: 'INBOX_PROJECT',
        parentId: 't1',
        created: 1792467857787,
      },
    },
  },
  project: {
    ids: ['INBOX_PROJECT', 'p-work'],
    entities: {
      INBOX_PROJECT: { id: 'INBOX_PROJECT', title: 'Inbox', theme: { primary: 'rgb(1,2,3)' } },
      'p-work': {
        id: 'p-work',
        title: 'Work',
        theme: { primary: '#ff0000' },
        isArchived: false,
        created: 1792467857000,
      },
    },
  },
  tag: {
    ids: ['tag1'],
    entities: { tag1: { id: 'tag1', title: 'Deep', color: '#00ff00', created: 1 } },
  },
};

describe('parseUpstreamSnapshot', () => {
  it('maps tasks, projects and tags', () => {
    const { tasks, projects, tags } = parseUpstreamSnapshot(SNAPSHOT);

    expect(projects.map((p) => p.id).sort()).toEqual(['INBOX', 'p-work']);
    expect(tags[0]).toMatchObject({ id: 'tag1', title: 'deep', color: '#00ff00' });
    expect(tasks).toHaveLength(2);
  });

  it('remaps the upstream Inbox id to this client id', () => {
    const { tasks, projects } = parseUpstreamSnapshot(SNAPSHOT);
    const inbox = projects.find((project) => project.id === 'INBOX');
    expect(inbox?.title).toBe('Inbox');
    expect(tasks.every((task) => task.projectId === 'INBOX' || task.projectId === 'p-work')).toBe(
      true,
    );
  });

  it('keeps only known tag ids on tasks', () => {
    const { tasks } = parseUpstreamSnapshot(SNAPSHOT);
    expect(tasks.find((task) => task.id === 't1')?.tagIds).toEqual(['tag1']);
  });

  it('drops non-numeric day values', () => {
    const { tasks } = parseUpstreamSnapshot(SNAPSHOT);
    expect(tasks.find((task) => task.id === 't1')?.timeSpentOnDay).toEqual({
      '2026-11-12': 1_800_000,
    });
  });

  it('preserves nesting and time fields', () => {
    const { tasks } = parseUpstreamSnapshot(SNAPSHOT);
    const parent = tasks.find((task) => task.id === 't1');
    expect(parent?.subTaskIds).toEqual(['t2']);
    expect(parent?.timeEstimate).toBe(3_600_000);
    expect(tasks.find((task) => task.id === 't2')?.parentId).toBe('t1');
  });

  it('synthesises an Inbox when the snapshot has none', () => {
    const { projects } = parseUpstreamSnapshot({ task: { ids: [], entities: {} } });
    expect(projects[0]?.id).toBe('INBOX');
  });

  it('survives garbage input', () => {
    const { tasks, projects, tags } = parseUpstreamSnapshot(null);
    expect(tasks).toEqual([]);
    expect(tags).toEqual([]);
    expect(projects).toHaveLength(1);
  });
});

describe('isFullStateOperation', () => {
  it('recognises full-state transfers', () => {
    expect(isFullStateOperation('ALL', 'SYNC_IMPORT')).toBe(true);
    expect(isFullStateOperation('ALL', 'CRT')).toBe(true);
    expect(isFullStateOperation('RECOVERY', 'SYNC_IMPORT')).toBe(true);
    expect(isFullStateOperation('TASK', 'BACKUP_IMPORT')).toBe(true);
  });

  it('leaves ordinary operations alone', () => {
    expect(isFullStateOperation('TASK', 'CRT')).toBe(false);
    expect(isFullStateOperation('TAG', 'UPD')).toBe(false);
  });
});
