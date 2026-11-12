import { todayStr } from '../src/domain/models';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The store records sync operations; those are not under test here.
vi.mock('../src/sync/runner', () => ({ recordOperation: vi.fn() }));

const load = async () => await import('../src/state/store');

describe('task flows', () => {
  it('createTask never shares containers between tasks', async () => {
    const { createTask } = await import('../src/domain/models');
    const a = createTask({ title: 'a', projectId: 'INBOX' });
    const b = createTask({ title: 'b', projectId: 'INBOX' });
    a.subTaskIds.push('x');
    a.tagIds.push('t');
    expect(b.subTaskIds).toEqual([]);
    expect(b.tagIds).toEqual([]);
  });

  beforeEach(async () => {
    vi.resetModules();
  });

  it('adds, completes and deletes subtasks with parent cascade', async () => {
    const s = await load();
    const parent = s.addTask({ title: 'Parent' });
    const a = s.addSubTask(parent.id, 'a')!;
    const b = s.addSubTask(parent.id, 'b')!;
    expect(s.state.tasks[parent.id]!.subTaskIds).toEqual([a.id, b.id]);

    s.toggleDone(a.id);
    expect(s.state.tasks[parent.id]!.isDone).toBe(false);
    s.toggleDone(b.id);
    expect(s.state.tasks[parent.id]!.isDone).toBe(true); // last open subtask closes the parent

    s.toggleDone(a.id); // reopen a subtask
    expect(s.state.tasks[parent.id]!.isDone).toBe(false);

    s.toggleDone(parent.id); // completing a parent completes open subtasks
    expect(s.state.tasks[a.id]!.isDone && s.state.tasks[b.id]!.isDone).toBe(true);

    s.deleteTask(parent.id);
    expect(Object.keys(s.state.tasks)).toHaveLength(0);
  });

  it('deleting a subtask removes it from its parent; deleting a task clears planner days', async () => {
    const s = await load();
    const parent = s.addTask({ title: 'P' });
    const child = s.addSubTask(parent.id, 'c')!;
    s.planTaskForDay(parent.id, '2026-11-20');
    s.deleteTask(child.id);
    expect(s.state.tasks[parent.id]!.subTaskIds).toEqual([]);
    s.deleteTask(parent.id);
    expect(s.state.plannerDays['2026-11-20']).toBeUndefined();
  });

  it('reorders and promotes subtasks', async () => {
    const s = await load();
    const parent = s.addTask({ title: 'P' });
    const a = s.addSubTask(parent.id, 'a')!;
    const b = s.addSubTask(parent.id, 'b')!;
    s.moveSubTask(parent.id, b.id, -1);
    expect(s.state.tasks[parent.id]!.subTaskIds).toEqual([b.id, a.id]);
    s.promoteSubTask(a.id);
    expect(s.state.tasks[a.id]!.parentId).toBeNull();
    expect(s.state.tasks[parent.id]!.subTaskIds).toEqual([b.id]);
  });
});

describe('repeating tasks', () => {
  beforeEach(() => vi.resetModules());

  it('materialises an all-day and a timed occurrence with deterministic ids', async () => {
    const s = await load();
    const allDay = s.createRepeatConfig({
      title: 'Water plants',
      repeatCycle: 'DAILY',
      repeatEvery: 1,
      startDate: '2026-01-01',
      subTaskTemplates: [{ title: 'Kitchen' }, { title: 'Balcony' }],
    });
    const timed = s.createRepeatConfig({
      title: 'Standup',
      repeatCycle: 'DAILY',
      repeatEvery: 1,
      startDate: '2026-01-01',
      startTime: '09:30',
    });

    const a = s.materialiseOccurrence(allDay.id, '2026-11-12')!;
    expect(a.id).toBe(`rpt_${allDay.id}_2026-11-12`);
    expect(a.dueDay).toBe('2026-11-12');
    expect(a.dueWithTime).toBeNull();
    expect(a.subTaskIds).toEqual([`${a.id}_sub_0`, `${a.id}_sub_1`]);
    expect(s.materialiseOccurrence(allDay.id, '2026-11-12')).toBe(s.state.tasks[a.id]); // idempotent
    expect(Object.keys(s.state.tasks)).toHaveLength(3);

    const t = s.materialiseOccurrence(timed.id, '2026-11-12')!;
    expect(t.dueDay).toBeNull();
    expect(new Date(t.dueWithTime!).getHours()).toBe(9);
    expect(new Date(t.dueWithTime!).getMinutes()).toBe(30);
  });

  it('will not create an occurrence the schedule does not produce', async () => {
    const s = await load();
    const cfg = s.createRepeatConfig({ title: 'Mon', repeatCycle: 'WEEKLY', monday: true, startDate: '2026-11-02' });
    expect(s.materialiseOccurrence(cfg.id, '2026-11-12')).toBeUndefined(); // a Thursday
    expect(s.materialiseOccurrence(cfg.id, '2026-11-16')).toBeDefined();
  });

  it('remembers a deleted occurrence so it does not come back', async () => {
    const s = await load();
    const cfg = s.createRepeatConfig({ title: 'Daily', repeatCycle: 'DAILY', startDate: '2026-01-01' });
    const task = s.materialiseOccurrence(cfg.id, '2026-11-12')!;
    s.deleteTask(task.id);
    expect(s.state.repeatCfgs[cfg.id]!.deletedInstanceDates).toEqual(['2026-11-12']);
    expect(s.materialiseOccurrence(cfg.id, '2026-11-12')).toBeUndefined();
    expect(s.materialiseOccurrence(cfg.id, '2026-11-13')).toBeDefined();
  });

  it('restarts a repeat-from-completion series when its task is finished', async () => {
    const s = await load();
    const cfg = s.createRepeatConfig({
      title: 'Water',
      repeatCycle: 'DAILY',
      repeatEvery: 3,
      startDate: '2026-01-01',
      repeatFromCompletionDate: true,
    });
    const task = s.materialiseOccurrence(cfg.id, '2026-11-12')!;
    s.toggleDone(task.id);
    expect(s.state.repeatCfgs[cfg.id]!.lastTaskCreationDay).toBe(todayStr());
  });

  it('shows only unmaterialised occurrences as projections', async () => {
    const s = await load();
    const cfg = s.createRepeatConfig({ title: 'Daily', repeatCycle: 'DAILY', startDate: '2026-01-01' });
    expect(s.projectedTasksForDay('2026-12-01')).toHaveLength(1);
    s.materialiseOccurrence(cfg.id, '2026-12-01');
    expect(s.projectedTasksForDay('2026-12-01')).toHaveLength(0);
  });
});

describe('repeating tasks and projects', () => {
  beforeEach(() => vi.resetModules());

  it('files a repeat instance under the config project even if it was imported as Inbox', async () => {
    const s = await load();
    const project = s.addProject('Main');
    const cfg = s.createRepeatConfig({
      title: 'Paper',
      projectId: project.id,
      repeatCycle: 'DAILY',
      startDate: '2026-01-01',
    });
    const task = s.materialiseOccurrence(cfg.id, '2026-11-12')!;
    s.updateTask(task.id, { projectId: 'INBOX' }); // stale fallback from an import
    expect(s.tasksForProject(project.id).map((t) => t.id)).toEqual([task.id]);
    expect(s.tasksForInbox()).toHaveLength(0);
  });

  it('lists the next occurrence of a project repeat when there is no open instance', async () => {
    const s = await load();
    const project = s.addProject('Main');
    s.createRepeatConfig({ title: 'Paper', projectId: project.id, repeatCycle: 'DAILY', startDate: '2026-01-01' });
    const upcoming = s.upcomingRepeatsForProject(project.id);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]!.title).toBe('Paper');
    expect(s.upcomingRepeatsForProject('INBOX')).toHaveLength(0);
  });
});
