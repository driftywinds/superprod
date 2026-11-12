import { For, Show, createSignal, type JSX } from 'solid-js';
import { Icon } from '../Icon';
import { doneTasks, state } from '../../state/store';
import {
  dayRange,
  focusSessionCount,
  formatMinutes,
  heatmapLevels,
  totalTimeForDay,
} from '../../domain/metrics';
import { todayStr } from '../../domain/models';

/**
 * Metrics — everything derived from the tasks and the per-day `Metric` entity.
 *
 * Deliberately no "productivity score": upstream has none, and this client does
 * not invent one. Ratios shown are plain averages of real recorded data.
 */

const RANGE_OPTIONS = [7, 14, 30, 90] as const;

export const MetricsView = (): JSX.Element => {
  const today = todayStr();
  const [range, setRange] = createSignal<(typeof RANGE_OPTIONS)[number]>(14);
  const [selected, setSelected] = createSignal(today);

  const tasks = () => Object.values(state.tasks);
  const days = () => dayRange(today, range());

  const timeForDay = (day: string) => totalTimeForDay(tasks(), day);
  const totals = () => days().map(timeForDay);
  const maxTotal = () => Math.max(...totals(), 1);

  const doneOnDay = (day: string) =>
    tasks().filter((task) => task.isDone && task.doneOn && new Date(task.doneOn).toDateString() === new Date(`${day}T00:00:00`).toDateString()).length;

  const summary = () => {
    const time = days().reduce((sum, day) => sum + timeForDay(day), 0);
    const done = doneTasks().length;
    const focus = days().reduce(
      (sum, day) => sum + focusSessionCount(state.metrics[day]),
      0,
    );
    const activeDays = days().filter((day) => timeForDay(day) > 0).length;
    return {
      time,
      done,
      focus,
      activeDays,
      average: activeDays > 0 ? time / activeDays : 0,
    };
  };

  const heatmapDays = () => dayRange(today, 91);
  const heatmapValues = () => heatmapDays().map(timeForDay);
  const heatmapMaximum = () => Math.max(...heatmapValues(), 1);

  return (
    <div class="metrics">
      <div class="metrics-range">
        <For each={RANGE_OPTIONS}>
          {(option) => (
            <button
              class="chip"
              classList={{ active: range() === option }}
              onClick={() => setRange(option)}
            >
              {option}d
            </button>
          )}
        </For>
      </div>

      <div class="metrics-cards">
        <div class="metric-card">
          <span class="metric-value">{formatMinutes(summary().time)}</span>
          <span class="metric-label">tracked in {range()} days</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">{summary().done}</span>
          <span class="metric-label">tasks completed</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">{summary().focus}</span>
          <span class="metric-label">focus sessions</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">{summary().activeDays}</span>
          <span class="metric-label">active days</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">{formatMinutes(summary().average)}</span>
          <span class="metric-label">average per active day</span>
        </div>
      </div>

      <section class="metrics-block">
        <h3 class="schedule-heading">Daily time</h3>
        <div class="bar-chart">
          <For each={days()}>
            {(day) => {
              const value = timeForDay(day);
              const height = Math.max(2, Math.round((value / maxTotal()) * 100));
              return (
                <button
                  class="bar"
                  classList={{ active: selected() === day }}
                  title={`${day} · ${formatMinutes(value)}`}
                  onClick={() => setSelected(day)}
                >
                  <span class="bar-fill" style={{ height: `${height}%` }} />
                  <span class="bar-label">{new Date(`${day}T00:00:00`).getDate()}</span>
                </button>
              );
            }}
          </For>
        </div>
      </section>

      <section class="metrics-block">
        <h3 class="schedule-heading">Activity, last 13 weeks</h3>
        <div class="heatmap">
          <For each={heatmapDays()}>
            {(day, index) => {
              const levels = heatmapLevels(heatmapValues());
              const level = levels[index()] ?? 0;
              const value = heatmapValues()[index()] ?? 0;
              return (
                <span
                  class={`heat cell-${level}`}
                  title={`${day} · ${formatMinutes(value)}`}
                />
              );
            }}
          </For>
        </div>
        <p class="planner-hint">
          Darker is more tracked time · busiest day {formatMinutes(heatmapMaximum())}
        </p>
      </section>

      <section class="metrics-block">
        <h3 class="schedule-heading">
          {new Date(`${selected()}T00:00:00`).toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </h3>
        <div class="metrics-detail">
          <div>
            <span class="metric-value small">{formatMinutes(timeForDay(selected()))}</span>
            <span class="metric-label">tracked</span>
          </div>
          <div>
            <span class="metric-value small">{doneOnDay(selected())}</span>
            <span class="metric-label">completed</span>
          </div>
          <div>
            <span class="metric-value small">
              {focusSessionCount(state.metrics[selected()])}
            </span>
            <span class="metric-label">focus sessions</span>
          </div>
          <div>
            <span class="metric-value small">
              {(state.metrics[selected()]?.reflections ?? []).length}
            </span>
            <span class="metric-label">reflections</span>
          </div>
        </div>

        <Show when={(state.metrics[selected()]?.reflections ?? []).length > 0}>
          <div class="reflection-list">
            <For each={state.metrics[selected()]?.reflections ?? []}>
              {(entry) => (
                <div class="reflection">
                  <span class="reflection-date">
                    {new Date(entry.created).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span>{entry.text}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>

      <Show when={tasks().some((task) => task.timeEstimate > 0)}>
        <section class="metrics-block">
          <h3 class="schedule-heading">Estimate accuracy</h3>
          <For
            each={tasks()
              .filter((task) => task.timeEstimate > 0 && task.isDone)
              .slice(0, 8)}
          >
            {(task) => {
              const ratio = () =>
                Math.round(((task.timeSpent || 0) / Math.max(1, task.timeEstimate)) * 100);
              return (
                <div class="accuracy-row">
                  <span class="accuracy-title">{task.title}</span>
                  <span
                    class="accuracy-value"
                    classList={{ over: ratio() > 110, under: ratio() < 90 }}
                  >
                    {ratio()}%
                  </span>
                </div>
              );
            }}
          </For>
          <p class="planner-hint">
            Spend vs estimate for completed tasks.
          </p>
        </section>
      </Show>

      <Show when={doneTasks().length === 0 && summary().time === 0}>
        <div class="empty">
          <div class="empty-title">No data yet</div>
          <div>Track time or complete a task and this fills in.</div>
          <span class="empty-icon">
            <Icon name="chart" size={22} />
          </span>
        </div>
      </Show>
    </div>
  );
};
