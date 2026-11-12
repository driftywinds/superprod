import { For, Show, createSignal, type JSX } from 'solid-js';
import { Icon } from '../Icon';
import { config } from '../../state/config-store';
import {
  scheduleTaskAt,
  scheduledTasksForDay,
  state,
  updateTask,
} from '../../state/store';
import { formatDuration } from '../TaskRow';
import { toDayStr, todayStr, type Task } from '../../domain/models';

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

  const timed = () => scheduledTasksForDay(day());
  const untimed = () =>
    Object.values(state.tasks).filter(
      (task) => !task.isDone && task.dueWithTime === null && task.dueDay === day(),
    );

  const shiftDay = (delta: number): void => {
    const date = new Date(`${day()}T00:00:00`);
    date.setDate(date.getDate() + delta);
    setDay(toDayStr(date));
  };

  const usedSlots = () => new Set(timed().map((task) => timeOf(task.dueWithTime as number)));

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
        when={timed().length > 0}
        fallback={<p class="planner-empty">Nothing scheduled at a specific time.</p>}
      >
        <div class="timeline">
          <For each={timed()}>
            {(task) => (
              <div class="timeline-row">
                <span class="timeline-time">{timeOf(task.dueWithTime as number)}</span>
                <span class="timeline-mark" />
                <div class="timeline-card">
                  <div class="timeline-title">{task.title}</div>
                  <div class="timeline-meta">
                    <Show when={task.timeEstimate > 0}>
                      <span>{formatDuration(task.timeEstimate)}</span>
                    </Show>
                    <Show when={task.remindAt}>
                      <span class="timeline-reminder">
                        <Icon name="bell" size={11} /> {timeOf(task.remindAt as number)}
                      </span>
                    </Show>
                  </div>
                  <div class="timeline-actions">
                    <button
                      class="btn small"
                      onClick={() => scheduleTaskAt(task.id, day(), null)}
                    >
                      Clear time
                    </button>
                    <button
                      class="btn small"
                      onClick={() => updateTask(task.id, { isDone: true, doneOn: Date.now() })}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class="schedule-section">
        <h3 class="schedule-heading">Planned for this day, no time yet</h3>
        <Show when={untimed().length > 0} fallback={<p class="planner-empty">None.</p>}>
          <div class="schedule-chips">
            <For each={untimed()}>
              {(task) => (
                <button class="chip task-chip" onClick={() => setPicking(task)}>
                  {task.title}
                </button>
              )}
            </For>
          </div>
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
