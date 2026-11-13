import { For, Match, Show, Switch, createSignal, type JSX } from 'solid-js';
import { Icon } from './Icon';
import { AddTaskBar } from './AddTaskBar';
import { TaskRow } from './TaskRow';
import { TaskDetail } from './TaskDetail';
import { SettingsView } from './settings/SettingsView';
import { FocusOverlay, FocusStartButton } from './FocusOverlay';
import { ProjectionRow } from './ProjectionRow';
import { RepeatDiagnostics } from './RepeatDiagnostics';
import { PlannerView } from './views/PlannerView';
import { ScheduleView } from './views/ScheduleView';
import { MetricsView } from './views/MetricsView';
import { HistoryView } from './views/HistoryView';
import { SearchView } from './views/SearchView';
import { config } from '../state/config-store';
import {
  doneOnDay,
  doneTasks,
  overdueTasks,
  selectTask,
  selectedTask,
  setView,
  state,
  tasksForInbox,
  tasksForProject,
  tasksForTag,
  tasksForToday,
  upcomingRepeatsForProject,
  addProject,
  addTag,
  deleteProject,
  deleteTag,
  type ViewId,
} from '../state/store';
import { todayStr, type Task } from '../domain/models';

interface NavEntry {
  id: ViewId;
  label: string;
  icon: string;
}

// Boards and habits are parked until the task core is complete (see PARITY.md).
const PRIMARY_NAV: NavEntry[] = [
  { id: 'today', label: 'Today', icon: 'check' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'planner', label: 'Planner', icon: 'calendar' },
  { id: 'schedule', label: 'Schedule', icon: 'clock' },
];

const SECONDARY_NAV: NavEntry[] = [
  { id: 'history', label: 'History', icon: 'clock' },
  { id: 'metrics', label: 'Metrics', icon: 'chart' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const MOBILE_TABS: NavEntry[] = [
  PRIMARY_NAV[0]!,
  PRIMARY_NAV[1]!,
  PRIMARY_NAV[2]!,
  SECONDARY_NAV[1]!,
  SECONDARY_NAV[3]!,
];

/** Nav entries disappear when the feature is switched off in settings. */
const isNavEnabled = (item: NavEntry): boolean => {
  switch (item.id) {
    case 'planner':
      return config.appFeatures.isPlannerEnabled;
    case 'schedule':
      return config.appFeatures.isSchedulerEnabled;
    case 'boards':
      return config.appFeatures.isBoardsEnabled;
    case 'habits':
      return config.appFeatures.isHabitsEnabled;
    case 'search':
      return config.appFeatures.isSearchEnabled;
    default:
      return true;
  }
};

const taskCount = (view: ViewId): number => {
  if (view === 'today') return tasksForToday().length;
  if (view === 'inbox') return tasksForInbox().length;
  if (view.startsWith('project:')) return tasksForProject(view.slice(8)).length;
  if (view.startsWith('tag:')) return tasksForTag(view.slice(4)).length;
  return 0;
};

const EmptyState = (props: { title: string; hint: string }): JSX.Element => (
  <div class="empty">
    <div class="empty-title">{props.title}</div>
    <div>{props.hint}</div>
  </div>
);

const TaskListView = (props: {
  tasks: Task[];
  emptyTitle: string;
  emptyHint: string;
  /** Project (or INBOX) whose upcoming repeating tasks are listed below the tasks. */
  repeatsFor?: string;
}): JSX.Element => {
  const repeats = () => (props.repeatsFor ? upcomingRepeatsForProject(props.repeatsFor) : []);
  return (
    <>
      <Show
        when={props.tasks.length > 0 || repeats().length > 0}
        fallback={<EmptyState title={props.emptyTitle} hint={props.emptyHint} />}
      >
        <Show when={props.tasks.length > 0}>
          <div class="task-list">
            <For each={props.tasks}>{(task) => <TaskRow task={task} />}</For>
          </div>
        </Show>
        <Show when={repeats().length > 0}>
          <div class="section-head">Repeating</div>
          <div class="task-list">
            <For each={repeats()}>{(occurrence) => <ProjectionRow occurrence={occurrence} />}</For>
          </div>
        </Show>
      </Show>
      <Show when={props.repeatsFor}>
        <RepeatDiagnostics />
      </Show>
    </>
  );
};

const ViewRouter = (): JSX.Element => {
  const view = () => state.view;

  return (
    <Switch fallback={<SettingsView />}>
      <Match when={view() === 'today'}>
        <Show when={overdueTasks().length > 0}>
          <div class="section-head overdue">
            Overdue <span class="count">{overdueTasks().length}</span>
          </div>
          <div class="task-list">
            <For each={overdueTasks()}>{(task) => <TaskRow task={task} />}</For>
          </div>
          <div class="section-head">Today</div>
        </Show>
        <TaskListView
          tasks={tasksForToday()}
          emptyTitle="Nothing planned for today"
          emptyHint="Add a task, or use Plan on any task in Inbox."
        />
      </Match>
      <Match when={view() === 'inbox'}>
        <TaskListView
          tasks={tasksForInbox()}
          emptyTitle="Inbox is clear"
          emptyHint="Capture anything here; schedule it later."
          repeatsFor="INBOX"
        />
      </Match>
      <Match when={view().startsWith('project:')}>
        <TaskListView
          tasks={tasksForProject(view().slice(8))}
          emptyTitle="No open tasks"
          emptyHint="Add a task above to get started."
          repeatsFor={view().slice(8)}
        />
      </Match>
      <Match when={view().startsWith('tag:')}>
        <TaskListView
          tasks={tasksForTag(view().slice(4))}
          emptyTitle="No tasks with this tag"
          emptyHint="Add a task with #tag to see it here."
        />
      </Match>
      <Match when={view() === 'planner'}>
        <PlannerView />
      </Match>
      <Match when={view() === 'schedule'}>
        <ScheduleView />
      </Match>
      <Match when={view() === 'metrics'}>
        <MetricsView />
      </Match>
      <Match when={view() === 'history'}>
        <HistoryView />
      </Match>
      <Match when={view() === 'search'}>
        <SearchView />
      </Match>
    </Switch>
  );
};
const viewTitle = (): string => {
  const view = state.view;
  if (view.startsWith('project:')) return state.projects[view.slice(8)]?.title ?? 'Project';
  if (view.startsWith('tag:')) return `#${state.tags[view.slice(4)]?.title ?? 'tag'}`;
  const entry = [...PRIMARY_NAV, ...SECONDARY_NAV].find((item) => item.id === view);
  return entry?.label ?? 'superprod';
};

export const App = (): JSX.Element => {
  /** Today shows what was finished today; other lists show the latest finished tasks. */
  const completed = (): Task[] =>
    state.view === 'today'
      ? doneOnDay(todayStr())
      : doneTasks()
          .filter((task) => state.view !== 'inbox' || task.projectId === 'INBOX')
          .slice(0, 20);
  const doneCount = () => completed().length;
  const [navOpen, setNavOpen] = createSignal(false);

  /** Navigate and dismiss the mobile drawer (a no-op visually on desktop). */
  const go = (view: ViewId): void => {
    setNavOpen(false);
    setView(view);
  };

  return (
    <div class="app" classList={{ 'has-detail': !!selectedTask() }}>
      <Show when={navOpen()}>
        <button class="nav-backdrop" aria-label="Close menu" onClick={() => setNavOpen(false)} />
      </Show>
      <nav class="nav" classList={{ open: navOpen() }} aria-label="Main">
        <div class="brand">
          <img class="brand-logo" src="/logo-transparent.svg" alt="" width="18" height="18" />
          superprod
        </div>

        <For each={PRIMARY_NAV.filter(isNavEnabled)}>
          {(entry) => (
            <button
              class="nav-item"
              classList={{ active: state.view === entry.id }}
              onClick={() => go(entry.id)}
            >
              <Icon name={entry.icon} size={15} />
              {entry.label}
              <Show when={taskCount(entry.id) > 0}>
                <span class="count">{taskCount(entry.id)}</span>
              </Show>
            </button>
          )}
        </For>

        <div class="nav-section">
          Projects
          <button
            class="nav-add"
            aria-label="New project"
            title="New project"
            onClick={() => {
              const title = prompt('Project name');
              if (!title?.trim()) return;
              const project = addProject(title);
              go(`project:${project.id}`);
            }}
          >
            <Icon name="plus" size={13} />
          </button>
        </div>
        <For
          each={state.projectOrder
            .map((id) => state.projects[id])
            .filter(
              (project): project is NonNullable<typeof project> =>
                !!project && project.id !== 'INBOX',
            )}
        >
          {(project) => (
            <button
              class="nav-item"
              classList={{ active: state.view === `project:${project.id}` }}
              onClick={() => go(`project:${project.id}`)}
            >
              <span class="nav-dot" style={{ background: project.color ?? 'var(--text-faint)' }} />
              {project.title}
              <Show when={taskCount(`project:${project.id}`) > 0}>
                <span class="count">{taskCount(`project:${project.id}`)}</span>
              </Show>
              <Show when={project.id !== 'INBOX'}>
                <span
                  class="nav-del"
                  role="button"
                  aria-label={`Delete project ${project.title}`}
                  title="Delete project (tasks move to Inbox)"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (confirm(`Delete project "${project.title}"? Its tasks move to Inbox.`)) {
                      deleteProject(project.id);
                    }
                  }}
                >
                  <Icon name="close" size={12} />
                </span>
              </Show>
            </button>
          )}
        </For>

        <div class="nav-section">
          Tags
          <button
            class="nav-add"
            aria-label="New tag"
            title="New tag"
            onClick={() => {
              const title = prompt('Tag name');
              if (!title?.trim()) return;
              const tag = addTag(title);
              go(`tag:${tag.id}`);
            }}
          >
            <Icon name="plus" size={13} />
          </button>
        </div>
        <For
          each={state.tagOrder
            .map((id) => state.tags[id])
            .filter((tag): tag is NonNullable<typeof tag> => !!tag)}
        >
          {(tag) => (
            <button
              class="nav-item"
              classList={{ active: state.view === `tag:${tag.id}` }}
              onClick={() => go(`tag:${tag.id}`)}
            >
              <span class="nav-dot" style={{ background: tag.color ?? 'var(--text-faint)' }} />
              {tag.title}
              <span
                class="nav-del"
                role="button"
                aria-label={`Delete tag ${tag.title}`}
                title="Delete tag"
                onClick={(event) => {
                  event.stopPropagation();
                  if (confirm(`Delete tag "#${tag.title}"?`)) deleteTag(tag.id);
                }}
              >
                <Icon name="close" size={12} />
              </span>
            </button>
          )}
        </For>

        <div class="nav-section">Review</div>
        <For each={SECONDARY_NAV.filter(isNavEnabled)}>
          {(entry) => (
            <button
              class="nav-item"
              classList={{ active: state.view === entry.id }}
              onClick={() => go(entry.id)}
            >
              <Icon name={entry.icon} size={15} />
              {entry.label}
            </button>
          )}
        </For>
      </nav>

      <main class="main">
        <header class="topbar compact">
          <button
            class="icon-btn menu-btn"
            aria-label="Open menu"
            aria-expanded={navOpen()}
            onClick={() => setNavOpen(true)}
          >
            <Icon name="menu" size={26} />
          </button>
          <h1 class="title">{viewTitle()}</h1>
          <div class="spacer" />
          <Show when={config.appFeatures.isFocusModeEnabled}>
            <FocusStartButton />
          </Show>
          <button class="icon-btn" aria-label="Search" onClick={() => go('search')}>
            <Icon name="search" />
          </button>
        </header>

        <div class="content">
          <Show when={state.view === 'today' || state.view === 'inbox' || state.view.startsWith('project:') || state.view.startsWith('tag:')}>
            <AddTaskBar view={state.view} />
          </Show>

          <ViewRouter />

          <Show when={doneCount() > 0 && (state.view === 'today' || state.view === 'inbox')}>
            <div class="section-head">Completed ({doneCount()})</div>
            <div class="task-list">
              <For each={completed()}>
                {(task) => <TaskRow task={task} />}
              </For>
            </div>
          </Show>
        </div>
      </main>

      <Show when={selectedTask()}>
        <TaskDetail />
      </Show>

      <FocusOverlay />

      <div class="tabbar" role="tablist">
        <For each={MOBILE_TABS.filter(isNavEnabled)}>
          {(entry) => (
            <button
              class="tab"
              classList={{ active: state.view === entry.id }}
              onClick={() => {
                selectTask(null);
                setView(entry.id);
              }}
            >
              <Icon name={entry.icon} size={18} />
              {entry.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
};

