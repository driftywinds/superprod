import { createStore, produce } from 'solid-js/store';
import { setDayStartMinutes } from '../domain/models';
import { DEFAULT_CONFIG, normalizeConfig, type GlobalConfig } from '../domain/config';

/**
 * Global config store.
 *
 * shortcut: persisted as one JSON blob in localStorage, separate from task
 * state, until settings become op-log entities (GLOBAL_CONFIG) that sync.
 */
const STORAGE_KEY = 'superprod.config.v1';

const load = (): GlobalConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : structuredClone(DEFAULT_CONFIG);
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
};

export const [config, setConfig] = createStore<GlobalConfig>(load());

const syncDayStart = (): void => {
  const [h, m] = (config.misc.startOfNextDayTime ?? '00:00').split(':').map((n) => Number(n) || 0);
  setDayStartMinutes((h ?? 0) * 60 + (m ?? 0));
};
syncDayStart();

const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage unavailable — keep the in-memory config.
  }
};

/**
 * Set one leaf: `updateConfig('misc', 'startOfNextDayTime', '04:00')`.
 *
 * Deliberately loose: the settings schema is the single source of which keys
 * exist per section, and every value is normalised on load. A per-key generic
 * here fights `produce`'s mapped types for no runtime gain.
 */
export const updateConfig = (
  section: keyof GlobalConfig,
  key: string,
  value: unknown,
): void => {
  setConfig(
    produce((draft) => {
      (draft[section] as unknown as Record<string, unknown>)[key] = value;
    }),
  );
  persist();
  syncDayStart();
};

export const resetConfig = (): void => {
  setConfig(structuredClone(DEFAULT_CONFIG));
  persist();
  syncDayStart();
};

/** Keyboard shortcuts are a string map, so they get their own setter. */
export const setKeyboardShortcut = (action: string, binding: string | null): void => {
  setConfig('keyboard', action, binding && binding.length > 0 ? binding : null);
  persist();
};

export const exportConfig = (): string => JSON.stringify(config, null, 2);
