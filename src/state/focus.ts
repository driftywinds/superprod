import { createSignal } from 'solid-js';
import { config } from './config-store';
import { todayStr } from '../domain/models';

/**
 * Focus mode: Pomodoro / Flowtime / Countdown (FEATURES.md §3).
 *
 * State machine mirrors upstream `FocusModeState`: a single timer (work or
 * break), a cycle counter, and a screen. Deliberately in-memory — upstream does
 * not persist focus state either, so a restart resets the cycle.
 *
 * shortcut: no sound playback and no preparation screen yet; both are settings
 * that exist but are not wired. Upgrade when sound lands.
 */

export type FocusMode = 'Pomodoro' | 'Flowtime' | 'Countdown';
export type FocusPhase = 'work' | 'break';

export interface FocusState {
  isActive: boolean;
  isRunning: boolean;
  phase: FocusPhase;
  mode: FocusMode;
  cycle: number;
  /** Length of the current phase in ms (0 for Flowtime, which counts up). */
  duration: number;
  startedAt: number | null;
  /** Elapsed before the current run segment, for pause/resume. */
  accumulated: number;
}

const IDLE: FocusState = {
  isActive: false,
  isRunning: false,
  phase: 'work',
  mode: 'Pomodoro',
  cycle: 1,
  duration: 0,
  startedAt: null,
  accumulated: 0,
};

export const [focus, setFocus] = createSignal<FocusState>({ ...IDLE });
export const [focusTick, setFocusTick] = createSignal(Date.now());

setInterval(() => setFocusTick(Date.now()), 1000);

export const focusElapsed = (state = focus()): number => {
  const running = state.startedAt === null ? 0 : Math.max(0, focusTick() - state.startedAt);
  return state.accumulated + running;
};

export const focusRemaining = (state = focus()): number =>
  state.duration === 0 ? 0 : Math.max(0, state.duration - focusElapsed(state));

export const focusProgress = (state = focus()): number => {
  if (state.duration === 0) return 0;
  return Math.min(1, focusElapsed(state) / state.duration);
};

/** Pomodoro: short breaks, with a longer one every `cyclesBeforeLongerBreak`. */
const pomodoroPhase = (cycle: number, phase: FocusPhase): { duration: number; isLong: boolean } => {
  const config_ = config.pomodoro;
  if (phase === 'work') return { duration: config_.duration, isLong: false };
  const every = Math.max(1, config_.cyclesBeforeLongerBreak);
  const isLong = cycle % every === 0;
  return {
    duration: isLong ? config_.longerBreakDuration : config_.breakDuration,
    isLong,
  };
};

export const startFocus = (mode: FocusMode = 'Pomodoro'): void => {
  const phase = pomodoroPhase(1, 'work');
  setFocus({
    isActive: true,
    isRunning: true,
    phase: 'work',
    mode,
    cycle: 1,
    duration: mode === 'Flowtime' ? 0 : phase.duration,
    startedAt: Date.now(),
    accumulated: 0,
  });
};

export const pauseFocus = (): void => {
  const state = focus();
  if (!state.isRunning) return;
  setFocus({ ...state, isRunning: false, accumulated: focusElapsed(state), startedAt: null });
};

export const resumeFocus = (): void => {
  const state = focus();
  if (state.isRunning || !state.isActive) return;
  setFocus({ ...state, isRunning: true, startedAt: Date.now() });
};

export const stopFocus = (): void => {
  setFocus({ ...IDLE });
};

export interface FocusSession {
  startedAt: number;
  endedAt: number;
  duration: number;
  phase: FocusPhase;
  mode: FocusMode;
  cycle: number;
}

export type FocusSessionSink = (session: FocusSession) => void;
let sessionSink: FocusSessionSink | null = null;
export const setFocusSessionSink = (sink: FocusSessionSink): void => {
  sessionSink = sink;
};

const completePhase = (): void => {
  const state = focus();
  const endedAt = Date.now();
  const duration = focusElapsed(state);

  if (state.phase === 'work' && duration >= 1000) {
    sessionSink?.({
      startedAt: endedAt - duration,
      endedAt,
      duration,
      phase: 'work',
      mode: state.mode,
      cycle: state.cycle,
    });
  }

  if (state.mode === 'Countdown') {
    setFocus({ ...IDLE });
    return;
  }

  // Pomodoro alternates work → break → work, advancing the cycle after a work
  // session (upstream advances on completion of work, not of the break).
  const nextPhase: FocusPhase = state.phase === 'work' ? 'break' : 'work';
  const nextCycle = state.phase === 'work' ? state.cycle + 1 : state.cycle;
  const next = pomodoroPhase(nextCycle, nextPhase);

  setFocus({
    ...state,
    isActive: true,
    isRunning: true,
    phase: nextPhase,
    cycle: nextCycle,
    duration: next.duration,
    startedAt: Date.now(),
    accumulated: 0,
  });
};

/** Called by the UI tick; auto-advances when a fixed-length phase elapses. */
export const advanceFocusIfComplete = (): void => {
  const state = focus();
  if (!state.isActive || !state.isRunning || state.duration === 0) return;
  if (focusElapsed(state) < state.duration) return;

  if (state.mode === 'Countdown' && state.phase === 'work') {
    completePhase();
    return;
  }
  completePhase();
};

export const skipPhase = (): void => completePhase();

export const todayFocusCount = (): number => {
  void todayStr();
  return 0;
};
