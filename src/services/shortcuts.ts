import { config } from '../state/config-store';
import { startFocus } from '../state/focus';
import {
  deleteTask,
  rootTasks,
  selectTask,
  setView,
  state,
  toggleDone,
  toggleTracking,
} from '../state/store';

/**
 * Global keyboard shortcuts (FEATURES.md §14).
 *
 * Bindings come from `config.keyboard`, which the Settings screen edits, so a
 * rebind takes effect immediately. Only actions that exist in this client are
 * dispatched; the rest stay stored for when their feature lands.
 *
 * shortcut: matching is modifier-exact (Ctrl/Shift/Alt) and case-insensitive on
 * the key; layouts that need `event.code` are not handled yet.
 */

interface Binding {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

const parseBinding = (value: string | null | undefined): Binding | null => {
  if (!value) return null;
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const key = parts.pop() ?? '';
  return {
    ctrl: parts.some((part) => /^ctrl$/i.test(part)),
    shift: parts.some((part) => /^shift$/i.test(part)),
    alt: parts.some((part) => /^alt$/i.test(part)),
    key: key.toLowerCase(),
  };
};

const matches = (event: KeyboardEvent, binding: Binding): boolean => {
  if (event.ctrlKey !== binding.ctrl) return false;
  if (event.shiftKey !== binding.shift) return false;
  if (event.altKey !== binding.alt) return false;

  const key = event.key === ' ' ? 'space' : event.key.toLowerCase();
  return key === binding.key;
};

const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable;
};

const orderedTaskIds = (): string[] => rootTasks().map((task) => task.id);

const moveSelection = (delta: number): void => {
  const ids = orderedTaskIds();
  if (ids.length === 0) return;
  const current = state.selectedTaskId;
  const index = current ? ids.indexOf(current) : -1;
  const next = Math.min(ids.length - 1, Math.max(0, index + delta));
  selectTask(ids[next] ?? null);
};

const actions: Record<string, () => void> = {
  goToFocusMode: () => startFocus('Pomodoro'),
  goToWorkView: () => setView('today'),
  goToScheduledView: () => setView('schedule'),
  goToSettings: () => setView('settings'),
  showSearchBar: () => setView('search'),
  selectNextTask: () => moveSelection(1),
  selectPreviousTask: () => moveSelection(-1),
  taskToggleDone: () => {
    if (state.selectedTaskId) toggleDone(state.selectedTaskId);
  },
  taskDelete: () => {
    if (state.selectedTaskId) deleteTask(state.selectedTaskId);
  },
  togglePlay: () => {
    if (state.selectedTaskId) toggleTracking(state.selectedTaskId);
  },
  taskToggleDetailPanelOpen: () => {
    selectTask(state.selectedTaskId ? null : (orderedTaskIds()[0] ?? null));
  },
};

export const startShortcuts = (): void => {
  window.addEventListener('keydown', (event) => {
    if (isTyping(event.target)) return;

    for (const [action, bindingValue] of Object.entries(config.keyboard)) {
      const binding = parseBinding(bindingValue);
      if (!binding) continue;
      if (!matches(event, binding)) continue;

      const run = actions[action];
      if (!run) continue;

      event.preventDefault();
      run();
      return;
    }
  });
};
