import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import { TaskRow } from '../TaskRow';
import { state } from '../../state/store';
import type { Task } from '../../domain/models';

/**
 * Search — full-text over titles and notes, with project and tag names matched.
 *
 * `config.misc.isSearchIncludeArchived` is honoured once archived tasks are
 * modelled; until then completed tasks are optional.
 */
export const SearchView = (): JSX.Element => {
  const [query, setQuery] = createSignal('');
  const [scope, setScope] = createSignal<'open' | 'all'>('open');

  const results = createMemo<Task[]>(() => {
    const term = query().trim().toLowerCase();
    if (term.length === 0) return [];

    const projectTitle = (id: string): string => state.projects[id]?.title.toLowerCase() ?? '';
    const tagTitles = (ids: string[]): string =>
      ids
        .map((id) => state.tags[id]?.title.toLowerCase() ?? '')
        .join(' ');

    return Object.values(state.tasks)
      .filter((task) => (scope() === 'all' ? true : !task.isDone))
      .filter((task) => {
        const haystack = [
          task.title,
          task.notes ?? '',
          projectTitle(task.projectId),
          tagTitles(task.tagIds),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      })
      .sort((a, b) => b.created - a.created)
      .slice(0, 100);
  });

  return (
    <div class="search">
      <input
        class="input search-input"
        type="search"
        autofocus
        placeholder="Search tasks, notes, projects and tags…"
        value={query()}
        onInput={(event) => setQuery(event.currentTarget.value)}
      />

      <div class="metrics-range">
        <button
          class="chip"
          classList={{ active: scope() === 'open' }}
          onClick={() => setScope('open')}
        >
          Open tasks
        </button>
        <button
          class="chip"
          classList={{ active: scope() === 'all' }}
          onClick={() => setScope('all')}
        >
          Everything
        </button>
      </div>

      <Show when={query().trim().length > 0}>
        <p class="planner-hint">
          {results().length} result{results().length === 1 ? '' : 's'}
        </p>
      </Show>

      <Show
        when={results().length > 0}
        fallback={
          <Show when={query().trim().length > 0}>
            <div class="empty">
              <div class="empty-title">No matches</div>
              <div>Nothing contains “{query()}”.</div>
            </div>
          </Show>
        }
      >
        <div class="task-list">
          <For each={results()}>{(task) => <TaskRow task={task} />}</For>
        </div>
      </Show>
    </div>
  );
};
