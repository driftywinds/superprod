import { For as ForEach, Show, createSignal, type JSX } from 'solid-js';
import { Icon } from '../Icon';
import { TaskRow } from '../TaskRow';
import { config } from '../../state/config-store';
import {
  planTaskForDay,
  plannerTasksForDay,
  removeTaskFromPlannerDay,
  rootTasks,
  state,
} from '../../state/store';
import { formatMinutes } from '../../domain/metrics';
import { toDayStr, todayStr, type Task } from '../../domain/models';

/**
 * Planner — a week of days, each holding an ordered task list.
 *
 * State maps 1:1 to upstream `PlannerState.days` (a PLANNER entity per day), so
 * planning a task is one `[Planner] Upsert Planner Day` operation plus the task's
 * `dueDay` update.
 */

const DAYS_AHEAD = 14;

const weekStart = (): Date => {
  const today = new Date();
  const firstDay = config.localization.firstDayOfWeek ?? 1;
  const offset = (today.getDay() - firstDay + 7) % 7;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
};

const dayLabel = (day: string): string =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

const estimateOf = (tasks: Task[]): number =>
  tasks.reduce((sum, task) => sum + (task.timeEstimate ?? 0), 0);

export const PlannerView = (): JSX.Element => {
  const today = todayStr();
  const [offset, setOffset] = createSignal(0);
  const [picking, setPicking] = createSignal<string | null>(null);

  const days = (): string[] => {
    const start = weekStart();
    return Array.from({ length: DAYS_AHEAD }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index + offset() * DAYS_AHEAD);
      return toDayStr(date);
    });
  };

  const unscheduled = (): Task[] =>
    rootTasks().filter(
      (task) =>
        !task.isDone &&
        !task.dueDay &&
        !task.dueWithTime &&
        !Object.values(state.plannerDays).some((ids) => ids.includes(task.id)),
    );

  return (
    <div class="planner">
      <div class="planner-toolbar">
        <button class="btn" onClick={() => setOffset(offset() - 1)} aria-label="Previous fortnight">
          <Icon name="chevronLeft" size={16} />
        </button>
        <button class="btn" onClick={() => setOffset(0)}>
          Today
        </button>
        <button class="btn" onClick={() => setOffset(offset() + 1)} aria-label="Next fortnight">
          <Icon name="chevronRight" size={16} />
        </button>
        <div class="spacer" />
        <span class="planner-hint">{formatMinutes(estimateOf(rootTasks()))} unscheduled estimates</span>
      </div>

      <div class="planner-days">
        <ForEach each={days()}>
          {(day) => {
            const tasks = () => plannerTasksForDay(day);
            return (
              <section class="planner-day" classList={{ today: day === today }}>
                <header class="planner-day-head">
                  <span class="planner-day-label">{dayLabel(day)}</span>
                  <Show when={tasks().length > 0}>
                    <span class="planner-day-meta">{formatMinutes(estimateOf(tasks()))}</span>
                  </Show>
                  <button
                    class="nav-add"
                    aria-label={`Plan a task on ${day}`}
                    title="Plan a task"
                    onClick={() => setPicking(picking() === day ? null : day)}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                </header>

                <Show when={tasks().length > 0}>
                  <div class="planner-task-list">
                    <ForEach each={tasks()}>
                      {(task) => (
                        <div class="planner-task">
                          <TaskRow task={task} />
                          <button
                            class="planner-remove"
                            aria-label={`Remove ${task.title} from ${day}`}
                            title="Remove from day"
                            onClick={() => removeTaskFromPlannerDay(task.id, day)}
                          >
                            <Icon name="close" size={12} />
                          </button>
                        </div>
                      )}
                    </ForEach>
                  </div>
                </Show>

                <Show when={tasks().length === 0}>
                  <p class="planner-empty">Nothing planned.</p>
                </Show>

                <Show when={picking() === day}>
                  <div class="planner-picker">
                    <Show
                      when={unscheduled().length > 0}
                      fallback={<p class="planner-empty">No unscheduled tasks left.</p>}
                    >
                      <ForEach each={unscheduled()}>
                        {(task) => (
                          <button
                            class="planner-pick"
                            onClick={() => {
                              planTaskForDay(task.id, day);
                              setPicking(null);
                            }}
                          >
                            <Icon name="plus" size={13} />
                            <span class="planner-pick-title">{task.title}</span>
                            <Show when={task.timeEstimate > 0}>
                              <span class="planner-day-meta">{formatMinutes(task.timeEstimate)}</span>
                            </Show>
                          </button>
                        )}
                      </ForEach>
                    </Show>
                  </div>
                </Show>
              </section>
            );
          }}
        </ForEach>
      </div>
    </div>
  );
};
