import { parseShortSyntax, type ParsedToken } from './short-syntax';

/**
 * Text edits behind the add-task sheet's option buttons. The text box stays the
 * single source of truth: every button rewrites it, and every change to it is
 * re-read by the parser, so typing and tapping always agree.
 */

type Kind = ParsedToken['kind'];

const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim();

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Remove the first standalone occurrence of a recognised piece of text. */
export const removeToken = (input: string, token: ParsedToken): string =>
  tidy(input.replace(new RegExp(`(^|\\s)${escape(token.text)}(?=\\s|$)`, 'i'), ' '));

const removeKinds = (input: string, kinds: Kind[]): string => {
  let result = input;
  for (const token of parseShortSyntax(input, { enableDeadline: true }).tokens) {
    if (kinds.includes(token.kind)) result = removeToken(result, token);
  }
  return result;
};

const append = (input: string, text: string): string => tidy(`${input} ${text}`);

export const setPriority = (input: string, level: 1 | 2 | 3 | null): string => {
  const base = removeKinds(input, ['priority']);
  return level ? append(base, `p${level}`) : base;
};

export const setEstimate = (input: string, estimate: string | null): string => {
  const base = removeKinds(input, ['estimate']);
  return estimate ? append(base, estimate) : base;
};

/** `day` is words the parser reads: `today`, `tomorrow`, `friday`, `2026-12-24`. */
export const setDay = (input: string, day: string | null): string => {
  const base = removeKinds(input, ['day', 'relative']);
  return day ? append(base, day) : base;
};

/** `clock` is 24h `HH:MM` from a time input. */
export const setClock = (input: string, clock: string | null): string => {
  const base = removeKinds(input, ['clock', 'relative']);
  return clock ? append(base, clock) : base;
};

/** Replaces any date, time or relative offset with one relative offset. */
export const setRelative = (input: string, relative: string): string =>
  append(removeKinds(input, ['day', 'clock', 'relative']), relative);

export const clearWhen = (input: string): string => removeKinds(input, ['day', 'clock', 'relative']);

export const toggleTag = (input: string, tag: string): string => {
  const parsed = parseShortSyntax(input);
  const existing = parsed.tokens.find(
    (token) => token.kind === 'tag' && token.text.slice(1).toLowerCase() === tag.toLowerCase(),
  );
  return existing ? removeToken(input, existing) : append(input, `#${tag}`);
};

/** `projectText` is the title with spaces removed; null clears the project. */
export const setProject = (input: string, projectText: string | null): string => {
  const base = removeKinds(input, ['project']);
  return projectText ? append(base, `+${projectText}`) : base;
};

/** Tag and project titles can be typed after `#`/`+` only without spaces or markers. */
export const typable = (title: string): string | null => {
  const compact = title.replace(/\s+/g, '');
  return compact && !/[#+@!]/.test(compact) ? compact : null;
};
