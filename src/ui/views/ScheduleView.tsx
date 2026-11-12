import { For, Show, createSignal, type JSX } from 'solid-js';
import { Icon } from '../Icon';
import { config } from '../../state/config-store';
import { ProjectionRow } from '../ProjectionRow';
import { TaskRow } from '../TaskRow';
import {
  materialiseOccurrence,
  plannerTasksForDay,
  selectTask,
  toggleDone,
  projectedTasksForDay,
  scheduleTaskAt,
  scheduledTasksForDay,
  state,
} from '../../state/store';
import { formatDuration } from '../TaskRow';
import { toDayStr, todayStr, type Task } from '../../domain/models';
import { minutesToTime } from '../../domain/repeat';

/**
 * Schedule — the day's timed tasks on a vertical timeline.
 *
 * Placement comes from `task.dueWithTime` (the only field upstream uses for a
 * timed slot); work hours and the lunch break come from `config.schedule`. A
 * task without a time is listed below the timeline and can be pinned to a slot.
 */

const STEP_MINUTES = 30;

const timeOf = (ms: number): string => {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map((part) => Number(part));
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

/** Free half-hour slots between work start and end, skipping the lunch break. */
const buildSlots = (): string[] => {
  const start = toMinutes(config.schedule.workStart);
  const end = toMinutes(config.schedule.workEnd);
  const lunchStart = toMinutes('12:00');
  const lunchEnd = lunchStart + 60;
  const slots: string[] = [];

  for (let minute = start; minute <= end; minute += STEP_MINUTES) {
    if (minute >= lunchStart && minute < lunchEnd) continue;
    slots.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
  }
  return slots;
};

export const ScheduleView = (): JSX.Element => {
  const [day, setDay] = createSignal(todayStr());
  const [picking, setPicking] = createSignal<Task | null>(null);

  const timed = () => scheduledTasksForDay(day(), true);
  const untimed = () => {
    const seen = new Map<string, Task>();
    for (const task of [
      ...plannerTasksForDay(day(), true),
      ...Object.values(state.tasks).filter(
        (entry) => !entry.parentId && entry.dueWithTime == null && entry.dueDay === day(),
      ),
    ]) {
      if (task.dueWithTime == null) seen.set(task.id, task);
    }
    return [...seen.values()];
  };
  /** Repeating all-day occurrences nobody has generated yet. */
  const projectedAllDay = () => projectedTasksForDay(day()).filter((entry) => entry.startMinutes === null);

  const shiftDay = (delta: number): void => {
    const date = new Date(`${day()}T00:00:00`);
    date.setDate(date.getDate() + delta);
    setDay(toDayStr(date));
  };

  const usedSlots = () => new Set(timed().map((task) => timeOf(task.dueWithTime as number)));

  /** Repeating occurrences with a start time, merged into the timeline. */
  const projected = () => projectedTasksForDay(day()).filter((entry) => entry.startMinutes !== null);

  /** Timeline entries: real timed tasks plus projections, ordered by clock time. */
  const timeline = () => [
    ...timed().map((task) => ({
      kind: 'task' as const,
      key: task.id,
      minutes: new Date(task.dueWithTime as number).getHours() * 60 + new Date(task.dueWithTime as number).getMinutes(),
      label: timeOf(task.dueWithTime as number),
      task,
      title: task.title,
      estimateMs: task.timeEstimate,
    })),
    ...projected().map((entry) => ({
      kind: 'projection' as const,
      cfgId: entry.cfgId,
      key: entry.id,
      minutes: entry.startMinutes as number,
      label: new Date(`1970-01-01T${minutesToTime(entry.startMinutes as number)}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      task: null,
      title: entry.title,
      estimateMs: entry.estimateMs,
    })),
  ].sort((a, b) => a.minutes - b.minutes);

  return (
    <div class="schedule">
      <div class="planner-toolbar">
        <button class="btn" onClick={() => shiftDay(-1)} aria-label="Previous day">
          <Icon name="chevronLeft" size={16} />
        </button>
        <button class="btn" onClick={() => setDay(todayStr())}>
          Today
        </button>
        <button class="btn" onClick={() => shiftDay(1)} aria-label="Next day">
          <Icon name="chevronRight" size={16} />
        </button>
        <div class="spacer" />
        <span class="planner-hint">
          {new Date(`${day()}T00:00:00`).toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
          })}
        </span>
      </div>

      <Show
        when={timeline().length > 0}
        fallback={<p class="planner-empty">Nothing scheduled at a specific time.</p>}
      >
        <div class="timeline">
          <For each={timeline()}>
            {(entry) => (
              <div class="timeline-row">
                <span class="timeline-time">{entry.label}</span>
                <span class="timeline-mark" classList={{ done: !!entry.task?.isDone }} />
                <div
                  class="timeline-card"
                  classList={{ done: !!entry.task?.isDone }}
                  role="button"
                  tabindex={0}
                  onClick={() => {
                    if (entry.task) selectTask(entry.task.id);
                    else if ('cfgId' in entry) {
                      const created = materialiseOccurrence(entry.cfgId, day());
                      if (created) selectTask(created.id);
                    }
                  }}
                >
                  <div class="timeline-title">
                    <Show when={entry.kind === 'projection'}>
                      <span class="timeline-repeat">
                        <Icon name="repeat" size={12} />
                      </span>
                    </Show>
                    {entry.title}
                  </div>
                  <div class="timeline-meta">
                    <Show when={entry.estimateMs > 0}>
                      <span>{formatDuration(entry.estimateMs)}</span>
                    </Show>
                    <Show when={entry.kind === 'projection'}>
                      <span>repeats</span>
                    </Show>
                    <Show when={entry.task?.remindAt}>
                      <span class="timeline-reminder">
                        <Icon name="bell" size={11} /> {timeOf(entry.task?.remindAt as number)}
                      </span>
                    </Show>
                  </div>
                  <Show when={entry.kind === 'projection'}>
                    <div class="timeline-actions">
                      <button
                        class="btn small"
                        onClick={(event) => {
                          event.stopPropagation();
                          if ('cfgId' in entry) {
                            const created = materialiseOccurrence(entry.cfgId, day());
                            if (created) toggleDone(created.id);
                          }
                        }}
                      >
                        Done
                      </button>
                    </div>
                  </Show>
                  <Show when={entry.task}>
                    {(task) => (
                      <div class="timeline-actions">
                        <button
                          class="btn small"
                          onClick={(event) => {
                            event.stopPropagation();
                            scheduleTaskAt(task().id, day(), null);
                          }}
                        >
                          Make all-day
                        </button>
                        <button
                          class="btn small"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleDone(task().id);
                          }}
                        >
                          {task().isDone ? 'Reopen' : 'Done'}
                        </button>
                      </div>
                    )}
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class="schedule-section">
        <h3 class="schedule-heading">All day</h3>
        <Show
          when={untimed().length > 0 || projectedAllDay().length > 0}
          fallback={<p class="planner-empty">Nothing all-day.</p>}
        >
          <div class="task-list">
            <For each={untimed()}>{(task) => <TaskRow task={task} flat />}</For>
            <For each={projectedAllDay()}>
              {(occurrence) => <ProjectionRow occurrence={occurrence} />}
            </For>
          </div>
          <Show when={untimed().some((task) => !task.isDone)}>
            <p class="setting-help">Pick one to give it a time:</p>
            <div class="schedule-chips">
              <For each={untimed().filter((task) => !task.isDone)}>
                {(task) => (
                  <button class="chip task-chip" onClick={() => setPicking(task)}>
                    {task.title}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      <Show when={picking()}>
        {(task) => (
          <div class="schedule-slots">
            <div class="schedule-heading-row">
              <span class="schedule-heading">Schedule “{task().title}”</span>
              <button class="btn small" onClick={() => setPicking(null)}>
                Cancel
              </button>
            </div>
            <div class="slot-grid">
              <For each={buildSlots()}>
                {(slot) => (
                  <button
                    class="chip slot"
                    classList={{ used: usedSlots().has(slot) }}
                    onClick={() => {
                      scheduleTaskAt(task().id, day(), slot);
                      setPicking(null);
                    }}
                  >
                    {slot}
                  </button>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};
