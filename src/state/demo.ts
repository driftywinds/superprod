import { addTask, selectTask, setView, state, updateTask } from './store';
import { todayStr, toDayStr } from '../domain/models';

/**
 * Demo content for screenshots and manual QA. Load with `?demo=1`.
 * Never runs unless the URL asks for it.
 */
export const seedDemoData = (): void => {
  const today = todayStr();
  const tomorrow = toDayStr(new Date(Date.now() + 86_400_000));

  const specs: {
    title: string;
    projectId?: string;
    priority?: 1 | 2 | 3;
    dueDay?: string;
    estimateMin?: number;
    notes?: string;
  }[] = [
    {
      title: 'Review Q4 roadmap with design team',
      projectId: 'p-work',
      priority: 3,
      dueDay: today,
      estimateMin: 60,
      notes: 'Focus on the onboarding flow. Bring the three open questions.',
    },
    {
      title: 'Fix sync conflict on delete',
      projectId: 'p-work',
      priority: 3,
      dueDay: today,
      estimateMin: 90,
    },
    {
      title: 'Write release notes for 0.1.0',
      projectId: 'p-work',
      priority: 2,
      dueDay: today,
      estimateMin: 30,
    },
    {
      title: 'Reply to Alex about the self-hosted setup',
      projectId: 'p-work',
      priority: 2,
      dueDay: today,
      estimateMin: 15,
    },
    { title: 'Book dentist appointment', projectId: 'p-personal', priority: 1, dueDay: today },
    { title: 'Plan weekend hike', projectId: 'p-personal', estimateMin: 45, dueDay: tomorrow },
    { title: 'Read chapter 4 of Deep Work', projectId: 'p-personal', estimateMin: 40 },
    { title: 'Capture: idea for keyboard-first task entry', projectId: 'p-work' },
  ];

  for (const spec of specs) {
    addTask({
      title: spec.title,
      projectId: spec.projectId ?? 'INBOX',
    });
  }

  // Apply the extra fields by title (addTask already handled short syntax).
  const byTitle = new Map(Object.values(state.tasks).map((task) => [task.title, task]));
  for (const spec of specs) {
    const task = byTitle.get(spec.title);
    if (!task) continue;
    updateTask(task.id, {
      priority: spec.priority ?? null,
      dueDay: spec.dueDay ?? null,
      timeEstimate: (spec.estimateMin ?? 0) * 60_000,
      notes: spec.notes,
    });
  }

  const first = byTitle.get('Review Q4 roadmap with design team');
  if (first) {
    updateTask(first.id, { timeSpent: 42 * 60_000, timeSpentOnDay: { [today]: 42 * 60_000 } });
  }

  selectTask(null);
  setView('today');
};
