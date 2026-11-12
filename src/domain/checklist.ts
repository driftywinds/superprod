/**
 * Markdown checklists inside task notes (`- [ ] item` / `- [x] item`).
 *
 * Notes stay plain markdown, so a checklist edited here reads correctly in
 * every other Super Productivity client.
 */

export interface ChecklistItem {
  /** Zero-based index of the line within the notes. */
  line: number;
  text: string;
  checked: boolean;
}

const ITEM = /^(\s*[-*+]\s+)\[([ xX])\]\s?(.*)$/;

export const parseChecklist = (notes: string | undefined | null): ChecklistItem[] =>
  (notes ?? '').split('\n').flatMap((raw, line) => {
    const match = ITEM.exec(raw);
    return match ? [{ line, text: match[3] ?? '', checked: match[2] !== ' ' }] : [];
  });

export const checklistProgress = (
  notes: string | undefined | null,
): { done: number; total: number } => {
  const items = parseChecklist(notes);
  return { done: items.filter((item) => item.checked).length, total: items.length };
};

/** Flip one item and return the new notes; other lines are untouched. */
export const toggleChecklistLine = (notes: string, line: number): string => {
  const lines = notes.split('\n');
  const match = ITEM.exec(lines[line] ?? '');
  if (!match) return notes;
  lines[line] = `${match[1]}[${match[2] === ' ' ? 'x' : ' '}] ${match[3]}`;
  return lines.join('\n');
};

/** Append a new unchecked item, keeping existing text and a trailing newline. */
export const appendChecklistItem = (notes: string | undefined | null, text: string): string => {
  const clean = text.trim();
  if (!clean) return notes ?? '';
  const base = (notes ?? '').replace(/\s+$/, '');
  return `${base}${base ? '\n' : ''}- [ ] ${clean}\n`;
};
