import { onCleanup, For, Show, createSignal, type JSX } from 'solid-js';
import { Icon } from './Icon';
import { registerBackHandler } from '../services/back';
import { RepeatEditor } from './RepeatEditor';
import {
  addSubTask,
  deleteTask,
  moveSubTask,
  promoteSubTask,
  renameTask,
  scheduleTaskAt,
  removeSchedule,
  scheduleToday,
  selectTask,
  selectedTask,
  setDueDay,
  setPriority,
  state,
  toggleDone,
  toggleTracking,
  updateTask,
  isTracking,
} from '../state/store';
import { isTaskForToday, toDayStr, todayStr } from '../domain/models';
import {
  appendChecklistItem,
  checklistProgress,
  parseChecklist,
  toggleChecklistLine,
} from '../domain/checklist';
import { formatDuration } from './TaskRow';

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time. */
const toLocalInput = (timestamp: number | null | undefined): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const dayOf = (task: { dueDay?: string | null; dueWithTime?: number | null }): string =>
  task.dueWithTime != null ? toDayStr(new Date(task.dueWithTime)) : (task.dueDay ?? '');

const timeOf = (task: { dueWithTime?: number | null }): string | null => {
  if (task.dueWithTime == null) return null;
  const date = new Date(task.dueWithTime);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const PRIORITIES = [
  { value: 3, label: 'High' },
  { value: 2, label: 'Medium' },
  { value: 1, label: 'Low' },
] as const;

export const TaskDetail = (): JSX.Element => {
  // The panel is only mounted while a task is selected, so back always closes it.
  onCleanup(
    registerBackHandler('task-detail', () => {
      selectTask(null);
      return true;
    }),
  );
  const [subtaskTitle, setSubtaskTitle] = createSignal('');
  const [tagsText, setTagsText] = createSignal<string | null>(null);
  const [checkText, setCheckText] = createSignal('');

  const task = () => selectedTask();

  const commitTags = (raw: string) => {
    const current = task();
    if (!current) return;
    const titles = raw
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, '').trim().toLowerCase())
      .filter(Boolean);

    // Only attach tags that already exist; new tags are minted by the add-task
    // path (ensureTag) so there is one creation code path.
    const ids = titles.flatMap((title) => {
      const existing = state.tagOrder
        .map((id) => state.tags[id])
        .find((tag) => tag?.title.toLowerCase() === title);
      return existing ? [existing.id] : [];
    });

    updateTask(current.id, { tagIds: [...new Set(ids)] });
    setTagsText(null);
  };

  return (
    <Show when={task()}>
      {(current) => (
        <aside class="detail">
          <div class="detail-head">
            <button class="detail-back" onClick={() => selectTask(null)}>
              <Icon name="chevronLeft" size={16} />
              Back
            </button>
            <div class="spacer" />
            <button class="icon-btn" aria-label="Close details" onClick={() => selectTask(null)}>
              <Icon name="close" />
            </button>
          </div>

          <div class="detail-body">
            <input
              class="input title-input"
              value={current().title}
              aria-label="Task title"
              onInput={(event) =>
                updateTask(current().id, { title: event.currentTarget.value })
              }
            />

            <div class="btn-row">
              <button
                class="btn"
                classList={{ primary: !current().isDone }}
                onClick={() => toggleDone(current().id)}
              >
                {current().isDone ? 'Reopen' : 'Complete'}
              </button>
              <button
                class="btn"
                classList={{ primary: isTracking(current().id) }}
                onClick={() => toggleTracking(current().id)}
              >
                {isTracking(current().id) ? 'Stop' : 'Track'}
              </button>
              <button
                class="btn"
                onClick={() =>
                  isTaskForToday(current())
                    ? removeSchedule(current().id)
                    : scheduleToday(current().id)
                }
              >
                {isTaskForToday(current()) ? 'Unschedule' : 'Today'}
              </button>
              <button class="btn danger" onClick={() => deleteTask(current().id)}>
                <Icon name="trash" size={13} />
              </button>
            </div>

            <div class="field">
              <span class="label">Priority</span>
              <div class="seg">
                <For each={PRIORITIES}>
                  {(priority) => (
                    <button
                      classList={{ on: current().priority === priority.value }}
                      onClick={() =>
                        setPriority(
                          current().id,
                          current().priority === priority.value ? null : priority.value,
                        )
                      }
                    >
                      {priority.label}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <Show when={!current().parentId}>
              <div class="field">
                <span class="label">When</span>
                <div class="when-grid">
                  <input
                    id="due-date"
                    class="input"
                    type="date"
                    aria-label="Day"
                    value={dayOf(current())}
                    onChange={(event) => {
                      const day = event.currentTarget.value;
                      if (!day) return removeSchedule(current().id);
                      const time = timeOf(current());
                      if (time) scheduleTaskAt(current().id, day, time);
                      else setDueDay(current().id, day);
                    }}
                  />
                  <input
                    class="input"
                    type="time"
                    aria-label="Time of day"
                    value={timeOf(current()) ?? ''}
                    onChange={(event) => {
                      const time = event.currentTarget.value;
                      const day = dayOf(current()) || todayStr();
                      scheduleTaskAt(current().id, day, time || null);
                    }}
                  />
                </div>
                <div class="chip-row">
                  <button class="chip-btn" onClick={() => setDueDay(current().id, todayStr())}>
                    Today
                  </button>
                  <button
                    class="chip-btn"
                    onClick={() => setDueDay(current().id, toDayStr(new Date(Date.now() + 86_400_000)))}
                  >
                    Tomorrow
                  </button>
                  <Show when={timeOf(current())}>
                    <button
                      class="chip-btn"
                      onClick={() => scheduleTaskAt(current().id, dayOf(current()), null)}
                    >
                      Make all-day
                    </button>
                  </Show>
                  <Show when={current().dueDay || current().dueWithTime}>
                    <button class="chip-btn" onClick={() => removeSchedule(current().id)}>
                      Clear
                    </button>
                  </Show>
                </div>
                <p class="setting-help">
                  {timeOf(current()) ? 'Scheduled at a specific time.' : current().dueDay ? 'All-day.' : 'Not scheduled.'}
                </p>
              </div>

              <RepeatEditor task={current()} />
            </Show>

            <div class="field">
              <label class="label" for="task-remind-at">
                Reminder
              </label>
              <input
                id="task-remind-at"
                class="input"
                type="datetime-local"
                value={toLocalInput(current().remindAt)}
                onInput={(event) => {
                  const value = event.currentTarget.value;
                  updateTask(current().id, {
                    remindAt: value ? new Date(value).getTime() : null,
                  });
                }}
              />
              <Show when={current().remindAt}>
                <button
                  class="btn"
                  onClick={() => updateTask(current().id, { remindAt: null })}
                >
                  Clear reminder
                </button>
              </Show>
            </div>

            <div class="field">
              <label class="label" for="task-deadline">
                Deadline
              </label>
              <input
                id="task-deadline"
                class="input"
                type="date"
                value={current().deadlineDay ?? ''}
                onInput={(event) =>
                  updateTask(current().id, {
                    deadlineDay: event.currentTarget.value || null,
                    deadlineRemindAt: event.currentTarget.value
                      ? new Date(`${event.currentTarget.value}T09:00:00`).getTime()
                      : null,
                  })
                }
              />
            </div>

            <div class="field">
              <label class="label" for="task-estimate">
                Estimate
              </label>
              <div class="setting-input">
                <input
                  id="task-estimate"
                  class="input"
                  type="number"
                  min="0"
                  step="5"
                  value={Math.round(current().timeEstimate / 60_000)}
                  onInput={(event) =>
                    updateTask(current().id, {
                      timeEstimate: Math.max(0, Number(event.currentTarget.value) || 0) * 60_000,
                    })
                  }
                />
                <span class="setting-unit">min</span>
              </div>
              <p class="setting-help">{formatDuration(current().timeSpent)} tracked so far</p>
            </div>

            <div class="field">
              <span class="label">
                Checklist
                <Show when={checklistProgress(current().notes).total > 0}>
                  <span class="label-count">
                    {checklistProgress(current().notes).done}/{checklistProgress(current().notes).total}
                  </span>
                </Show>
              </span>
              <For each={parseChecklist(current().notes)}>
                {(item) => (
                  <label class="check-row" classList={{ done: item.checked }}>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() =>
                        updateTask(current().id, {
                          notes: toggleChecklistLine(current().notes ?? '', item.line),
                        })
                      }
                    />
                    <span>{item.text}</span>
                  </label>
                )}
              </For>
              <form
                class="btn-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = checkText().trim();
                  if (!text) return;
                  updateTask(current().id, { notes: appendChecklistItem(current().notes, text) });
                  setCheckText('');
                }}
              >
                <input
                  class="input"
                  style={{ flex: 1 }}
                  placeholder="Add a checklist item…"
                  value={checkText()}
                  onInput={(event) => setCheckText(event.currentTarget.value)}
                />
                <button class="btn" type="submit" aria-label="Add checklist item">
                  <Icon name="plus" size={14} />
                </button>
              </form>
            </div>

            <div class="field">
              <label class="label" for="task-notes">
                Notes
              </label>
              <textarea
                id="task-notes"
                class="textarea"
                placeholder="Markdown notes… use - [ ] for checklist items"
                value={current().notes ?? ''}
                onInput={(event) =>
                  updateTask(current().id, { notes: event.currentTarget.value })
                }
              />
            </div>

            <div class="field">
              <label class="label" for="task-tags">
                Tags
              </label>
              <input
                id="task-tags"
                class="input"
                placeholder="space separated, e.g. work deep"
                value={
                  tagsText() ??
                  current()
                    .tagIds.map((id) => state.tags[id]?.title)
                    .filter(Boolean)
                    .join(' ')
                }
                onInput={(event) => setTagsText(event.currentTarget.value)}
                onBlur={(event) => commitTags(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>

            <Show when={!current().parentId}>
              <div class="field">
                <span class="label">
                  Subtasks
                  <Show when={current().subTaskIds.length > 0}>
                    <span class="label-count">
                      {current().subTaskIds.filter((id) => state.tasks[id]?.isDone).length}/
                      {current().subTaskIds.length}
                    </span>
                  </Show>
                </span>
                <For each={current().subTaskIds}>
                  {(subtaskId, index) => {
                    const subtask = () => state.tasks[subtaskId];
                    return (
                      <Show when={subtask()}>
                        {(child) => (
                          <div class="sub-row" classList={{ done: child().isDone }}>
                            <input
                              type="checkbox"
                              checked={child().isDone}
                              aria-label="Subtask done"
                              onChange={() => toggleDone(child().id)}
                            />
                            <input
                              class="sub-title"
                              value={child().title}
                              aria-label="Subtask title"
                              onChange={(event) => renameTask(child().id, event.currentTarget.value)}
                            />
                            <button
                              class="icon-btn"
                              aria-label="Move up"
                              disabled={index() === 0}
                              onClick={() => moveSubTask(current().id, child().id, -1)}
                            >
                              <span class="flip-up"><Icon name="chevron" size={13} /></span>
                            </button>
                            <button
                              class="icon-btn"
                              aria-label="Move down"
                              disabled={index() === current().subTaskIds.length - 1}
                              onClick={() => moveSubTask(current().id, child().id, 1)}
                            >
                              <span class="flip-down"><Icon name="chevron" size={13} /></span>
                            </button>
                            <button
                              class="icon-btn"
                              aria-label="Make top-level task"
                              title="Make top-level task"
                              onClick={() => promoteSubTask(child().id)}
                            >
                              <Icon name="chevronLeft" size={13} />
                            </button>
                            <button
                              class="icon-btn"
                              aria-label="Delete subtask"
                              onClick={() => deleteTask(child().id)}
                            >
                              <Icon name="close" size={13} />
                            </button>
                          </div>
                        )}
                      </Show>
                    );
                  }}
                </For>

                <form
                  class="btn-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const title = subtaskTitle().trim();
                    if (!title) return;
                    addSubTask(current().id, title);
                    setSubtaskTitle('');
                  }}
                >
                  <input
                    class="input"
                    style={{ flex: 1 }}
                    placeholder="Add a subtask…"
                    value={subtaskTitle()}
                    onInput={(event) => setSubtaskTitle(event.currentTarget.value)}
                  />
                  <button class="btn" type="submit" aria-label="Add subtask">
                    <Icon name="plus" size={14} />
                  </button>
                </form>
              </div>
            </Show>
            <Show when={current().parentId}>
              <button class="btn" onClick={() => selectTask(current().parentId as string)}>
                <Icon name="chevronLeft" size={14} /> Open parent task
              </button>
            </Show>
          </div>
        </aside>
      )}
    </Show>
  );
};
