import { createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { Icon } from './Icon';
import { AddTaskSheet } from './AddTaskSheet';
import { state, type ViewId } from '../state/store';

export interface AddTaskBarProps {
  view: ViewId;
}

/** Project a new task defaults into, based on the current view. */
const defaultProjectId = (view: ViewId): string | undefined => {
  if (view.startsWith('project:')) return view.slice('project:'.length);
  return undefined;
};

/**
 * The bar is a launcher: tapping it opens the add-task sheet, where the short
 * syntax can be typed or built with buttons. The placeholder lists examples in a
 * small font so the syntax is visible before anything is tapped.
 */
export const AddTaskBar = (props: AddTaskBarProps): JSX.Element => {
  const [open, setOpen] = createSignal(false);

  // The home-screen widget's "+" opens the app straight into the sheet.
  onMount(() => {
    const show = () => setOpen(true);
    window.addEventListener('superprod:add-task', show);
    onCleanup(() => window.removeEventListener('superprod:add-task', show));
  });

  return (
    <>
      <button type="button" class="add-bar" onClick={() => setOpen(true)} aria-label="Add a task">
        <Icon name="plus" size={16} class="add-icon" />
        <span class="add-bar-text">
          <span class="add-bar-main">Add a task…</span>
          <span class="add-bar-examples">
            #tag · +project · p1 · 1h · 16:00 · in 2m · 3 pm wednesday
          </span>
        </span>
      </button>
      <AddTaskSheet
        open={open()}
        initial=""
        defaultProjectId={defaultProjectId(props.view)}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

/** The project a view is scoped to, for headings. */
export const viewProject = (view: ViewId) => {
  if (!view.startsWith('project:')) return undefined;
  return state.projects[view.slice('project:'.length)];
};
