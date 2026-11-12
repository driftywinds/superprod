import { createEffect } from 'solid-js';
import { config } from '../state/config-store';
import { DEFAULT_ACCENT_COLOR } from '../domain/config';

/**
 * Applies the user's accent colour to the CSS custom properties the theme uses.
 *
 * Only the accent family changes; backgrounds and text stay pitch black, grey
 * and white. `--accent-soft` is derived from the accent so selection and
 * highlight states stay legible on black.
 */
export const applyAccentColor = (raw: string | undefined): void => {
  const accent = normalizeHex(raw) ?? DEFAULT_ACCENT_COLOR;
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-soft', hexToRgba(accent, 0.16));
  root.style.setProperty('--accent-dim', mix(accent, '#000000', 0.35));
};

const normalizeHex = (value: string | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [r, g, b] = [trimmed[1], trimmed[2], trimmed[3]] as [string, string, string];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const value = normalizeHex(hex) ?? DEFAULT_ACCENT_COLOR;
  return [
    parseInt(value.slice(1, 3), 16),
    parseInt(value.slice(3, 5), 16),
    parseInt(value.slice(5, 7), 16),
  ];
};

const hexToRgba = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const mix = (a: string, b: string, amount: number): string => {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const blend = (x: number, y: number) => Math.round(x + (y - x) * amount);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(blend(ar, br))}${toHex(blend(ag, bg))}${toHex(blend(ab, bb))}`;
};

/** Keep the document in sync with the setting for the app's lifetime. */
export const startAccentSync = (): void => {
  createEffect(() => applyAccentColor(config.ui.accentColor));
};
