import { For, Show, createEffect, createSignal, onCleanup, type JSX } from 'solid-js';
import { config } from '../state/config-store';
import { Icon } from './Icon';
import {
  advanceFocusIfComplete,
  focus,
  focusProgress,
  focusRemaining,
  focusElapsed,
  pauseFocus,
  resumeFocus,
  setFocusSessionSink,
  skipPhase,
  startFocus,
  stopFocus,
  type FocusMode,
} from '../state/focus';
import { recordFocusSession } from '../state/store';

const MODES: FocusMode[] = ['Pomodoro', 'Flowtime', 'Countdown'];

const mmss = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const FocusOverlay = (): JSX.Element => {
  setFocusSessionSink((session) => {
    if (session.phase === 'work') recordFocusSession(session.duration);
  });

  createEffect(() => {
    const interval = setInterval(() => advanceFocusIfComplete(), 500);
    onCleanup(() => clearInterval(interval));
  });

  const isBreak = () => focus().phase === 'break';
  const remaining = () => focusRemaining();
  const elapsed = () => focusElapsed();
  const display = () => (focus().duration === 0 ? mmss(elapsed()) : mmss(remaining()));

  return (
    <Show when={focus().isActive}>
      <div class="focus-overlay" classList={{ break: isBreak() }}>
        <div class="focus-top">
          <span class="chip">{focus().mode}</span>
          <span class="chip">
            {isBreak() ? 'Break' : 'Focus'} · cycle {focus().cycle}
          </span>
          <div class="spacer" />
          <button class="icon-btn" aria-label="Exit focus mode" onClick={stopFocus}>
            <Icon name="close" />
          </button>
        </div>

        <div class="focus-center">
          <div class="focus-ring">
            <svg viewBox="0 0 120 120" class="focus-ring-svg" aria-hidden="true">
              <circle cx="60" cy="60" r="54" class="ring-track" />
              <circle
                cx="60"
                cy="60"
                r="54"
                class="ring-value"
                style={{
                  'stroke-dasharray': `${2 * Math.PI * 54}`,
                  'stroke-dashoffset': `${2 * Math.PI * 54 * (1 - focusProgress())}`,
                }}
              />
            </svg>
            <div class="focus-time">{display()}</div>
          </div>

          <p class="focus-hint">
            {isBreak()
              ? 'Step away. The next focus session starts when this ends.'
              : focus().duration === 0
                ? 'Flowtime — press stop when you are done.'
                : 'Stay with one task.'}
          </p>
        </div>

        <div class="focus-actions">
          <button class="btn" onClick={skipPhase}>
            {isBreak() ? 'Skip break' : 'Skip to break'}
          </button>
          <Show
            when={focus().isRunning}
            fallback={
              <button class="btn primary" onClick={resumeFocus}>
                <Icon name="play" size={14} /> Resume
              </button>
            }
          >
            <button class="btn primary" onClick={pauseFocus}>
              <Icon name="pause" size={14} /> Pause
            </button>
          </Show>
          <button class="btn danger" onClick={stopFocus}>
            Stop
          </button>
        </div>
      </div>
    </Show>
  );
};

/** Compact entry point shown in the header when focus mode is off. */
export const FocusStartButton = (): JSX.Element => {
  const [open, setOpen] = createSignal(false);

  return (
    <div class="focus-start">
      <button
        class="icon-btn"
        aria-label="Start focus mode"
        title="Focus mode"
        onClick={() => setOpen(!open())}
      >
        <Icon name="sparkle" />
      </button>
      <Show when={open()}>
        <button class="focus-scrim" aria-label="Close menu" tabindex={-1} onClick={() => setOpen(false)} />
        <div class="focus-menu">
          <For each={MODES}>
            {(mode) => (
              <button
                class="focus-menu-item"
                onClick={() => {
                  startFocus(mode);
                  setOpen(false);
                }}
              >
                {mode}
                <span class="focus-menu-hint">
                  {mode === 'Pomodoro'
                    ? `${Math.round(configDuration(mode) / 60000)} min`
                    : mode === 'Flowtime'
                      ? 'no fixed length'
                      : 'pick a length'}
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

const configDuration = (mode: FocusMode): number =>
  mode === 'Pomodoro' ? config.pomodoro.duration : 0;

