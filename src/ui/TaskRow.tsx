import { Show, For, createSignal, type JSX } from 'solid-js';
import { checklistProgress } from '../domain/checklist';
import { Icon } from './Icon';
import {
  isOverdue,
  isTaskForToday,
  todayStr,
  type Task,
} from '../domain/models';
import {
  isTracking,
  liveElapsedMs,
  selectTask,
  state,
  toggleDone,
  toggleTracking,
} from '../state/store';

/** `2h 30m` — the app's duration format. */
export const formatDuration = (ms: number): string => {
  if (ms < 60_000) return ms > 0 ? '<1m' : '0m';
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
};

const dayLabel = (day: string): string => {
  const today = todayStr();
  if (day === today) return 'Today';
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (day === key(tomorrow)) return 'Tomorrow';
  if (day === key(yesterday)) return 'Yesterday';
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** "Today", "Tomorrow 09:30", "Mon 3" — date first, clock time when the task has one. */
const formatDue = (task: Task): string | null => {
  if (task.dueWithTime != null) {
    const date = new Date(task.dueWithTime);
    const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const pad = (n: number) => String(n).padStart(2, '0');
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return day === todayStr() ? time : `${dayLabel(day)} ${time}`;
  }
  return task.dueDay ? dayLabel(task.dueDay) : null;
};

export interface TaskRowProps {
  task: Task;
  depth?: number;
  /** Hide the nested subtasks (used where the row is a compact list item). */
  flat?: boolean;
}

const TaskRowItem = (props: TaskRowProps & { expanded?: boolean; onToggle?: () => void }): JSX.Element => {
  const tags = () =>
    props.task.tagIds
      .map((id) => state.tags[id])
      .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined);

  const totalMs = () => props.task.timeSpent + liveElapsedMs(props.task.id);
  const due = () => formatDue(props.task);
  const overdue = () => isOverdue(props.task);
  const isSelected = () => state.selectedTaskId === props.task.id;

  return (
    <div
      class="task"
      classList={{
        done: props.task.isDone,
        selected: isSelected(),
      }}
      style={{ 'padding-left': `${(props.depth ?? 0) * 22 + 12}px` }}
      onClick={() => selectTask(isSelected() ? null : props.task.id)}
      role="button"
      tabindex={0}
      onKeyDown={(event) => {
        // Ignore keys that bubble up from the check / play buttons inside the row.
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectTask(isSelected() ? null : props.task.id);
        }
      }}
    >
      <button
        class="check"
        classList={{ checked: props.task.isDone }}
        aria-label={props.task.isDone ? 'Mark as not done' : 'Mark as done'}
        onClick={(event) => {
          event.stopPropagation();
          toggleDone(props.task.id);
        }}
      >
        <Icon name="check" size={12} />
      </button>

      <div class="task-main">
        <div class="task-title-row">
          <Show when={props.task.priority}>
            <span class={`priority-dot p${props.task.priority}`} />
          </Show>
          <span class="task-title">{props.task.title}</span>
        </div>

        <div class="task-meta">
          <Show when={due()}>
            <span class="chip" classList={{ danger: overdue(), accent: isTaskForToday(props.task) && !overdue() }}>
              <Icon name="calendar" size={11} />
              {due()}
            </span>
          </Show>

          <Show when={props.task.timeEstimate > 0}>
            <span class="chip">
              <Icon name="clock" size={11} />
              {formatDuration(props.task.timeSpent)} / {formatDuration(props.task.timeEstimate)}
            </span>
          </Show>

          <Show when={props.task.subTaskIds.length > 0}>
            <span class="chip" title="Subtasks done">
              <Icon name="check" size={11} />
              {props.task.subTaskIds.filter((id) => state.tasks[id]?.isDone).length}/
              {props.task.subTaskIds.length}
            </span>
          </Show>

          <Show when={checklistProgress(props.task.notes).total > 0}>
            <span class="chip" title="Checklist">
              <Icon name="note" size={11} />
              {checklistProgress(props.task.notes).done}/{checklistProgress(props.task.notes).total}
            </span>
          </Show>

          <Show when={props.task.repeatCfgId}>
            <span class="chip" title="Repeats">
              <Icon name="repeat" size={11} />
            </span>
          </Show>

          <For each={tags()}>
            {(tag) => (
              <span class="chip" style={{ color: tag.color ?? undefined }}>
                #{tag.title}
              </span>
            )}
          </For>

          <Show when={props.task.notes?.trim() && checklistProgress(props.task.notes).total === 0}>
            <span class="chip" title="Has notes">
              <Icon name="note" size={11} />
            </span>
          </Show>
        </div>
      </div>

      <div class="task-actions">
        <Show when={props.task.subTaskIds.length > 0 && !props.flat}>
          <button
            class="icon-btn expand-btn"
            classList={{ open: props.expanded }}
            aria-label={props.expanded ? 'Hide subtasks' : 'Show subtasks'}
            aria-expanded={props.expanded}
            onClick={(event) => {
              event.stopPropagation();
              props.onToggle?.();
            }}
          >
            <Icon name="chevron" size={14} />
          </button>
        </Show>
        <Show when={totalMs() > 0 || isTracking(props.task.id)}>
          <span class="time-badge" classList={{ active: isTracking(props.task.id) }}>
            {formatDuration(totalMs())}
          </span>
        </Show>
        <button
          class="play-btn"
          classList={{ active: isTracking(props.task.id) }}
          aria-label={isTracking(props.task.id) ? 'Stop tracking' : 'Start tracking'}
          onClick={(event) => {
            event.stopPropagation();
            toggleTracking(props.task.id);
          }}
        >
          <Icon name={isTracking(props.task.id) ? 'pause' : 'play'} size={13} />
        </button>
      </div>
    </div>
  );
};

/** A task row with its subtasks nested underneath (collapsible). */
export const TaskRow = (props: TaskRowProps): JSX.Element => {
  const [expanded, setExpanded] = createSignal(true);
  return (
    <>
      <TaskRowItem {...props} expanded={expanded()} onToggle={() => setExpanded(!expanded())} />
      <Show when={!props.flat && expanded() && props.task.subTaskIds.length > 0}>
        <For each={props.task.subTaskIds}>
          {(id) => (
            <Show when={state.tasks[id]}>
              {(child) => <TaskRowItem task={child()} depth={(props.depth ?? 0) + 1} flat />}
            </Show>
          )}
        </For>
      </Show>
    </>
  );
};
