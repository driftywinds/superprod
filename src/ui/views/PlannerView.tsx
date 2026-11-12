import { For, Show, createEffect, createSignal, type JSX } from 'solid-js';
import { Icon } from '../Icon';
import { TaskRow } from '../TaskRow';
import { config } from '../../state/config-store';
import {
  planTaskForDay,
  plannerTasksForDay,
  rootTasks,
  scheduledTasksForDay,
  state,
} from '../../state/store';
import { formatMinutes } from '../../domain/metrics';
import { toDayStr, type Task } from '../../domain/models';

/**
 * Planner — a horizontal date wheel over the current week, with the selected
 * day's items underneath: all-day items first, then timed items in order.
 *
 * The week starts on `config.localization.firstDayOfWeek` (0 = Sunday,
 * 1 = Monday), matching the upstream setting, and the wheel scrolls freely
 * across weeks in both directions.
 */

const WEEKS_BACK = 8;
const WEEKS_AHEAD = 8;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const startOfWeek = (date: Date, firstDay: number): Date => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (start.getDay() - firstDay + 7) % 7;
  start.setDate(start.getDate() - offset);
  return start;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** A task with no time of day belongs to the "all day" block. */
const isAllDay = (task: Task): boolean => task.dueWithTime === null;

export const PlannerView = (): JSX.Element => {
  const firstDay = () => config.localization.firstDayOfWeek ?? 1;
  const [selected, setSelected] = createSignal(new Date());
  const [wheelOffset, setWheelOffset] = createSignal(0);
  const [picking, setPicking] = createSignal(false);
  let scroller: HTMLDivElement | undefined;

  const today = new Date();

  /** Every day rendered in the wheel: WEEKS_BACK before today's week, then ahead. */
  const wheelDays = (): Date[] => {
    const anchor = startOfWeek(today, firstDay());
    anchor.setDate(anchor.getDate() + wheelOffset() * 7 - WEEKS_BACK * 7);
    return Array.from({ length: 7 * (WEEKS_BACK + WEEKS_AHEAD) }, (_, index) =>
      addDays(anchor, index),
    );
  };

  const selectedDay = (): string => toDayStr(selected());

  const allDayTasks = (): Task[] => {
    const day = selectedDay();
    const planned = plannerTasksForDay(day);
    const dueToday = rootTasks().filter((task) => task.dueDay === day && task.dueWithTime === null);
    const merged = new Map<string, Task>();
    for (const task of [...planned, ...dueToday]) merged.set(task.id, task);
    return [...merged.values()].filter(isAllDay);
  };

  const timedTasks = (): Task[] => scheduledTasksForDay(selectedDay());

  const unscheduled = (): Task[] =>
    rootTasks().filter(
      (task) =>
        !task.isDone &&
        !task.dueDay &&
        !task.dueWithTime &&
        !Object.values(state.plannerDays).some((ids) => ids.includes(task.id)),
    );

  const hasDot = (date: Date): boolean => {
    const day = toDayStr(date);
    return (
      plannerTasksForDay(day).length > 0 ||
      scheduledTasksForDay(day).length > 0 ||
      rootTasks().some((task) => task.dueDay === day)
    );
  };

  // Centre the selected day. Direct scrollLeft, not scrollIntoView: smooth
  // scrolling never settles when the page is rendered without compositing.
  createEffect(() => {
    const node = scroller;
    const day = selected();
    if (!node) return;
    const index = wheelDays().findIndex((date) => sameDay(date, day));
    if (index < 0) return;

    requestAnimationFrame(() => {
      const pill = node.children[index] as HTMLElement | undefined;
      if (!pill) return;
      node.scrollLeft = pill.offsetLeft - node.clientWidth / 2 + pill.clientWidth / 2;
    });
  });

  const shiftSelection = (delta: number): void => {
    const next = addDays(selected(), delta);
    setSelected(next);
    // Keep the selected day inside the rendered window.
    const weekOfSelected = Math.floor(
      (startOfWeek(next, firstDay()).getTime() - startOfWeek(today, firstDay()).getTime()) /
        (7 * 86_400_000),
    );
    if (weekOfSelected + WEEKS_BACK < 1) setWheelOffset(wheelOffset() - 1);
    else if (weekOfSelected + WEEKS_BACK > WEEKS_BACK + WEEKS_AHEAD - 1) {
      setWheelOffset(wheelOffset() + 1);
    }
  };

  return (
    <div class="planner">
      <div class="calendar-head">
        <h2 class="calendar-month">
          {selected().toLocaleDateString(undefined, { month: 'long' })}
        </h2>
        <div class="calendar-actions">
          <button class="icon-btn" aria-label="Previous day" onClick={() => shiftSelection(-1)}>
            <Icon name="chevronLeft" size={18} />
          </button>
          <button
            class="btn small"
            onClick={() => {
              setSelected(new Date());
              setWheelOffset(0);
            }}
          >
            Today
          </button>
          <button class="icon-btn" aria-label="Next day" onClick={() => shiftSelection(1)}>
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
      </div>

      <div class="date-wheel" ref={scroller}>
        <For each={wheelDays()}>
          {(date) => (
            <button
              class="date-pill"
              classList={{ selected: sameDay(date, selected()), today: sameDay(date, today) }}
              onClick={() => setSelected(date)}
              aria-pressed={sameDay(date, selected())}
            >
              <span class="date-weekday">{WEEKDAYS[date.getDay()]}</span>
              <span class="date-number">{date.getDate()}</span>
              <span class="date-dot" classList={{ on: hasDot(date) }} />
            </button>
          )}
        </For>
      </div>

      <div class="day-agenda">
        <div class="agenda-label">
          {selected().toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </div>

        <Show when={allDayTasks().length > 0}>
          <div class="agenda-row">
            <span class="agenda-time">All day</span>
            <div class="agenda-items">
              <For each={allDayTasks()}>{(task) => <TaskRow task={task} />}</For>
            </div>
          </div>
        </Show>

        <Show when={timedTasks().length > 0}>
          <For each={timedTasks()}>
            {(task) => (
              <div class="agenda-row">
                <span class="agenda-time">
                  {new Date(task.dueWithTime as number).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
                <div class="agenda-items">
                  <TaskRow task={task} />
                </div>
              </div>
            )}
          </For>
        </Show>

        <Show when={allDayTasks().length === 0 && timedTasks().length === 0}>
          <p class="planner-empty">Nothing planned for this day.</p>
        </Show>

        <button class="agenda-add" onClick={() => setPicking(!picking())}>
          <Icon name="plus" size={15} />
          Plan a task for this day
        </button>

        <Show when={picking()}>
          <div class="planner-picker">
            <Show
              when={unscheduled().length > 0}
              fallback={<p class="planner-empty">Every task is already planned somewhere.</p>}
            >
              <For each={unscheduled()}>
                {(task) => (
                  <button
                    class="planner-pick"
                    onClick={() => {
                      planTaskForDay(task.id, selectedDay());
                      setPicking(false);
                    }}
                  >
                    <Icon name="plus" size={13} />
                    <span class="planner-pick-title">{task.title}</span>
                    <Show when={task.timeEstimate > 0}>
                      <span class="planner-day-meta">{formatMinutes(task.timeEstimate)}</span>
                    </Show>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
};
