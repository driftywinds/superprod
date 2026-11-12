import { Show, For, type JSX } from 'solid-js';
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

const formatDue = (task: Task): string | null => {
  if (task.dueWithTime != null) {
    return new Date(task.dueWithTime).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (task.dueDay) {
    if (task.dueDay === todayStr()) return 'Today';
    return new Date(`${task.dueDay}T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }
  return null;
};

export interface TaskRowProps {
  task: Task;
  depth?: number;
}

export const TaskRow = (props: TaskRowProps): JSX.Element => {
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
            <span class="chip">{props.task.subTaskIds.length} subtasks</span>
          </Show>

          <For each={tags()}>
            {(tag) => (
              <span class="chip" style={{ color: tag.color ?? undefined }}>
                #{tag.title}
              </span>
            )}
          </For>

          <Show when={props.task.notes?.trim()}>
            <span class="chip" title="Has notes">
              <Icon name="note" size={11} />
            </span>
          </Show>
        </div>
      </div>

      <div class="task-actions">
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
