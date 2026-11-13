import { For, Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from 'solid-js';
import { registerBackHandler } from '../services/back';
import { Icon } from './Icon';
import {
  addTask,
  repeatTaskFrom,
  resolveProjectQuery,
  state,
  type RepeatPreset,
} from '../state/store';
import { INBOX_PROJECT_ID, TODAY_TAG_ID } from '../domain/models';
import { parseShortSyntax } from '../domain/short-syntax';
import {
  clearWhen,
  removeToken,
  setClock,
  setDay,
  setEstimate,
  setPriority,
  setProject,
  setRelative,
  toggleTag,
  typable,
} from '../domain/add-task-edit';

/**
 * Full add-task view. The text box keeps the short syntax (`#tag +project p1 1h
 * tomorrow 16:00 in 2m`); everything below it is a shortcut that edits that text,
 * and everything typed is read back and shown as chips, so both ways stay in sync.
 */

export const ADD_EXAMPLES = [
  ['#tag', 'tag'],
  ['+project', 'project'],
  ['p1', 'priority (p1–p3)'],
  ['1h 30m', 'time estimate'],
  ['16:00', 'at a time'],
  ['3pm', 'at a time'],
  ['tomorrow', 'a day'],
  ['wednesday', 'a weekday'],
  ['3 pm wednesday', 'day + time'],
  ['in 2m', 'relative'],
  ['in 3 hours', 'relative'],
] as const;

const DAY_CHIPS = ['today', 'tomorrow'];
const RELATIVE_CHIPS = [
  ['in 30 min', '+30 min'],
  ['in 1 hour', '+1 hour'],
  ['in 2 hours', '+2 hours'],
] as const;
const ESTIMATES = ['15m', '30m', '1h', '2h'];
const REPEATS: { value: RepeatPreset | ''; label: string }[] = [
  { value: '', label: 'Does not repeat' },
  { value: 'DAILY', label: 'Every day' },
  { value: 'WEEKDAYS', label: 'Weekdays' },
  { value: 'WEEKLY', label: 'Every week' },
  { value: 'MONTHLY', label: 'Every month' },
  { value: 'YEARLY', label: 'Every year' },
];

const pad = (value: number): string => String(value).padStart(2, '0');

export const AddTaskSheet = (props: {
  open: boolean;
  initial: string;
  defaultProjectId?: string;
  onClose: () => void;
}): JSX.Element => {
  // Back closes the sheet before it pops the screen behind it.
  createEffect(() => {
    if (!props.open) return;
    onCleanup(
      registerBackHandler('add-task-sheet', () => {
        props.onClose();
        return true;
      }),
    );
  });
  const [text, setText] = createSignal('');
  const [repeat, setRepeat] = createSignal<RepeatPreset | ''>('');
  let inputRef: HTMLInputElement | undefined;

  createEffect(() => {
    if (!props.open) return;
    setText(props.initial);
    setRepeat('');
    setTimeout(() => inputRef?.focus(), 60);
  });

  const parsed = createMemo(() => parseShortSyntax(text(), { enableDeadline: true }));
  const baseProjectId = () => props.defaultProjectId ?? INBOX_PROJECT_ID;
  const projectId = () => resolveProjectQuery(parsed().projectQuery)?.id ?? baseProjectId();

  const tagOptions = createMemo(() =>
    state.tagOrder
      .map((id) => state.tags[id])
      .filter((tag) => tag !== undefined && tag.id !== TODAY_TAG_ID && typable(tag.title) !== null)
      .map((tag) => tag!.title),
  );

  const projectOptions = createMemo(() =>
    state.projectOrder
      .map((id) => state.projects[id])
      .filter((project) => project !== undefined && !project.isArchived),
  );

  const dayText = () => parsed().tokens.find((token) => token.kind === 'day')?.text.toLowerCase();
  const clockValue = (): string => {
    const hasClock = parsed().tokens.some((token) => token.kind === 'clock');
    const ts = parsed().dueWithTime;
    if (!hasClock || ts === undefined) return '';
    const date = new Date(ts);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const dateValue = (): string => {
    const text = dayText();
    return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  };
  const hasWhen = () =>
    parsed().tokens.some((token) => ['day', 'clock', 'relative'].includes(token.kind));

  const whenSummary = (): string => {
    const { dueWithTime, dueDay } = parsed();
    if (dueWithTime !== undefined) {
      return new Date(dueWithTime).toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (dueDay) {
      return new Date(`${dueDay}T12:00:00`).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
    }
    return 'No date';
  };

  const submit = (): void => {
    const value = text().trim();
    if (!parsed().title && !value) return;
    const task = addTask({
      title: value,
      projectId: props.defaultProjectId,
      enableDeadline: true,
    });
    if (repeat()) repeatTaskFrom(task.id, repeat() as RepeatPreset);
    props.onClose();
  };

  return (
    <Show when={props.open}>
      <div class="sheet-backdrop" onClick={props.onClose}>
        <form
          class="sheet"
          role="dialog"
          aria-label="Add task"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') props.onClose();
          }}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div class="sheet-head">
            <strong>New task</strong>
            <button type="button" class="icon-btn" aria-label="Close" onClick={props.onClose}>
              <Icon name="close" size={18} />
            </button>
          </div>

          <input
            ref={inputRef}
            class="input sheet-input"
            value={text()}
            placeholder="What needs doing?"
            aria-label="Task text"
            onInput={(event) => setText(event.currentTarget.value)}
          />

          <div class="sheet-understood">
            <div class="sheet-title-preview">{parsed().title || 'Untitled'}</div>
            <div class="chip-row">
              <For each={parsed().tokens}>
                {(token) => (
                  <button
                    type="button"
                    class="chip-btn on"
                    title="Remove"
                    onClick={() => setText(removeToken(text(), token))}
                  >
                    {token.text} <Icon name="close" size={11} />
                  </button>
                )}
              </For>
              <Show when={parsed().tokens.length === 0}>
                <span class="muted sheet-hint">
                  Type or tap options below. Typed shortcuts show up here.
                </span>
              </Show>
            </div>
            <div class="sheet-meta">
              <span>
                <Icon name="calendar" size={13} /> {whenSummary()}
              </span>
              <span>
                <Icon name="briefcase" size={13} />{' '}
                {state.projects[projectId()]?.title ?? 'Inbox'}
              </span>
            </div>
          </div>

          <div class="sheet-group">
            <span class="sub-label">When</span>
            <div class="chip-row">
              <For each={DAY_CHIPS}>
                {(day) => (
                  <button
                    type="button"
                    class="chip-btn"
                    classList={{ on: dayText() === day }}
                    onClick={() => setText(setDay(text(), dayText() === day ? null : day))}
                  >
                    {day[0]!.toUpperCase() + day.slice(1)}
                  </button>
                )}
              </For>
              <For each={RELATIVE_CHIPS}>
                {([value, label]) => (
                  <button
                    type="button"
                    class="chip-btn"
                    onClick={() => setText(setRelative(text(), value))}
                  >
                    {label}
                  </button>
                )}
              </For>
              <Show when={hasWhen()}>
                <button type="button" class="chip-btn" onClick={() => setText(clearWhen(text()))}>
                  Clear
                </button>
              </Show>
            </div>
            <div class="sheet-grid">
              <label class="repeat-field">
                <span class="sub-label">Date</span>
                <input
                  class="input"
                  type="date"
                  value={dateValue()}
                  onChange={(event) => setText(setDay(text(), event.currentTarget.value || null))}
                />
              </label>
              <label class="repeat-field">
                <span class="sub-label">Time</span>
                <input
                  class="input"
                  type="time"
                  value={clockValue()}
                  onChange={(event) =>
                    setText(setClock(text(), event.currentTarget.value || null))
                  }
                />
              </label>
            </div>
          </div>

          <div class="sheet-group">
            <span class="sub-label">Repeat</span>
            <select
              class="input select"
              value={repeat()}
              onChange={(event) => setRepeat(event.currentTarget.value as RepeatPreset | '')}
            >
              <For each={REPEATS}>{(option) => <option value={option.value}>{option.label}</option>}</For>
            </select>
          </div>

          <div class="sheet-group">
            <span class="sub-label">Project</span>
            <select
              class="input select"
              value={projectId()}
              onChange={(event) => {
                const id = event.currentTarget.value;
                if (id === baseProjectId()) {
                  setText(setProject(text(), null));
                  return;
                }
                const compact = typable(state.projects[id]?.title ?? '');
                if (compact) setText(setProject(text(), compact));
              }}
            >
              <For each={projectOptions()}>
                {(project) => <option value={project!.id}>{project!.title}</option>}
              </For>
            </select>
          </div>

          <Show when={tagOptions().length > 0}>
            <div class="sheet-group">
              <span class="sub-label">Tags</span>
              <div class="chip-row">
                <For each={tagOptions()}>
                  {(tag) => (
                    <button
                      type="button"
                      class="chip-btn"
                      classList={{ on: parsed().tagTitles.includes(tag.toLowerCase()) }}
                      onClick={() => setText(toggleTag(text(), tag))}
                    >
                      #{tag}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <div class="sheet-group">
            <span class="sub-label">Priority and estimate</span>
            <div class="chip-row">
              <For each={[3, 2, 1] as const}>
                {(level) => (
                  <button
                    type="button"
                    class="chip-btn"
                    classList={{ on: parsed().priority === level }}
                    onClick={() =>
                      setText(setPriority(text(), parsed().priority === level ? null : level))
                    }
                  >
                    {level === 3 ? 'High' : level === 2 ? 'Medium' : 'Low'}
                  </button>
                )}
              </For>
              <For each={ESTIMATES}>
                {(estimate) => (
                  <button
                    type="button"
                    class="chip-btn"
                    onClick={() => setText(setEstimate(text(), estimate))}
                  >
                    {estimate}
                  </button>
                )}
              </For>
            </div>
          </div>

          <details class="sheet-examples">
            <summary>Shortcuts you can type</summary>
            <ul>
              <For each={ADD_EXAMPLES}>
                {([example, meaning]) => (
                  <li>
                    <code>{example}</code> <span class="muted">{meaning}</span>
                  </li>
                )}
              </For>
            </ul>
          </details>

          <button type="submit" class="btn primary sheet-submit" disabled={!text().trim()}>
            Add task
          </button>
        </form>
      </div>
    </Show>
  );
};
