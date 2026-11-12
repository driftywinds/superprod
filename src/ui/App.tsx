import { For, Show, type JSX } from 'solid-js';
import { Icon } from './Icon';
import { AddTaskBar } from './AddTaskBar';
import { TaskRow, formatDuration } from './TaskRow';
import { TaskDetail } from './TaskDetail';
import { SettingsView } from './settings/SettingsView';
import { config } from '../state/config-store';
import {
  doneTasks,
  rootTasks,
  selectTask,
  selectedTask,
  setView,
  state,
  tasksForInbox,
  tasksForProject,
  tasksForTag,
  tasksForToday,
  todayTotalMs,
  addProject,
  addTag,
  deleteProject,
  deleteTag,
  type ViewId,
} from '../state/store';
import type { Task } from '../domain/models';

interface NavEntry {
  id: ViewId;
  label: string;
  icon: string;
}

const PRIMARY_NAV: NavEntry[] = [
  { id: 'today', label: 'Today', icon: 'check' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'planner', label: 'Planner', icon: 'calendar' },
  { id: 'schedule', label: 'Schedule', icon: 'clock' },
  { id: 'boards', label: 'Boards', icon: 'board' },
  { id: 'habits', label: 'Habits', icon: 'sparkle' },
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

/** Not-yet-built views say exactly what will live there and where it's tracked. */
const Placeholder = (props: {
  title: string;
  features: string[];
  reference: string;
}): JSX.Element => (
  <div class="placeholder">
    <h3>{props.title}</h3>
    <p style={{ margin: 0 }}>
      Not built yet. This screen is tracked in <code>{props.reference}</code> and will contain:
    </p>
    <ul>
      <For each={props.features}>{(feature) => <li>{feature}</li>}</For>
    </ul>
  </div>
);

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
}): JSX.Element => (
  <Show
    when={props.tasks.length > 0}
    fallback={<EmptyState title={props.emptyTitle} hint={props.emptyHint} />}
  >
    <div class="task-list">
      <For each={props.tasks}>{(task) => <TaskRow task={task} />}</For>
    </div>
  </Show>
);

const ViewRouter = (): JSX.Element => {
  const view = () => state.view;

  return (
    <Show
      when={view() === 'today'}
      fallback={
        <Show
          when={view() === 'inbox'}
          fallback={
            <Show
              when={view().startsWith('project:')}
              fallback={
                <Show
                  when={view().startsWith('tag:')}
                  fallback={
                    <Show
                      when={view() === 'planner'}
                      fallback={
                        <Show
                          when={view() === 'schedule'}
                          fallback={
                            <Show
                              when={view() === 'boards'}
                              fallback={
                                <Show
                                  when={view() === 'habits'}
                                  fallback={
                                    <Show
                                      when={view() === 'history'}
                                      fallback={
                                        <Show
                                          when={view() === 'metrics'}
                                          fallback={
                                            <Show
                                              when={view() === 'search'}
                                              fallback={
                                                <SettingsView />

                                              }
                                            >
                                              <Placeholder
                                                title="Search"
                                                features={[
                                                  'Full-text search across title, notes, project, tags and issue id',
                                                  'Searches open tasks by default; toggle to include completed and archived',
                                                  'Recently deleted tasks (last 30 days), marked Deleted, restorable',
                                                ]}
                                                reference="PARITY.md §27"
                                              />
                                            </Show>
                                          }
                                        >
                                          <Placeholder
                                            title="Metrics"
                                            features={[
                                              'DailyMetric aggregation over a selectable range',
                                              'Charts: time spent, tasks completed, break time (lazy-loaded)',
                                              'Per-project and all-tasks comparison',
                                              'Activity heatmap, evaluation sheet, impact stars',
                                              'Explicitly no productivity score — upstream has none',
                                            ]}
                                            reference="PARITY.md §5"
                                          />
                                        </Show>
                                      }
                                    >
                                      <Placeholder
                                        title="History"
                                        features={[
                                          'Worklog generated from timeSpentOnDay',
                                          'Per-day and per-month time aggregation',
                                          'History export',
                                        ]}
                                        reference="PARITY.md §2 / §11"
                                      />
                                    </Show>
                                  }
                                >
                                  <Placeholder
                                    title="Habits"
                                    features={[
                                      'SimpleCounter types: ClickCounter, StopWatch, RepeatedCountdownReminder',
                                      'Daily counts, streaks (specific-days or weekly-frequency)',
                                    ]}
                                    reference="PARITY.md §6"
                                  />
                                </Show>
                              }
                            >
                              <Placeholder
                                title="Boards"
                                features={[
                                  'Configurable panels with filters (tags, completion, scheduling, project)',
                                  'Drag between panels updates the task to match the target panel',
                                  'Multiple boards over the same tasks, per-panel ordering',
                                  'Default boards: Eisenhower Matrix, Kanban',
                                ]}
                                reference="PARITY.md §17"
                              />
                            </Show>
                          }
                        >
                          <Placeholder
                            title="Schedule"
                            features={[
                              'Day timeline with work start/end and lunch break',
                              'Tasks placed by time estimate, drag to reschedule',
                              'Reminders on scheduled tasks',
                            ]}
                            reference="PARITY.md §7"
                          />
                        </Show>
                      }
                    >
                      <Placeholder
                        title="Planner"
                        features={[
                          'Week view across projects',
                          'Drag tasks from backlog onto days',
                          'Day-level planning with estimates',
                        ]}
                        reference="PARITY.md §7"
                      />
                    </Show>
                  }
                >
                  <TaskListView
                    tasks={tasksForTag(view().slice(4))}
                    emptyTitle="No tasks with this tag"
                    emptyHint="Add a task with #tag to see it here."
                  />
                </Show>
              }
            >
              <TaskListView
                tasks={tasksForProject(view().slice(8))}
                emptyTitle="No open tasks"
                emptyHint="Add a task above to get started."
              />
            </Show>
          }
        >
          <TaskListView
            tasks={tasksForInbox()}
            emptyTitle="Inbox is clear"
            emptyHint="Capture anything here; schedule it later."
          />
        </Show>
      }
    >
      <TaskListView
        tasks={tasksForToday()}
        emptyTitle="Nothing scheduled for today"
        emptyHint="Add a task with @today, or press the Today button on any task."
      />
    </Show>
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
  const doneCount = () => doneTasks().length;

  return (
    <div class="app" classList={{ 'has-detail': !!selectedTask() }}>
      <nav class="nav" aria-label="Main">
        <div class="brand">
          <img class="brand-logo" src="/logo-transparent.svg" alt="" width="18" height="18" />
          superprod
        </div>

        <For each={PRIMARY_NAV.filter(isNavEnabled)}>
          {(entry) => (
            <button
              class="nav-item"
              classList={{ active: state.view === entry.id }}
              onClick={() => setView(entry.id)}
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
              setView(`project:${project.id}`);
            }}
          >
            <Icon name="plus" size={13} />
          </button>
        </div>
        <For
          each={state.projectOrder
            .map((id) => state.projects[id])
            .filter((project): project is NonNullable<typeof project> => !!project)}
        >
          {(project) => (
            <button
              class="nav-item"
              classList={{ active: state.view === `project:${project.id}` }}
              onClick={() => setView(`project:${project.id}`)}
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
              setView(`tag:${tag.id}`);
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
              onClick={() => setView(`tag:${tag.id}`)}
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
              onClick={() => setView(entry.id)}
            >
              <Icon name={entry.icon} size={15} />
              {entry.label}
            </button>
          )}
        </For>
      </nav>

      <main class="main">
        <header class="topbar">
          <div>
            <h1 class="title">{viewTitle()}</h1>
            <p class="subtitle">
              {formatDuration(todayTotalMs())} tracked today
              <Show when={doneCount() > 0}> · {doneCount()} done</Show>
              <Show when={rootTasks().length > 0}> · {rootTasks().length} tasks</Show>
            </p>
          </div>
          <div class="spacer" />
          <button
            class="icon-btn"
            aria-label="Search"
            onClick={() => setView('search')}
          >
            <Icon name="search" />
          </button>
          <button
            class="icon-btn"
            aria-label="Settings"
            onClick={() => setView('settings')}
          >
            <Icon name="settings" />
          </button>
        </header>

        <div class="content">
          <Show when={state.view === 'today' || state.view === 'inbox' || state.view.startsWith('project:') || state.view.startsWith('tag:')}>
            <AddTaskBar view={state.view} />
          </Show>

          <ViewRouter />

          <Show when={doneCount() > 0 && (state.view === 'today' || state.view === 'inbox')}>
            <div class="nav-section" style={{ 'margin-top': '24px' }}>
              Completed ({doneCount()})
            </div>
            <div class="task-list">
              <For each={doneTasks().slice(0, 20)}>
                {(task) => <TaskRow task={task} />}
              </For>
            </div>
          </Show>
        </div>
      </main>

      <Show when={selectedTask()}>
        <TaskDetail />
      </Show>

      <div class="tabbar" role="tablist">
        <For each={MOBILE_TABS}>
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

