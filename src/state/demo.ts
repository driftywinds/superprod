import {
  addTask,
  planTaskForDay,
  recordFocusSession,
  selectTask,
  upsertRepeatConfig,
  setView,
  state,
  updateTask,
} from './store';
import { INBOX_PROJECT_ID, todayStr, toDayStr } from '../domain/models';

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

  // Completed work across the past week, so History and Metrics have real data.
  const past = (daysAgo: number, hours: number): number => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(hours, 0, 0, 0);
    return date.getTime();
  };

  const completions: { title: string; daysAgo: number; spentMin: number }[] = [
    { title: 'Draft onboarding copy review', daysAgo: 1, spentMin: 55 },
    { title: 'Triage backlog for the mobile client', daysAgo: 1, spentMin: 25 },
    { title: 'Ship the weekly release notes', daysAgo: 2, spentMin: 40 },
    { title: 'Pair on the sync conflict repro', daysAgo: 3, spentMin: 90 },
    { title: 'Clean up the settings schema', daysAgo: 4, spentMin: 30 },
  ];

  for (const entry of completions) {
    const task = addTask({ title: entry.title, projectId: INBOX_PROJECT_ID });
    const day = toDayStr(new Date(past(entry.daysAgo, 10)));
    updateTask(task.id, {
      isDone: true,
      doneOn: past(entry.daysAgo, 16),
      timeSpent: entry.spentMin * 60_000,
      timeSpentOnDay: { [day]: entry.spentMin * 60_000 },
      timeEstimate: entry.spentMin * 60_000,
    });
  }

  // A couple of days of tracked time on open tasks, for the metrics charts.
  const tracked = [
    { title: 'Review Q4 roadmap with design team', daysAgo: 0, spentMin: 42 },
    { title: 'Fix sync conflict on delete', daysAgo: 1, spentMin: 65 },
    { title: 'Write release notes for 0.1.0', daysAgo: 2, spentMin: 35 },
    { title: 'Reply to Alex about the self-hosted setup', daysAgo: 3, spentMin: 20 },
  ];
  for (const entry of tracked) {
    const task = byTitle.get(entry.title);
    if (!task) continue;
    const day = toDayStr(new Date(past(entry.daysAgo, 10)));
    updateTask(task.id, {
      timeSpent: entry.spentMin * 60_000,
      timeSpentOnDay: { [day]: entry.spentMin * 60_000 },
    });
  }

  // Planner: a few tasks on today and the next two days.
  const planToday = byTitle.get('Review Q4 roadmap with design team');
  const planTomorrow = byTitle.get('Write release notes for 0.1.0');
  const planDayAfter = byTitle.get('Reply to Alex about the self-hosted setup');
  if (planToday) planTaskForDay(planToday.id, today);
  if (planTomorrow) planTaskForDay(planTomorrow.id, toDayStr(new Date(Date.now() + 86_400_000)));
  if (planDayAfter) {
    planTaskForDay(planDayAfter.id, toDayStr(new Date(Date.now() + 2 * 86_400_000)));
  }

  // A timed slot, so the Schedule view has a timeline.
  const dentist = byTitle.get('Book dentist appointment');
  if (dentist) {
    const slot = new Date();
    slot.setHours(15, 30, 0, 0);
    updateTask(dentist.id, { dueWithTime: slot.getTime(), dueDay: null, remindAt: slot.getTime() });
  }

  // A weekday repeat, mirroring the real "Paper" config from the account.
  upsertRepeatConfig(
    {
      id: 'demo-repeat-paper',
      title: 'Paper',
      projectId: 'p-work',
      startTime: '09:00',
      startDate: toDayStr(new Date(Date.now() - 21 * 86_400_000)),
      repeatEvery: 1,
      repeatCycle: 'DAILY',
      quickSetting: 'DAILY',
      remindAt: 'AtStart',
      isPaused: false,
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false,
      defaultEstimate: 15 * 60_000,
    },
    { record: false },
  );

  // Focus sessions on today's metric.
  recordFocusSession(25 * 60_000);
  recordFocusSession(25 * 60_000);

  selectTask(null);
  setView('today');
};
