import { describe, expect, it } from 'vitest';
import {
  appendChecklistItem,
  checklistProgress,
  parseChecklist,
  toggleChecklistLine,
} from '../src/domain/checklist';

const NOTES = 'Intro\n- [ ] milk\n- [x] eggs\n* [X] bread\nplain - [ ] not an item\n  - [ ] nested';

describe('checklist', () => {
  it('finds items and their state, ignoring prose', () => {
    expect(parseChecklist(NOTES).map((i) => [i.line, i.text, i.checked])).toEqual([
      [1, 'milk', false],
      [2, 'eggs', true],
      [3, 'bread', true],
      [5, 'nested', false],
    ]);
  });

  it('counts progress', () => {
    expect(checklistProgress(NOTES)).toEqual({ done: 2, total: 4 });
    expect(checklistProgress(undefined)).toEqual({ done: 0, total: 0 });
  });

  it('toggles exactly one line', () => {
    const next = toggleChecklistLine(NOTES, 1);
    expect(next.split('\n')[1]).toBe('- [x] milk');
    expect(toggleChecklistLine(next, 1)).toBe(NOTES);
    expect(toggleChecklistLine(NOTES, 0)).toBe(NOTES);
  });

  it('appends an unchecked item', () => {
    expect(appendChecklistItem('', 'a')).toBe('- [ ] a\n');
    expect(appendChecklistItem('x\n', 'b')).toBe('x\n- [ ] b\n');
    expect(appendChecklistItem('x', '  ')).toBe('x');
  });
});
