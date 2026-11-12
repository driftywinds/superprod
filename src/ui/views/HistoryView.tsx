import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import { Icon } from '../Icon';
import { doneTasks, state, toggleDone } from '../../state/store';
import { formatMinutes } from '../../domain/metrics';
import { toDayStr, type Task } from '../../domain/models';

/**
 * History — completed work grouped by the day it was finished.
 *
 * Derived from `doneOn` (set when a task is completed) and `timeSpentOnDay`,
 * both of which sync as ordinary task fields. Nothing is stored separately, so
 * history can never disagree with the task list.
 */

interface DayGroup {
  day: string;
  tasks: Task[];
  time: number;
}

const timeForDay = (task: Task, day: string): number => task.timeSpentOnDay[day] ?? 0;

export const HistoryView = (): JSX.Element => {
  const [query, setQuery] = createSignal('');

  const groups = createMemo<DayGroup[]>(() => {
    const byDay = new Map<string, Task[]>();

    for (const task of doneTasks()) {
      if (!task.doneOn) continue;
      const day = toDayStr(new Date(task.doneOn));
      const list = byDay.get(day) ?? [];
      list.push(task);
      byDay.set(day, list);
    }

    return [...byDay.entries()]
      .map(([day, tasks]) => ({
        day,
        tasks: tasks.sort((a, b) => (b.doneOn ?? 0) - (a.doneOn ?? 0)),
        time: tasks.reduce((sum, task) => sum + timeForDay(task, day), 0),
      }))
      .sort((a, b) => (a.day < b.day ? 1 : -1));
  });

  const filtered = createMemo(() => {
    const term = query().trim().toLowerCase();
    if (!term) return groups();
    return groups()
      .map((group) => ({
        ...group,
        tasks: group.tasks.filter((task) => task.title.toLowerCase().includes(term)),
      }))
      .filter((group) => group.tasks.length > 0);
  });

  const totalDone = () => groups().reduce((sum, group) => sum + group.tasks.length, 0);
  const totalTime = () => groups().reduce((sum, group) => sum + group.time, 0);

  return (
    <div class="history">
      <input
        class="input"
        type="search"
        placeholder="Search completed tasks…"
        value={query()}
        onInput={(event) => setQuery(event.currentTarget.value)}
      />

      <div class="metrics-cards">
        <div class="metric-card">
          <span class="metric-value">{totalDone()}</span>
          <span class="metric-label">tasks completed</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">{groups().length}</span>
          <span class="metric-label">days with completions</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">{formatMinutes(totalTime())}</span>
          <span class="metric-label">time recorded</span>
        </div>
      </div>

      <Show
        when={filtered().length > 0}
        fallback={
          <div class="empty">
            <div class="empty-title">Nothing completed yet</div>
            <div>Tasks you finish appear here, grouped by day, and sync with your other devices.</div>
          </div>
        }
      >
        <For each={filtered()}>
          {(group) => (
            <section class="history-day">
              <header class="history-day-head">
                <span class="history-day-label">
                  {new Date(`${group.day}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </span>
                <span class="planner-day-meta">
                  {group.tasks.length} · {formatMinutes(group.time)}
                </span>
              </header>

              <For each={group.tasks}>
                {(task) => (
                  <div class="history-row">
                    <button
                      class="history-check"
                      aria-label={`Restore ${task.title}`}
                      title="Mark as not done"
                      onClick={() => toggleDone(task.id)}
                    >
                      <Icon name="check" size={12} />
                    </button>
                    <span class="history-title">{task.title}</span>
                    <Show when={timeForDay(task, group.day) > 0}>
                      <span class="history-time">
                        {formatMinutes(timeForDay(task, group.day))}
                      </span>
                    </Show>
                  </div>
                )}
              </For>
            </section>
          )}
        </For>
      </Show>

      <Show when={Object.values(state.tasks).some((task) => task.isDone && !task.doneOn)}>
        <p class="planner-hint">
          Some completed tasks have no completion date recorded (imported from an older client) and
          cannot be grouped by day.
        </p>
      </Show>
    </div>
  );
};
