import { For, Show, createSignal, type JSX } from 'solid-js';
import { Icon } from './Icon';
import {
  repeatTaskFrom,
  type RepeatPreset,
  deleteRepeatConfig,
  patchRepeatConfig,
  state,
} from '../state/store';
import {
  REPEAT_WEEKDAY_KEYS,
  describeRepeat,
  hasNthWeekdayAnchor,
  upcomingOccurrences,
  type MonthlyWeekOfMonth,
  type MonthlyWeekday,
  type RepeatCycle,
  type TaskRepeatCfg,
} from '../domain/repeat';
import { todayStr, type Task } from '../domain/models';

/**
 * Repeat editor for one task: create a series from the task, change its rules,
 * and see the next occurrences before committing to them. Every edit is applied
 * immediately (one op per change), like the rest of the detail panel.
 */

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CYCLES: { value: RepeatCycle; label: string; unit: string }[] = [
  { value: 'DAILY', label: 'Daily', unit: 'day' },
  { value: 'WEEKLY', label: 'Weekly', unit: 'week' },
  { value: 'MONTHLY', label: 'Monthly', unit: 'month' },
  { value: 'YEARLY', label: 'Yearly', unit: 'year' },
];

type MonthlyMode = 'DATE' | 'LAST' | 'NTH';

const monthlyMode = (cfg: TaskRepeatCfg): MonthlyMode =>
  hasNthWeekdayAnchor(cfg) ? 'NTH' : cfg.monthlyLastDay ? 'LAST' : 'DATE';

const formatDay = (day: string): string =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

export const RepeatEditor = (props: { task: Task }): JSX.Element => {
  const [open, setOpen] = createSignal(false);
  const cfg = (): TaskRepeatCfg | undefined =>
    props.task.repeatCfgId ? state.repeatCfgs[props.task.repeatCfgId] : undefined;

  /** Start a series from this task. All-day unless the task already has a time. */
  const start = (preset: RepeatPreset): void => {
    if (repeatTaskFrom(props.task.id, preset)) setOpen(true);
  };

  const preview = (): string[] => {
    const current = cfg();
    if (!current) return [];
    return upcomingOccurrences(current, todayStr(), 5, { inclusive: true });
  };

  return (
    <div class="field repeat-editor">
      <span class="label">Repeat</span>

      <Show
        when={cfg()}
        fallback={
          <div class="repeat-presets">
            <button class="chip-btn" onClick={() => start('DAILY')}>
              Every day
            </button>
            <button class="chip-btn" onClick={() => start('WEEKDAYS')}>
              Weekdays
            </button>
            <button class="chip-btn" onClick={() => start('WEEKLY')}>
              Every week
            </button>
            <button class="chip-btn" onClick={() => start('MONTHLY')}>
              Every month
            </button>
            <button class="chip-btn" onClick={() => start('YEARLY')}>
              Every year
            </button>
          </div>
        }
      >
        {(current) => (
          <div class="repeat-card">
            <button class="repeat-summary" onClick={() => setOpen(!open())} aria-expanded={open()}>
              <Icon name="repeat" size={16} />
              <span class="repeat-summary-text">
                {describeRepeat(current())}
                <Show when={current().isPaused}>
                  <em> · paused</em>
                </Show>
              </span>
              <span class="repeat-caret" classList={{ open: open() }}>
                <Icon name="chevron" size={14} />
              </span>
            </button>

            <Show when={open()}>
              <div class="repeat-body">
                <div class="seg">
                  <For each={CYCLES}>
                    {(cycle) => (
                      <button
                        classList={{ on: current().repeatCycle === cycle.value }}
                        onClick={() => patchRepeatConfig(current().id, { repeatCycle: cycle.value })}
                      >
                        {cycle.label}
                      </button>
                    )}
                  </For>
                </div>

                <label class="repeat-line">
                  <span>Every</span>
                  <input
                    class="input narrow"
                    type="number"
                    min="1"
                    max="99"
                    value={current().repeatEvery ?? 1}
                    onChange={(event) => {
                      const value = Math.max(1, Math.round(Number(event.currentTarget.value) || 1));
                      patchRepeatConfig(current().id, { repeatEvery: value });
                    }}
                  />
                  <span>
                    {CYCLES.find((cycle) => cycle.value === current().repeatCycle)?.unit}
                    {(current().repeatEvery ?? 1) === 1 ? '' : 's'}
                  </span>
                </label>

                <Show when={current().repeatCycle === 'WEEKLY'}>
                  <div class="weekday-row" role="group" aria-label="Repeat on">
                    <For each={REPEAT_WEEKDAY_KEYS}>
                      {(key, index) => (
                        <button
                          class="weekday"
                          classList={{ on: current()[key] === true }}
                          aria-label={WEEKDAY_NAMES[index()]}
                          aria-pressed={current()[key] === true}
                          onClick={() => {
                            const next = !(current()[key] === true);
                            const others = REPEAT_WEEKDAY_KEYS.filter(
                              (other) => other !== key && current()[other] === true,
                            );
                            // A weekly series needs at least one weekday.
                            if (!next && others.length === 0) return;
                            patchRepeatConfig(current().id, { [key]: next });
                          }}
                        >
                          {WEEKDAY_LABELS[index()]}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>

                <Show when={current().repeatCycle === 'MONTHLY'}>
                  <div class="field-inline">
                    <select
                      class="input"
                      value={monthlyMode(current())}
                      onChange={(event) => {
                        const mode = event.currentTarget.value as MonthlyMode;
                        if (mode === 'DATE') {
                          patchRepeatConfig(current().id, {
                            monthlyLastDay: false,
                            monthlyWeekOfMonth: undefined,
                            monthlyWeekday: undefined,
                          });
                        } else if (mode === 'LAST') {
                          patchRepeatConfig(current().id, {
                            monthlyLastDay: true,
                            monthlyWeekOfMonth: undefined,
                            monthlyWeekday: undefined,
                          });
                        } else {
                          const day = new Date(`${current().startDate ?? todayStr()}T12:00:00`);
                          patchRepeatConfig(current().id, {
                            monthlyLastDay: false,
                            monthlyWeekOfMonth: Math.min(4, Math.ceil(day.getDate() / 7)) as MonthlyWeekOfMonth,
                            monthlyWeekday: day.getDay() as MonthlyWeekday,
                          });
                        }
                      }}
                    >
                      <option value="DATE">On the same date each month</option>
                      <option value="LAST">On the last day of the month</option>
                      <option value="NTH">On the nth weekday…</option>
                    </select>
                  </div>
                  <Show when={monthlyMode(current()) === 'NTH'}>
                    <div class="repeat-line">
                      <select
                        class="input"
                        value={String(current().monthlyWeekOfMonth)}
                        onChange={(event) =>
                          patchRepeatConfig(current().id, {
                            monthlyWeekOfMonth: Number(event.currentTarget.value) as MonthlyWeekOfMonth,
                          })
                        }
                      >
                        <option value="1">first</option>
                        <option value="2">second</option>
                        <option value="3">third</option>
                        <option value="4">fourth</option>
                        <option value="-1">last</option>
                      </select>
                      <select
                        class="input"
                        value={String(current().monthlyWeekday)}
                        onChange={(event) =>
                          patchRepeatConfig(current().id, {
                            monthlyWeekday: Number(event.currentTarget.value) as MonthlyWeekday,
                          })
                        }
                      >
                        <For each={WEEKDAY_NAMES}>
                          {(name, index) => <option value={String(index())}>{name}</option>}
                        </For>
                      </select>
                    </div>
                  </Show>
                </Show>

                <div class="repeat-grid">
                  <label class="repeat-field">
                    <span class="sub-label">Starts</span>
                    <input
                      class="input"
                      type="date"
                      value={current().startDate ?? ''}
                      onChange={(event) =>
                        patchRepeatConfig(current().id, {
                          startDate: event.currentTarget.value || undefined,
                        })
                      }
                    />
                  </label>
                  <label class="repeat-field">
                    <span class="sub-label">Ends (optional)</span>
                    <input
                      class="input"
                      type="date"
                      value={current().repeatUntilDay ?? ''}
                      onChange={(event) =>
                        patchRepeatConfig(current().id, {
                          repeatUntilDay: event.currentTarget.value || undefined,
                        })
                      }
                    />
                  </label>
                  <label class="repeat-field">
                    <span class="sub-label">Time of day</span>
                    <input
                      class="input"
                      type="time"
                      value={current().startTime ?? ''}
                      onChange={(event) =>
                        patchRepeatConfig(current().id, {
                          startTime: event.currentTarget.value || null,
                        })
                      }
                    />
                  </label>
                  <div class="repeat-field">
                    <span class="sub-label">&nbsp;</span>
                    <button
                      class="btn"
                      disabled={!current().startTime}
                      onClick={() => patchRepeatConfig(current().id, { startTime: null })}
                    >
                      All day
                    </button>
                  </div>
                </div>

                <label class="check-row">
                  <input
                    type="checkbox"
                    checked={current().repeatFromCompletionDate === true}
                    onChange={(event) =>
                      patchRepeatConfig(current().id, {
                        repeatFromCompletionDate: event.currentTarget.checked,
                      })
                    }
                  />
                  <span>Count from when I finish it, not the original date</span>
                </label>
                <label class="check-row">
                  <input
                    type="checkbox"
                    checked={current().waitForCompletion === true}
                    onChange={(event) =>
                      patchRepeatConfig(current().id, {
                        waitForCompletion: event.currentTarget.checked,
                      })
                    }
                  />
                  <span>Wait until the last one is done before creating the next</span>
                </label>

                <div class="repeat-preview">
                  <span class="sub-label">Next up</span>
                  <Show
                    when={preview().length > 0}
                    fallback={<span class="muted">No upcoming occurrences.</span>}
                  >
                    <ul>
                      <For each={preview()}>{(day) => <li>{formatDay(day)}</li>}</For>
                    </ul>
                  </Show>
                </div>

                <div class="btn-row">
                  <button
                    class="btn"
                    onClick={() => patchRepeatConfig(current().id, { isPaused: !current().isPaused })}
                  >
                    {current().isPaused ? 'Resume series' : 'Pause series'}
                  </button>
                  <button
                    class="btn danger"
                    onClick={() => {
                      if (confirm('Stop repeating? Tasks already created stay.')) {
                        deleteRepeatConfig(current().id);
                        setOpen(false);
                      }
                    }}
                  >
                    Stop repeating
                  </button>
                </div>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
};
