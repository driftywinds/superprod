import { createSignal } from 'solid-js';

/**
 * Developer diagnostics (the repeat-series panel inside project views).
 * Off by default; Settings -> Debug turns it on. Stored on this device only.
 */
const KEY = 'superprod.debugInfo';

const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

const [enabled, setEnabled] = createSignal(read());

export const debugInfoEnabled = enabled;

export const setDebugInfo = (on: boolean): void => {
  setEnabled(on);
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Private mode: the flag then lasts until reload, which is fine.
  }
};
