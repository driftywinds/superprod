import { For, Show, type JSX } from 'solid-js';
import { repeatConfigs, state } from '../state/store';
import { describeRepeat, nextOccurrenceDay } from '../domain/repeat';
import { todayStr } from '../domain/models';

/**
 * "Why is my repeating task not here?" — one line per repeat rule showing what
 * this client actually received from the server: which project the rule names,
 * whether that project exists here, the schedule, the next occurrence and where
 * its task instances ended up. Collapsed by default.
 */
export const RepeatDiagnostics = (props: { viewProjectId?: string }): JSX.Element => {
  const rows = () =>
    repeatConfigs().map((cfg) => {
      const instances = Object.values(state.tasks).filter((task) => task.repeatCfgId === cfg.id);
      const byProject = new Map<string, number>();
      for (const task of instances) {
        const name = state.projects[task.projectId]?.title ?? `(unknown ${task.projectId})`;
        byProject.set(name, (byProject.get(name) ?? 0) + 1);
      }
      const recent = [...instances]
        .sort((a, b) => b.created - a.created)
        .slice(0, 6)
        .map(
          (task) =>
            `${task.id.slice(-10)} · ${task.isDone ? 'done' : 'OPEN'} · proj=${task.projectId}` +
            `${task.parentId ? ' · SUBTASK' : ''} · due=${
              task.dueWithTime != null ? new Date(task.dueWithTime).toISOString().slice(0, 16) : (task.dueDay ?? '—')
            }`,
        );
      return {
        recent,
        cfgProjectRaw: cfg.projectId ?? '(none)',
        waitForCompletion: cfg.waitForCompletion === true,
        id: cfg.id,
        title: cfg.title?.trim() || '(no title)',
        project: cfg.projectId
          ? (state.projects[cfg.projectId]?.title ?? `NOT FOUND: ${cfg.projectId}`)
          : '(none → Inbox)',
        rule: describeRepeat(cfg),
        paused: cfg.isPaused === true,
        next: nextOccurrenceDay(cfg, todayStr(), { inclusive: true }) ?? 'none found',
        start: cfg.startDate ?? '—',
        instances: [...byProject.entries()].map(([name, n]) => `${name} ×${n}`).join(', ') || 'none',
      };
    });

  return (
    <Show when={rows().length > 0}>
      <details class="diag">
        <summary>Repeating tasks — what this app received ({rows().length})</summary>
        <div class="diag-row">
          This screen's project id: {props.viewProjectId ?? '—'} · open top-level tasks here:{' '}
          {Object.values(state.tasks).filter(
            (task) => !task.parentId && !task.isDone && task.projectId === props.viewProjectId,
          ).length}{' '}
          · projects named like this:{' '}
          {Object.values(state.projects)
            .filter((project) => project.title.toLowerCase() === (state.projects[props.viewProjectId ?? '']?.title ?? '').toLowerCase())
            .map((project) => project.id)
            .join(', ') || '—'}
        </div>
        <For each={rows()}>
          {(row) => (
            <div class="diag-row">
              <strong>{row.title}</strong>
              <div>Project in rule: {row.project}</div>
              <div>Schedule: {row.rule}{row.paused ? ' (paused)' : ''}</div>
              <div>Starts: {row.start} · Next: {row.next}</div>
              <div>Task instances: {row.instances}</div>
              <div>Rule project id: {row.cfgProjectRaw} · wait-for-completion: {String(row.waitForCompletion)}</div>
              <For each={row.recent}>{(line) => <div class="diag-line">{line}</div>}</For>
            </div>
          )}
        </For>
      </details>
    </Show>
  );
};
