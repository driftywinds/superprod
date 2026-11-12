import { createSignal, type JSX } from 'solid-js';
import { Icon } from './Icon';
import { addTask, state, type ViewId } from '../state/store';

export interface AddTaskBarProps {
  view: ViewId;
}

/** Project a new task defaults into, based on the current view. */
const defaultProjectId = (view: ViewId): string | undefined => {
  if (view.startsWith('project:')) return view.slice('project:'.length);
  return undefined;
};

export const AddTaskBar = (props: AddTaskBarProps): JSX.Element => {
  const [value, setValue] = createSignal('');
  let inputRef: HTMLInputElement | undefined;

  const submit = () => {
    const title = value().trim();
    if (!title) return;
    addTask({ title, projectId: defaultProjectId(props.view) });
    setValue('');
    inputRef?.focus();
  };

  return (
    <form
      class="add-bar"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Icon name="plus" size={16} class="add-icon" />
      <input
        ref={inputRef}
        value={value()}
        placeholder="Add a task…  #tag  +project  1h  @tomorrow  p1"
        aria-label="New task title"
        onInput={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setValue('');
        }}
      />
      <span class="kbd-hint">↵</span>
    </form>
  );
};

/** The project a view is scoped to, for headings. */
export const viewProject = (view: ViewId) => {
  if (!view.startsWith('project:')) return undefined;
  return state.projects[view.slice('project:'.length)];
};
