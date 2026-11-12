import { Show, type JSX } from 'solid-js';
import { Icon } from './Icon';
import { formatDuration } from './TaskRow';
import { materialiseOccurrence, selectTask, toggleDone } from '../state/store';
import { minutesToTime, type ProjectedOccurrence } from '../domain/repeat';

/**
 * A repeating occurrence that has no task yet (a future day, or a device that
 * has not generated it). Acting on it creates the real task first — the id is
 * deterministic, so another device doing the same converges on one task.
 */
export const ProjectionRow = (props: { occurrence: ProjectedOccurrence }): JSX.Element => {
  const open = (): void => {
    const task = materialiseOccurrence(props.occurrence.cfgId, props.occurrence.day);
    if (task) selectTask(task.id);
  };

  return (
    <div
      class="task projection"
      role="button"
      tabindex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
    >
      <button
        class="check"
        aria-label="Mark as done"
        onClick={(event) => {
          event.stopPropagation();
          const task = materialiseOccurrence(props.occurrence.cfgId, props.occurrence.day);
          if (task) toggleDone(task.id);
        }}
      >
        <Icon name="check" size={12} />
      </button>
      <div class="task-main">
        <div class="task-title-row">
          <span class="task-title">{props.occurrence.title}</span>
        </div>
        <div class="task-meta">
          <span class="chip" title="Repeats">
            <Icon name="repeat" size={11} />
            Repeats
          </span>
          <Show when={props.occurrence.startMinutes !== null}>
            <span class="chip">
              <Icon name="clock" size={11} />
              {minutesToTime(props.occurrence.startMinutes as number)}
            </span>
          </Show>
          <Show when={props.occurrence.estimateMs > 0}>
            <span class="chip">{formatDuration(props.occurrence.estimateMs)}</span>
          </Show>
        </div>
      </div>
    </div>
  );
};
