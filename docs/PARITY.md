# Parity tracker

One row per user-facing feature, with the upstream source it implements. Status:
`Done`, `Partial`, `Todo`. Update this file whenever a feature lands.

Upstream reference: v20.0.0 at `original source code/`.
Detailed behavior contract: `docs/research/task-core-v20.md`,
`docs/research/upstream-features.md`, `docs/research/sync-contract.md`.

## Task core

| Feature | Status | Upstream | Particulars |
|---|---|---|---|
| Task model + field fidelity | Done | `features/tasks/task.model.ts`, `packages/plugin-api/src/types.ts` | 28 typed fields + unknown-field passthrough; `modified` stamp; `priority` keeps legacy string encodings |
| `dueWithTime` / `dueDay` precedence | Done | `ARCHITECTURE-DECISIONS.md` #1 | `Task.scheduledDay`; mutually exclusive on write |
| Logical day / day-start offset | Done | `core/date/date.service.ts`, `util/start-of-next-day.util.ts` | `DayCalendar`, invalid time resets to 0 (#7645 rule) |
| Virtual `TODAY` tag | Done | `features/tag/tag.const.ts` | stripped from `tagIds` on read; ordering lives on `TODAY.taskIds` |
| Add task (add bar) | Done | `features/tasks/add-task-bar/**` | Text capture, submits on Enter, keeps focus |
| Short-syntax parsing | Done | `features/tasks/short-syntax.ts` | Tags, projects, estimates (incl. `1h/2h`), due/deadline dates, priorities, URLs, ranges; 159 tests. Not yet: `@every` recurrence, non-English/chrono shorthands (`docs/research` risk) |
| Complete / uncomplete | Done | `task-shared-crud.reducer.ts` (`updateDoneOnForTask`) | Only `doneOn` is written; reopening clears it and `wontDoOn` |
| Delete task + subtask cascade | Done | `task-shared-crud.reducer.ts` (`handleDeleteTask`) | Removes project/tag memberships, parent reference, clears current task |
| Project move | Done | `handleUpdateTask` project branch | Rewrites both project lists and subtask `projectId` (backlog placement on same-project moves is simplified) |
| Today list + ordering | Done | `task.selectors.ts`, `computeOrderedTaskIdsForToday` | Derived from schedule, ordered by `TODAY.taskIds` then creation |
| Done-today list | Done | `task.selectors.ts` | `doneOn` on the logical day |
| Inbox list | Done | `work-context` selectors | Undone, top-level, no project |
| Projects: create + list | Partial | `features/project/**` | Create, list, open, add tasks; rename/archive/theme/backlog UI pending |
| Tags: create via short syntax | Partial | `features/tag/**` | Auto-create on capture + membership; management UI pending |
| Persistence | Done | upstream state persistence | Single JSON document, atomic write, corrupt-file quarantine |
| Undo | Todo | op-log / restore | M3 |
| Ordering / drag & drop | Todo | `moveItemAfterAnchor` | M3 |

## Views

| Feature | Status | Upstream |
|---|---|---|
| Today view | Done | `features/work-view/**` |
| Inbox view | Done | `features/work-context/**` |
| Project view | Partial | `features/work-view/**` |
| Planner / week view | Todo | `features/planner/**` |
| Schedule / calendar | Todo | `features/schedule/**` |
| Boards | Todo | `features/boards/**` |
| Search | Todo | `features/search/**` |

## Remaining parity

Not started: task detail panel, subtasks UI, checklists, notes, attachments UI,
recurrence, reminders, time tracking, focus mode, counters, metrics, settings,
themes, import/export, integrations, widgets, web, SuperSync.
