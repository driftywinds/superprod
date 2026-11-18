# Parity tracker

One row per user-facing feature, with the upstream source it implements. Status:
`Done`, `Partial`, `Todo`. Update this file whenever a feature lands.

Upstream reference: v20.0.0 at `original source code/`.
Behavior contracts: `docs/research/task-core-v20.md`,
`docs/research/upstream-features.md`, `docs/research/sync-contract.md`.

## Task core

| Feature | Status | Upstream | Particulars |
|---|---|---|---|
| Task model + field fidelity | Done | `features/tasks/task.model.ts`, `packages/plugin-api/src/types.ts` | Typed fields + unknown-field passthrough; `modified` stamp; legacy `priority` strings |
| `dueWithTime` / `dueDay` precedence | Done | `ARCHITECTURE-DECISIONS.md` #1 | `Task.scheduledDay`; mutually exclusive on write (detail pickers clear the other) |
| Logical day / day-start offset | Done | `core/date/date.service.ts`, `util/start-of-next-day.util.ts` | `DayCalendar`; invalid time resets to 0 (#7645) |
| Virtual `TODAY` tag | Done | `features/tag/tag.const.ts` | Stripped from `tagIds`; ordering only |
| Add task (add bar) | Done | `features/tasks/add-task-bar/**` | Enter submits, keeps focus |
| Short-syntax parsing | Done | `features/tasks/short-syntax.ts` | Tags, projects, estimates incl. `1h/2h`, dates/deadlines, priorities, URLs, ranges; 159 tests. Missing: `@every` recurrence, non-English/chrono shorthands |
| Complete / uncomplete | Done | `task-shared-crud.reducer.ts` | `doneOn`-only semantics; reopening clears it + `wontDoOn` |
| Delete + cascade | Done | `task-shared-crud.reducer.ts` | Memberships, parent ref, current-task pointer |
| Archive | Done | `task-shared-lifecycle.reducer.ts` | Moved to `archivedTasks`, out of every list |
| Duplicate | Done | task duplicate action | Copies task + subtasks with fresh ids, inserted after the source |
| Subtasks | Done | `task-shared-crud.reducer.ts` (`ADD SUBTASK`) | Add/complete/delete; inherit project; no project-list membership; depth 1 |
| Task detail | Done | `features/tasks/task-detail-panel/**` | Title, notes, schedule/deadline, estimate, tags, project, subtasks, duplicate/archive/delete |
| Checklists | Todo | `features/markdown-checklist/**` | Upstream renders markdown checklists in notes |
| Attachments | Partial | `task-attachment/**` | Stored + short-syntax URLs; no attachment UI |
| Reminders | Partial | `features/reminder/**` | Timestamp + Android notification (inexact alarms); offset defaults, no custom offset picker |
| Recurrence | Done | `task-repeat-cfg/**` | Engine (daily/weekly/monthly/yearly, every-N, weekday mask, Nth weekday, last day, until), presets, custom editor, completion + startup sweep |
| Recurrence edge settings | Partial | `task-repeat-cfg.model.ts` | `pause`, `skipOverdue`, `waitForCompletion`, `repeatFromCompletionDate` honored by the engine but not editable in the UI |
| Project move | Done | `handleUpdateTask` project branch | Rewrites lists + subtask `projectId` |
| Persistence | Done | upstream state persistence | Serialized JSON document, atomic writes, corrupt-file quarantine |

## Organisation and views

| Feature | Status | Upstream | Particulars |
|---|---|---|---|
| Drag reorder | Done | `moveItemAfterAnchor` | Project and Today lists, manual sort only |
| Search | Done | `features/search/**` | Per-view, case-insensitive |
| Sort | Done | view customizer | Manual / due / priority / created; view-only |
| Multi-select + batch | Done | task selection | Complete, delete, move to project |
| Today view | Done | `features/work-view/**` | Derived membership, TODAY ordering, completed-today |
| Inbox view | Done | `features/work-context/**` | Undone, top-level, no project |
| Project view | Partial | `features/work-view/**` | List + add; project settings/backlog UI pending |
| Filters / Smart Lists / view editor | Todo | `features/tasks/task-view-customizer/**` | M5 |
| Planner / week view | Todo | `features/planner/**` | Next milestone |
| Schedule / calendar | Todo | `features/schedule/**` | Next milestone |
| Boards | Todo | `features/boards/**` | Later |
| Sections | Todo | `features/section/**` | Later |

## Remaining

Time tracking, focus mode, counters, metrics, settings, themes, import/export,
issue providers, calendar integration, widgets, web, SuperSync.
