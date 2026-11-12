# FEATURES.md — Super Productivity Feature Inventory

> This document is the authoritative exhaustive inventory of **Super Productivity's** features — the parity target for **superprod**, an independent Android client that syncs with SuperSync. Every capability the platform exposes is enumerated below, organized by subsystem. Nothing is summarized away. This feeds `PARITY.md` — every item below must eventually be crossed off there.

---

## 1. Core Task Model

### 1.1 Task fields

Verified against `src/app/features/tasks/task.model.ts` (`TaskCopy` = plugin-api `Task` + `IssueFieldsForTask` + app extras) and `packages/plugin-api/src/types.ts`.

Core:

- **id** — string, stable across sync
- **title** — string, required
- **notes** — markdown/richtext body, optional
- **projectId** — FK to exactly one project (required on `TaskCopy`)
- **tagIds** — string[] of tag IDs
- **subTaskIds** — string[] of child task IDs (recursive nesting)
- **parentId** — FK back to parent task when this is a subtask
- **created** — creation timestamp (ms)
- **updated**, **modified** — last-updated timestamps (both exist; `modified` is the app-side one)
- **isDone** — completion boolean
- **doneOn** — timestamp of the current completion (cleared on reopen)
- **wontDoOn** — timestamps a "won't do" finish; only counts while it equals `doneOn` and `isDone` is true
- **timeEstimate** — number, ms
- **timeSpent** — number, ms, aggregate
- **timeSpentOnDay** — `Record<dayStr, ms>` per-day bucket (drives all time reports)

Scheduling:

- **dueDay** — `YYYY-MM-DD`, all-day scheduled
- **dueWithTime** — epoch ms, timed scheduled. **Mutually exclusive with `dueDay`; readers check `dueWithTime` first**
- **hasPlannedTime** — boolean marker used by planning UI
- **deadlineDay** — `YYYY-MM-DD` hard deadline
- **deadlineWithTime** — epoch ms hard deadline (mutually exclusive with `deadlineDay`)
- **deadlineRemindAt** — epoch ms reminder for the deadline
- **remindAt** — epoch ms task reminder
- **reminderId** — FK to the reminder entity
- **repeatCfgId** — FK to a `TASK_REPEAT_CFG`

Other:

- **attachments** — `TaskAttachment[]` (type, path, title, id, icon)
- **priority** — `1 | 2 | 3` (Low/Medium/High); legacy string encodings `'low'|'medium'|'high'` still read, `null`/`undefined` = no priority
- **issueId**, **issueProviderId**, **issueType**, **issueWasUpdated**, **issueLastUpdated**, **issueAttachmentNr**, **issueTimeTracked**, **issuePoints**, **issueLastSyncedValues** — issue-link fields
- **_hideSubTasksMode** — UI state, `HideSubTasksMode.HideDone (1)` / `HideAll (2)`

Task container state (`TaskState`, not part of a task): `currentTaskId`, `selectedTaskId`, `taskDetailTargetPanel`, `lastCurrentTaskId`, `isDataLoaded`, `dismissedCalendarAutoImportEventIdsByProvider`.

Related enums: `HideSubTasksMode`, `TaskDetailTargetPanel` (Default/Attachments/Notes/DONT_OPEN_PANEL), `TaskReminderOptionId` (`DoNotRemind`, `AtStart`, `m5`, `m10`, `m15`, `m30`, `h1`, `d1`, `d3`, `w1`), `TaskPriority`, `DropListModelSource` (UNDONE/DONE/BACKLOG/ADD_TASK_PANEL/OVERDUE/LATER_TODAY).

### 1.2 Subtasks

- Recursive nested subtasks (any depth)
- Subtasks have the same full task model (title, notes, estimates, time tracking, due dates, tags, etc.)
- Collapse/expand subtask trees in the UI
- Bulk complete / bulk delete subtasks
- Subtask count visible on parent
- Drag-and-drop reordering of subtasks
- "Add subtask" inline in the task detail panel and in the list view

### 1.3 Task list / list behaviors

- Multiple list views: Inbox, Today, Scheduled, Planner, Board, Tag, Project, Calendar, Worklog, History, Metric, Habit
- Drag-and-drop reordering of tasks within a list
- Drag a task onto another to make it a subtask
- Multi-select with bulk operations (complete, delete, move to project, add tag, set priority, set time estimate)
- Context menu on each task row with all available actions
- Right-click / long-press context menu on mobile
- Keyboard navigation between task rows
- Filtering by: project, tag, context, due date range, completion status, priority, search text, issue association, time estimate range, time spent range
- Sorting by: due date, creation date, modification date, priority, time estimate, time spent, alphabetically, project, tag
- Search across all task fields (title, notes, project, tags, issue id)
- Global search page with full-text results
- "Today" virtual tag — auto-computed from due dates, planned tasks, and manual "Today" assignments
- Task count badges on view headers

### 1.4 Short syntax / quick add

- Type a task title with embedded metadata using short syntax:
  - `#projectname` — assign to project
  - `@tag` — assign tag
  - `p:1` / `p:2` etc. — set priority
  - `t:1:30` — set time estimate
  - `d:2025-01-15` — set due date
  - `!deadline` — set deadline
  - `r:daily` / `r:weekly` / `r:monthly` / custom recurrence — set recurrence
  - `c:10` — set context
  - `i:issue-id` — link issue
- Short syntax parsed on task creation and on inline edit
- Quick-add input with placeholder showing available short-syntax hints
- Add task via keyboard shortcut (global hotkey)
- Add task via system-wide quick capture (mobile sharesheet, desktop global shortcut, browser share target)

### 1.5 Task detail panel

- Slide-out/detail panel showing all task fields editable
- Edit title inline
- Edit notes (markdown editor)
- Edit project, tags, priority, estimate, due date, deadline, recurrence, context, issue link
- Time tracking controls (start/stop/record)
- Subtask list with inline add/reorder/complete/delete
- attachments list with add/remove/download
- Issue link display + open external issue
- Completion button with repeat-handling logic
- Activity / change history for the task

### 1.6 Task completion & repeating

- Mark task done (checkbox click, keyboard shortcut, swipe on mobile)
- Unmark / undo completion
- On completion: option to reopen, archive, or delete
- Repeating tasks:
  - Daily, weekly, monthly, yearly recurrence presets
  - Custom recurrence with specific day-of-week, day-of-month, interval
  - "Repeat from completion date" vs "Repeat from original schedule"
  - Repeat configure dialog with preview of next occurrences
  - When a repeating task is completed, the next instance is auto-created per the recurrence rule
  - Repeating tasks carry a repeatCfgId linking to the recurrence definition
- Recurrence configuration model: type (daily/weekly/monthly/yearly/custom), interval, dayOfWeek, dayOfMonth, endAfterN, endByDate, repeatFromCompletion bool

### 1.7 Task archiving

- Archive completed tasks (manual or automatic on completion depending on config)
- Archived tasks hidden from main views but accessible via Archive view
- Unarchive / restore archived tasks
- Bulk archive completed tasks
- Archive auto-cleanup: auto-archive after N days completed (configurable)
- Archived tasks still sync, still searchable

### 1.8 Task notes (markdown)

- Notes stored as markdown per task
- Markdown editor with preview
- Supports checklist items inside notes (markdown checklist)
- Notes sync as part of the task payload

### 1.9 Markdown checklist inside notes

- Checkable list items (`- [ ]`, `- [x]`) inside task notes
- Check/uncheck items inline
- Checklist progress indicator
- Checkbox state persists as part of notes markdown

### 1.10 Attachments

- Attach files to a task (from device storage)
- List attachments in task detail
- Open/download attachment
- Remove attachment
- Attachment metadata: name, size, type, local path

### 1.11 Plain notes / note view (standalone notes)

- Standalone notes separate from tasks (note model: id, title, content, created, modified)
- Notes list view
- Create / edit / delete notes
- Markdown content in notes
- Notes sync as their own entity type

### 1.12 Work context

- Define work contexts (e.g. "Home", "Office", "Errands")
- Assign a context to a task
- Filter tasks by context
- Context model: id, title, color, icon
- Contexts sync as their own entity type

### 1.13 Projects

- Create / rename / delete projects
- Project model: id, title, color, icon, description, parentProjectId (hierarchical projects)
- Project list view
- Assign tasks to a project
- Project completion tracking (tasks done / total)
- Project color and icon used in task rows and filters
- Hierarchical projects (sub-projects)

### 1.14 Tags

- Create / rename / delete tags
- Tag model: id, title, color
- Tag list view (tag view)
- Assign tags to tasks (multiple tags per task)
- Filter by tag
- Tag colors in task rows
- Virtual "Today" tag (auto-computed, not a real tag)
- Ordinal priority tags (priority expressed via tag ordering in some views)
- Tag view shows all tasks with that tag

### 1.15 Sections / boards / planner / schedule views

- **Inbox view** — all unassigned / un-scheduled tasks
- **Today view** — tasks due today, planned today, or tagged "Today"
- **Scheduled view** — tasks with a scheduled/planned time
- **Planner view** — day/week planning grid; drag tasks onto time slots; timeline
- **Schedule view** — timeline of scheduled tasks for a day/week
- **Board view** — Kanban-style columns (e.g. by status, by project)
- **Project view** — tasks grouped by project
- **Tag view** — tasks grouped by tag
- **Calendar view** — day/week/month calendar with due dates and scheduled tasks
- **History view** — past completed tasks with time spent
- **Worklog view** — time-log entries (started, ended, taskId, timeSpent)
- Drag-and-drop between views (e.g. drag task from inbox to a project, or onto a schedule slot)
- Drag to reschedule (change plannedAt/dueDay)

---

## 2. Time Tracking

### 2.1 Manual time tracking

- Start / stop / pause tracking on a task
- Track time against a task directly (task-level timeSpent)
- Track time against a work context (context-level timeSpent)
- Edit / adjust logged time manually
- Time spent displayed on task rows and in task detail
- Daily time spent aggregation (timeSpentOnDay map)
- Per-task time spent history

### 2.2 Tracking semantics

- Only one task can be "currently tracked" at a time (current task)
- Starting tracking on a new task stops tracking on the previous one
- Tracking tick interval (e.g. every few seconds or per-minute accumulation)
- Idle time is excluded from tracked time if idle detection is on
- Time is accumulated into timeSpent and timeSpentOnDay
- Tracking state persists across app restarts (resume on start if configured)

### 2.3 Timer display

- Timer bar / timer section showing current tracked task and elapsed time
- Timer elapsed display (HH:MM:SS)
- Start / stop / switch buttons
- Stop tracking on task completion

### 2.4 Break tracking within time tracking

- Break time tracked separately
- Break time subtracted or reported separately from productive time
- Break tracking integrated with focus mode and take-a-break features

### 2.5 Time estimates

- Set time estimate on a task (e.g. "1h 30m" or minutes)
- Display estimate vs time spent comparison
- Estimate used in metrics and planner views
- Estimate visible in task row, task detail, planner

### 2.6 Time log / worklog

- Worklog entry: started timestamp, ended timestamp, timeSpent, taskId, projectId, contextId
- Worklog list view
- Filter / sort worklog by date, task, project
- Export worklog (CSV, JSON, or similar)
- Worklog aggregated in daily summary and metrics

### 2.7 History view

- History of completed tasks with time spent
- Filter by date range, project, tag
- Time aggregation totals per day / per project / per tag

### 2.8 How time is logged (aggregation model)

- timeSpent is a running total on the task
- timeSpentOnDay is a per-day breakdown
- Worklog entries are separate persisted records
- Daily summary aggregates: total time spent, task count, break time, focus session time

---

## 3. Focus Mode & Pomodoro

### 3.1 Focus mode modes

- **Pomodoro** — fixed work interval (default 25 min) followed by short break, with long break after N cycles
- **Flowtime** — work until you decide to stop; break is proportional or manual; no fixed intervals
- **Countdown** — a single timed work session of arbitrary length with a break after

### 3.2 Focus session states / screens

Verified enums in `focus-mode.model.ts`:

- `FocusModeMode`: `Flowtime`, `Pomodoro`, `Countdown`
- `FocusScreen`: `Main`, `SessionDone`, `Break`
- `FocusMainUIState`: `Preparation`, `Countdown`, `InProgress`
- `TimerState`: `isRunning`, `startedAt`, `elapsed`, `duration`, `purpose: 'work' | 'break' | null`, `isLongBreak?`
- UI also has a task-select step, a preparation countdown (opt-in via `isShowPreparation`, otherwise a brief inline rocket animation), and the full-screen focus overlay.

**Focus state is not persisted** — the cycle resets on app restart.

### 3.3 Focus mode configuration (real fields)

`FocusModeConfig`:

- `isShowPreparation?` — opt into the full-screen "Get ready" countdown (default off)
- `focusModeSound?` — `'off' | 'tick' | 'whiteNoise'`
- `focusModeSoundVolume?` — percent of the master volume (default 40)
- `isPauseTrackingDuringBreak` — default `true`
- `autoStartFocusOnPlay?` — pressing play on a task also starts a quiet, indicator-only focus session
- `isManualBreakStart` — Pomodoro overtime: keep the work timer running until ended manually
- Deprecated but still read for old synced data: `isSkipPreparation`, `isPlayTick`, `isStartInBackground`

`PomodoroConfig`: `duration` (25 min), `breakDuration` (5 min), `longerBreakDuration` (15 min), `cyclesBeforeLongerBreak` (4)

`FlowtimeConfig`: `isBreakEnabled` (false), `breakMode` (`'ratio'` | `'rule'`), `breakPercentage` (20), `breakRules[]` (`{ minDuration, maxDuration, breakDuration }`)

`FocusModeLocalConfig`: `isLoopBreakEndAlarm?` (device-local)

Countdown picks its length from the task's remaining estimate when that is shorter than the default (`getCountdownDurationForTask`).

### 3.4 Focus session records

- There is **no** rich per-session record entity. Sessions are recorded as `focusSessions?: number[]` (timestamps) on the day's `Metric` entity (see §5.1).
- Focus time totals are derived from those timestamps plus `timeSpentOnDay`.
- Because focus state is in-memory only, a crash loses the in-flight session, not completed history.

### 3.5 Focus mode UI integration

- Focus mode accessible from timer bar / dedicated focus entry point
- Focus session auto-starts time tracking on the chosen task
- Break reminders integrated with focus mode break schedule
- Focus mode can be started from task detail / task row

### 3.6 Focus mode local settings

- Separate local (device-only) focus mode settings from global config
- Local settings: last used mode, active session state, break skip preference
- Local settings not synced (per-device)

---

## 4. Break Reminders / Take-a-Break

### 4.1 Break reminder config (`TakeABreakConfig`)

Verified fields:

- `isTakeABreakEnabled` — default `true`
- `takeABreakMinWorkingTime` — work time before a break is suggested (default 60 min)
- `takeABreakSnoozeTime` — snooze length (default 15 min)
- `takeABreakMessage` — message template supporting `${duration}`
- `isLockScreen` — lock the screen during the break
- `isTimedFullScreenBlocker` + `timedFullScreenBlockerDuration` (default 8000 ms) — force a timed full-screen blocker
- `isFocusWindow` — focus the app window when the reminder fires
- `motivationalImgs: (string|null|undefined)[]` — images shown with the break prompt
- Break sound is configured under `sound.breakReminderSound` (see §15), not here.

### 4.2 Idle Time detection (`IdleConfig`)

- `isEnableIdleTimeTracking` — default `true`
- `minIdleTime` — idle threshold in ms (default 5 min)
- `isOnlyOpenIdleWhenCurrentTask` — default `false`
- `isSuppressIdleDuringFocusMode` — default `true`
- Idle detection needs interaction signals; on web it requires the browser extension, so a forgotten timer keeps running without it.
- Idle time is **not** a metric field — there is no `obstructionTime`.

### 4.3 Idle dialog (`dialog-idle`)

When idle is detected the user resolves the idle span. Real UI:

- Three modes via button group: **BREAK** (count it as a break), **TASK** (assign it to a task, optionally creating one), **SPLIT** (split the span across multiple entries, each `BREAK` or `TASK` with its own duration and its own counter toggles)
- **"Don't track"** skips the span entirely
- Per-simple-counter toggles to also count the idle span toward a habit counter (`SimpleCounterIdleBtn`)
- **"Reset break reminder timer"** checkbox (shown only when take-a-break is enabled)
- SPLIT mode shows live remaining/over-assigned time and a "use remaining time" helper
- Submit is disabled until the assignment is valid (`isConfirmEnabled`)

---

## 5. Metrics, Daily Summary, Heatmap

### 5.1 Daily metrics model

Verified against `src/app/features/metric/metric.model.ts`. The **persisted** entity is deliberately small — one record per day, keyed by `id = dayStr` (`YYYY-MM-DD`):

- **id** — day string, the entity key
- **focusSessions?** — number[] of focus-session timestamps
- **notes?** — daily evaluation note text
- **remindTomorrow?** — boolean
- **reflections?** — `{ text, created }[]`
- **impactOfWork?** — number, 1–4 scale
- **energyCheckin?** — number, 1–3 scale (1 exhausted, 2 ok, 3 good)
- **totalWorkMinutes?** — number (marked for removal upstream)
- **completedTasks?**, **plannedTasks?** — numbers, completion tracking

Everything else is **computed, not persisted**. The aggregate type `SimpleMetrics`:

`start, end, timeSpent, timeEstimate, breakTime, breakNr, nrOfCompletedTasks, nrOfAllTasks, nrOfSubTasks, nrOfMainTasks, nrOfParentTasks, daysWorked, avgTasksPerDay, avgTimeSpentOnDay, avgTimeSpentOnTask, avgTimeSpentOnTaskIncludingSubTasks, avgBreakNr, avgBreakTime`

Aggregation lives in `all-tasks-metrics.service.ts` / `project-metrics.service.ts` / `metric.util.ts`.

### 5.2 No "productivity score"

There is **no** persisted or computed `productivityScore`, `improvement`, `obstructionTime`, `startedWorking` or `endedWorking` in the current source — do not build one and call it parity. The app surfaces raw aggregates above plus the daily evaluation ratings (`impactOfWork`, `energyCheckin`) and reflections.

### 5.3 Metrics page

- Metrics view backed by `SimpleMetrics` aggregates over a selectable range
- Charts (Chart.js, lazy-loaded): time spent, tasks completed, break time
- Comparison across projects / all tasks (`project-metrics.service.ts`, `all-tasks-metrics.service.ts`)
- `evaluation-sheet` component for the daily evaluation flow
- `impact-stars` component for the `impactOfWork` rating

### 5.4 Heatmap

- `activity-heatmap.component.ts` — GitHub-style calendar heatmap
- Color intensity from activity (time spent / completion), tap or hover for day details
- Year selector / scrolling range

### 5.5 Daily summary page

- `pages/daily-summary` — the day's tasks, time spent, focus sessions and breaks
- Shown on demand and as part of the finish-day workflow
- Before-finish-day prompt to review the day before closing

---

## 6. Simple Counters & Habits

### 6.1 SimpleCounter model

Verified against `simple-counter.model.ts`:

- `id`, `title`, `isEnabled`, `isHideButton?`, `icon: string | null`, `type: SimpleCounterType`
- Streak config: `isTrackStreaks?`, `streakMinValue?`, `streakMode?: 'specific-days' | 'weekly-frequency'`, `streakWeekDays?: Record<number, boolean>`, `streakWeeklyFrequency?`
- `countdownDuration?` (RepeatedCountdownReminder only)
- Dynamic: `countOnDay: Record<dayStr, number>`, `isOn: boolean`
- **No** `count`/`target` fields — daily counts live in `countOnDay`.

`SimpleCounterType` values (exact strings): `StopWatch`, `ClickCounter`, `RepeatedCountdownReminder`.

### 6.2 Habit tracking

- Counter/habit list views (habit page + widget-able counters)
- Create / edit / delete counters
- Daily count entry per counter; counters increment, decrement or toggle
- Streak display driven by `streakMode` (specific weekdays vs weekly frequency)
- Counters are an op-log entity (`SIMPLE_COUNTER`) and therefore sync

---

## 7. Scheduling, Calendar & Planner

### 7.1 Schedule model

- Schedule entry: id, taskId, start datetime, duration, end datetime
- Scheduled tasks have a planned time slot
- Schedule view shows timeline of scheduled tasks for a day/week
- Drag a task onto the schedule to create a schedule entry
- Drag to reschedule (change time slot)
- Schedule conflicts / overlaps indicated

### 7.2 Planner view

- Day/week planner grid
- Drag tasks from task list onto planner time slots
- Visualize planned tasks in the planner timeline
- Planner shows scheduled tasks and free slots
- Week view and day view in planner

### 7.3 Calendar integration (external calendars)

- Calendar integration providers:
  - Google Calendar
  - CalDAV (e.g. Nextcloud, self-hosted CalDAV)
  - ICS / iCalendar import
  - Outlook / Microsoft (where supported)
- Import calendar events into the app's calendar view
- Two-way or one-way sync depending on provider
- Display external events alongside scheduled tasks in calendar view
- Auth per provider (OAuth for Google/Outlook, credentials for CalDAV)
- Polling interval per provider
- Create a task from a calendar event
- Show calendar events in the schedule/planner views

### 7.4 Scheduled tasks

- A task can have a scheduled time (plannedAt / schedule entry)
- Scheduled tasks appear in Scheduled view and calendar
- Due date + scheduled time can both be set
- Due date and dueWithTime are mutually exclusive
- Deadline is separate from due date

### 7.5 Repeating scheduled tasks

- Repeating tasks can also be scheduled
- Next repeat instance inherits / resets schedule per config

---

## 8. Issue Integrations (GitHub, GitLab, Jira, etc.)

### 8.1 Issue provider model

- Issue provider: id, title, type, auth config, base URL, polling interval, features supported
- Issue model: id, providerId, externalId, title, url, status, assignee, labels, etc.

### 8.2 Issue providers (enumerated from source)

Authoritative from `src/app/features/issue/issue.model.ts` (`IssueProviderKey`). Three tiers:

**Built-in (`BuiltInIssueProviderKey`)** — implemented in `features/issue/providers/`:

- `JIRA`
- `GITLAB`
- `CALDAV`
- `ICAL` (calendar, in `providers/calendar`)
- `OPEN_PROJECT`
- `PLAINSPACE` (two-way collaboration)

**Migrated to plugins (`MigratedIssueProviderKey`)** — still valid keys in synced data and for older clients, but the implementation now ships as a plugin:

- `GITHUB`
- `CLICKUP`
- `GITEA`
- `LINEAR`
- `TRELLO`
- `AZURE_DEVOPS`
- `REDMINE`
- `NEXTCLOUD_DECK`

**Plugin providers** — any key of the form `` `plugin:${string}` `` (see `packages/plugin-api`, `features/issue-provider/plugin-issue-provider.model.ts`).

Parity note: a new client must accept all three tiers in persisted/synced data (unknown `plugin:` keys and tolerated provider keys must not be treated as corruption), even if it only ships native UI for the built-ins. Per-provider capability matrix: `original source code/docs/wiki/3.07-Issue-Integration-Comparison.md`.

### 8.3 Per-provider capabilities

- Import issues (one-time or synced)
- Two-way sync of issue status
- Polling for updates
- Search issues
- Create issue from a task
- Link task to issue (issueId + issueProviderId on task)
- Display issue status / title / url on the task
- Open external issue in browser
- Update task from issue changes (e.g. title sync)
- Provider-specific auth: PAT (personal access token), OAuth, API key

### 8.4 Issue integration service

- Issue integration service manages provider connections
- Per-provider settings: enabled, auth token, project filter, polling interval, sync direction
- Issue sync runs on timer / on demand
- Issue state cached locally and synced

### 8.5 Create issue from task

- From a task detail, create a linked external issue in the configured provider
- Task title used as issue title by default
- Issue url stored back on the task

---

## 9. Reminders & Notifications

### 9.1 Reminder model

Verified against `reminder.model.ts` — the `REMINDER` op-log entity is minimal:

- `id`, `remindAt` (epoch ms), `title`, `type: 'NOTE' | 'TASK'`, `relatedId` (task or note id), `recurringConfig?`
- **Recurring reminders are not implemented** — the file carries `// TODO implement recurring reminders`; `RecurringConfig` is an opaque `Record<string, unknown>`. Repeating *tasks* are a separate feature (`TASK_REPEAT_CFG`, §1.6/§7.5).
- Task-level reminder state lives on the task (`remindAt`, `reminderId`, `deadlineRemindAt`), plus legacy task reminders are migrated into the reminder entity (`migrate-legacy-task-reminders.util.ts`).

### 9.2 Notification types

- In-app notification / snackbar
- System notifications via the platform layer (Android local notifications, `ReminderAlarmReceiver` alarms; desktop notifications on Electron)
- Web: Notification API where permitted
- Fired for: task reminder, deadline reminder, due-date notification (`notifyOnDueDate` at `dueDateNotificationHour`, default 9), tracking reminder, break reminder, idle prompt, countdown banner
- `disableReminders` kills all reminder delivery; `isFocusWindow` focuses the app window

### 9.3 Notification customization

- `defaultTaskRemindOption` — default lead time (`TaskReminderOptionId`)
- `isCountdownBannerEnabled` + `countdownDuration` (default 10 min) — the pre-task countdown banner
- `useAlarmStyleReminders` — Android only: louder, alarm-style notifications
- Per-type sounds via `sound` config (`doneSound`, `breakReminderSound`, `trackTimeSound`, `volume`, `isIncreaseDoneSoundPitch`)
- **No** quiet-hours / do-not-disturb feature and **no** per-notification grouping setting exists — do not invent them.

### 9.4 Reminder service

- Reminder service checks due reminders on a timer
- Fires notification when remindAt reached
- Handles recurring reminder generation from repeating tasks

---

## 10. Sync — SuperSync (self-hosted server)

### 10.1 Sync architecture (operation-based, event sourcing)

- Clients upload atomic operations: Create (CRT), Update (UPD), Delete (DEL), Move (MOV), Batch (BATCH)
- Each operation has: id, clientId, actionType, opType, entityType, entityId, entityIds, payload, vectorClock, timestamp, schemaVersion, isPayloadEncrypted (optional), syncImportReason (optional)
- Server assigns strictly increasing per-user `server_seq`
- Clients download operations since a known `sinceSeq`
- Vector clocks track per-device causality
- Conflict detection on upload (concurrent / superseded)
- Full-state snapshots for initial sync and recovery (SYNC_IMPORT, BACKUP_IMPORT, REPAIR op types)
- Snapshot reasons: initial, recovery, migration
- Import reasons: PASSWORD_CHANGED, FILE_IMPORT, BACKUP_RESTORE, FORCE_UPLOAD, SERVER_MIGRATION, REPAIR

### 10.2 Wire format (shared-schema)

- Full contract defined in `supersync-http-contract.ts`
- Upload request: `{ ops, clientId, lastKnownServerSeq, requestId }`
- Upload response: `{ results, newOps, latestSeq, hasMorePiggyback, deduplicated }`
- Download query: `{ sinceSeq, limit, excludeClient, appVersion }`
- Download response: `{ ops, hasMore, latestSeq, gapDetected, snapshotVectorClock, serverTime, capabilities }`
- Snapshot request: `{ state, clientId, reason, vectorClock, schemaVersion, isPayloadEncrypted, syncImportReason, opId, isCleanSlate, snapshotOpType, repairBaseServerSeq, requestId }`
- Snapshot response: `{ state, serverSeq, generatedAt }`
- Status response: `{ latestSeq, devicesOnline, snapshotAge, storageUsedBytes, storageQuotaBytes }`
- Devices response: `{ devices: [{ clientId, lastSeenAt }] }`
- Restore points: `{ restorePoints: [{ serverSeq, timestamp, type, clientId, description }] }`
- Replace token: `{ token }` (new JWT, revokes all previous tokens)
- Capture endpoints: `/api/capture/*` for agent task capture (OAuth-based)

### 10.3 Auth

- JWT bearer token (full-access, long-lived — 365 days) in `Authorization: Bearer <token>`
- Login: passkey (WebAuthn) or magic link (email)
- Registration: passkey registration or magic-link registration
- Email verification required before account is active
- Token replacement endpoint revokes all tokens for the account (sign-out everywhere)
- Account deletion endpoint (soft/hard delete, cascades operations, sync state, devices)
- No production password-based login/register

### 10.4 End-to-end encryption

- Argon2id key derivation (OWASP 2023 mobile: parallelism 1, iterations 3, memory 64 MiB)
- AES-256-GCM authenticated encryption
- Wire format: `[SALT (16)] [IV (12)] [AES-GCM ciphertext + auth tag]` base64-encoded
- Legacy PBKDF2 format still supported for backward compat (detected by length)
- Session key caching: salt derived once per (session, password) pair, reused across encrypt calls in that session
- `clearSessionKeyCache()` on password change / logout
- Legacy KDF warning handler for deprecation notices
- Encryption is optional per-snapshot/per-op (`isPayloadEncrypted` flag)
- E2EE required gate: server can reject non-encrypted uploads when the account requires it (`E2EE_REQUIRED` error)

### 10.5 Sync providers (alternatives to SuperSync)

- **SuperSync** (the operation-log server) — primary self-hosted option
- **WebDAV** — generic WebDAV sync (file-based sync payload on a WebDAV server); listed as "not recommended / no support"
- **File-based / local file sync** — export/import JSON backup files, manual transfer
- **Cloud drive providers** (Dropbox, OneDrive, Google Drive) — where supported via sync-provider adapters
- **Nextcloud** (via WebDAV or dedicated provider) — valid alternative for new installs
- **Proton Drive** via rclone (documented workaround)

### 10.6 Sync setup UI

- Settings → Sync & Backup → configure sync provider
- SuperSync setup flow:
  1. Choose SuperSync as provider
  2. Set Server URL to self-hosted `PUBLIC_URL`
  3. Open server in browser, sign up / sign in, copy JWT token
  4. Paste token as Access Token
  5. Set encryption password (separate from login, cannot be recovered)
- Additional devices: repeat flow with same server URL and account; enter same encryption password
- Do NOT use "Revoke & Replace Token" when adding a device (invalidates all other devices)

### 10.7 Sync status / devices

- Sync status: latestSeq, devicesOnline, snapshotAge, storageUsedBytes, storageQuotaBytes
- Devices list: clientId, lastSeenAt per device
- Storage quota: default 100 MB per account; configurable by server admin (`SUPERSYNC_DEFAULT_STORAGE_QUOTA_BYTES`)
- Rate limiting on sync endpoints
- Conflict / gap detection on download (`gapDetected` flag)

### 10.8 Backup & restore

- Local JSON backup export (full task data + settings)
- Import from JSON backup
- Backup restore creates a SYNC_IMPORT / BACKUP_IMPORT snapshot
- Local recovery points (snapshots) stored locally for disaster recovery
- Restore from a local recovery point
- "Manage Your Data" — export, import, delete all data

---

## 11. Import / Export (IMEX)

### 11.1 Import formats

- JSON backup import (full app state)
- CSV import (tasks from spreadsheet)
- Calendar import (ICS)
- Issue import from various providers

### 11.2 Export formats

- JSON backup export
- CSV export (tasks, worklog, history)
- PDF export (task lists, worklog, reports) where supported
- Worklog export

### 11.3 IMEX settings

- Import/export configuration UI
- Default export format choices
- Auto-backup settings (automatic periodic JSON backup)

---

## 12. Plugins

### 12.1 Plugin system

- Plugin API (`@super-productivity/plugin-api`) — TypeScript types for plugin development
- Plugin manifest: name, id, manifestVersion, version, minSupVersion, description, hooks, permissions, iFrame, uiKit, icon
- Plugin structure: manifest.json, plugin.js, index.html (optional), icon.svg (optional), i18n/
- Plugins run in the main window context (not sandboxed)
- Bundled plugins shipped with the app (list in BUNDLED_PLUGIN_PATHS / BUNDLED_PLUGIN_IDS)
- User-installed plugins via Settings → Plugins → Upload Plugin (zip, max 50 MB)

### 12.2 Plugin hooks

- TASK_COMPLETE — fired when a task is marked done
- TASK_UPDATE — fired when a task is modified
- TASK_DELETE — fired when a task is removed
- FINISH_DAY — end of day
- LANGUAGE_CHANGE — app language changed
- PERSISTED_DATA_CHANGED — any persistent data change for the plugin
- ACTION — custom action hook

### 12.3 Plugin permissions

- nodeExecution (desktop only, user consent prompt)
- http + allowedHosts (gates PluginAPI.request)
- deleteProject (gates that call)
- showSnack, notify, showIndexHtmlAsView, openDialog, getTasks, getArchivedTasks, getCurrentContextTasks, getSelectedTask, getFocusedTask, addTask, getAllProjects, addProject, deleteProject, getAllTags, addTag, persistDataSynced, getAppState

### 12.4 Plugin UI slots

- Header buttons (registerHeaderButton)
- Menu entries (registerMenuEntry)
- Side panel buttons (registerSidePanelButton)
- Keyboard shortcuts (registerShortcut)
- Iframe UI (showIndexHtmlAsView)
- Dialogs (openDialog)
- Snack notifications (showSnack)
- System notifications (notify)

### 12.5 Plugin data persistence

- persistDataSynced — save plugin data (synced across devices via the app's sync)
- loadSyncedData — load saved plugin data
- Plugin data scoped to the plugin

### 12.6 Plugin API capabilities

- getTasks, getArchivedTasks, getCurrentContextTasks, getSelectedTask, getFocusedTask
- updateTask, addTask
- getAllProjects, addProject, deleteProject
- getAllTags, addTag
- showSnack, notify, openDialog, showIndexHtmlAsView
- registerMenuEntry, registerHeaderButton, registerSidePanelButton, registerShortcut
- translate(key, params?), formatDate(date, format), getCurrentLanguage()
- cfg — current app configuration (theme, platform, version)
- request — HTTP requests (if http permission granted, to allowedHosts only)
- persistDataSynced, loadSyncedData

### 12.7 Plugin development tooling

- `packages/plugin-dev/` — shared build script (esbuild), tsconfig.base.json, QUICK_START.md, PLUGIN_I18N.md
- Plugin examples: boilerplate-solid-js (SolidJS/Vite), automations, github-issue-provider, etc.
- Build: `npm run build` in plugin-dev, copies dist/ to `src/assets/bundled-plugins/`
- File size limits: plugin zip 50 MB, plugin.js 10 MB, manifest 100 KB, index.html 100 KB

---

## 13. Calendar Integration Details

(Also covered in 7.3, but enumerated here for completeness.)

- Google Calendar: OAuth, import events, two-way where supported
- CalDAV: username/password, calendar URL, import events
- ICS import: file import of .ics calendar
- Outlook: OAuth where supported
- Display events in calendar view, schedule view, planner view
- Create task from calendar event
- Polling interval per provider configurable

---

## 14. Keyboard Shortcuts

### 14.1 Global keyboard shortcuts

- Add task (global hotkey)
- Toggle focus mode
- Start/stop tracking
- Complete current task
- Navigate views
- Search
- Settings
- Undo
- redo
- (Full list defined in `keyboard-form.const.ts` and `shortcut.service.ts`)

### 14.2 In-app keyboard shortcuts

- Arrow keys / Tab to navigate task rows
- Enter to open task detail
- Space to toggle completion
- Escape to close panels
- Shortcut for each major action (bulk actions, filtering, sorting)

### 14.3 Shortcut customization

- Keyboard shortcuts configurable in Settings → Keyboard
- Each shortcut editable / remappable
- Shortcut conflicts detected

---

## 15. Settings & Preferences (global config)

### 15.1 Settings sections (from config forms)

The following settings tabs exist in the original app (each with many individual fields):

- **App Features** — enable/disable features (task list, planner, board, calendar, metric, habit, worklog, etc.)
- **General / Misc** — language, timezone, start of week, first day of week, default project, default tag, default context, task list behavior, confirm on delete, confirm on complete, show completed tasks, collapsed sections, etc.
- **Time Tracking** — tracking behavior, idle detection, track context, auto-start tracking, track on task complete, time format, tick interval, store time per day, etc.
- **Tasks** — task list settings, subtask behavior, repeat config default, due date behavior, spam handling, default estimate, task detail panel behavior, auto archive, etc.
- **Pomodoro / Focus Mode** — session mode, work duration, short break, long break, cycles before long break, auto-start session, auto-start break, auto-start next, skip breaks, sounds, etc.
- **Reminders** — reminder enable, reminder sound, reminder notification, due reminder, repeat reminder, quiet hours, etc.
- **Schedule** — schedule view settings, scheduler behavior, drag-to-schedule, default schedule duration, etc.
- **Calendar Integration** — per-provider settings (Google, CalDAV, ICS, Outlook), polling intervals, sync direction
- **Issue Integrations** — per-provider settings (GitHub, GitLab, Jira, etc.), auth tokens, project filters, polling intervals, sync direction
- **Sync & Backup** — sync provider selection, server URL, access token, encryption password, backup settings, auto-backup, import/export defaults
- **Keyboard Shortcuts** — per-action shortcut remapping
- **Language** — language selection, locale
- **Theme / Appearance** — dark mode, custom theme, CSS variables, background image / unsplash, theme color, font settings
- **Sound** — sound effects on task complete, tracking start/stop, focus session events, reminder sound, break reminder sound, notification sounds
- **Idle** — idle detection enable, idle timeout, idle handling choice
- **Take a Break** — break reminder enable, break interval, break duration, break sound
- **Simple Counters** — counter settings, default counter type, streak display
- **Task Widget** (Android) — widget configuration, update interval, shown fields, colors
- **Short Syntax** — short syntax enabled, default project/tag on quick add, parse behavior
- **Clipboard Images** — paste images from clipboard into notes/tasks, image handling
- **Plugins** — plugin list, enable/disable, upload plugin, bundled plugins
- **Evaluation / Telemetry** — evaluation settings, anonymous usage data, opt-in/opt-out
- **Automatic Backups** — auto-backup enable, backup interval, backup location, max backups
- **Focus Mode Local** — local (per-device) focus mode state, not synced
- **New install app features** — first-run feature selection / onboarding choices
- **Task View Customizer** — which columns/fields show in task list, order, visibility
- **Mobile settings** — mobile-specific preferences
- **Notifications** — notification permissions, notification channels, notification behavior

### 15.2 Global config model

- Full TypeScript interface in `global-config.model.ts`
- Defaults in `default-global-config.const.ts`
- Settings persisted locally (IndexedDB / local storage) and synced via the sync layer where applicable
- Local-only settings vs synced settings distinguished

### 15.3 Onboarding / first-run

- New-install app features selection (which features to enable on first run)
- First-run walkthrough
- Encryption password setup on first sync enable
- Server setup flow on first sync

---

## 16. Theme & Appearance

### 16.1 Theming

- Dark mode / light mode toggle
- Custom themes (CSS variables)
- Theme color picker
- Background image (Unsplash integration or local image)
- Font settings
- Accent color
- Theme persisted in global config

### 16.2 Theme capabilities (from theming-contract.md)

- CSS variable-based theming
- Dark/light mode detection (system preference)
- Custom theme JSON
- Background image overlay
- Theming applied across all views

---

## 17. Views & Layout

### 17.1 Main views (pages)

- Today
- Inbox
- Scheduled
- Planner
- Schedule
- Board
- Project
- Tag
- Calendar
- Worklog
- History
- Metric / Daily Summary
- Habit / Simple Counters
- Notes / Plainspace
- Archive
- Search
- Settings
- Onboarding
- Plugin views (if a plugin shows its own UI)

### 17.2 Layout features

- Side navigation / bottom navigation (mobile)
- Task list panel
- Task detail panel (slide-out)
- Bottom panel / secondary panel (calendar, worklog, etc. as secondary panels)
- Header with view title, actions, search
- Timer bar (persistent timer display)
- Menu tree / navigation tree
- Responsive layout (web) and adaptive layout (mobile)

### 17.3 Task view customizer

- Choose which columns/fields appear in the task list
- Reorder columns
- Toggle visibility of: title, project, tags, due date, time estimate, time spent, priority, context, issue, repeat indicator, progress
- Per-view customizer settings

---

## 18. Android-specific features (from original Android client)

Verified against `android/app/src/main/AndroidManifest.xml`. A parity client must reproduce this surface (names will differ; behavior must not).

### 18.1 Android permissions (exact list)

- `INTERNET`
- `ACCESS_NETWORK_STATE`
- `POST_NOTIFICATIONS`
- `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`
- `SCHEDULE_EXACT_ALARM`
- `RECEIVE_BOOT_COMPLETED`

Also declared: `<queries>` for the known WebView packages (avoids `QUERY_ALL_PACKAGES`), and `android:usesCleartextTraffic="true"` — **required for self-hosted HTTP servers**.

Not declared: `VIBRATE`, notification-listener, or connectivity-change permissions — do not add them "for parity".

### 18.2 Activities, services & receivers

- **Activities:** `CapacitorMainActivity` (main; `singleTask`), `FullscreenActivity` (legacy launcher + `DONE`/`PAUSE` actions), `AppShortcutActivity` (no-display trampoline for launcher shortcuts), `WebViewBlockActivity` (blocks incompatible WebView).
- **Services:** `TrackingForegroundService` (`foregroundServiceType="specialUse"`, subtype `time_tracking`), `FocusModeForegroundService` (`specialUse`, subtype `focus_timer`), `TaskListWidgetService` (`BIND_REMOTEVIEWS`).
- **Receivers:** `ReminderAlarmReceiver`, `ReminderActionReceiver`, `BootReceiver` (`BOOT_COMPLETED` + `MY_PACKAGE_REPLACED`), `ExactAlarmPermissionReceiver` (`SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED` — re-registers alarms as exact once the user grants the permission), `TaskListWidgetProvider` (`APPWIDGET_UPDATE`).

### 18.3 Android widget

- `TaskListWidgetProvider` + `TaskListWidgetService` (RemoteViews collection) + `res/xml/appwidget_info`
- Shows the task list; widget clicks/done actions are delivered via **explicit-component PendingIntents** (deliberately not advertised in intent filters so other apps cannot trigger them)
- Widget settings exist in the app (task-widget settings, see §15)

### 18.4 Android notifications

- Local notifications for task reminders and deadline reminders
- Exact-alarm scheduling (`ReminderAlarmReceiver`) with graceful fallback when `SCHEDULE_EXACT_ALARM` is denied
- Action receiver for notification buttons (`ReminderActionReceiver`)
- Foreground-service notification for active tracking and focus timer
- Optional "alarm-style" reminders (`reminder.useAlarmStyleReminders`)

### 18.5 Android native integrations

- Capacitor bridge: notifications/local notifications, app lifecycle, filesystem, share, app plugin (URL opens)
- **Share target:** `ACTION_SEND` with `text/*` → quick capture
- **URL scheme** `com.super-productivity.app` hosts: `create-task`, `complete-task`, `add-task`, `today`, `inbox`
- **OAuth callbacks:** `com.super-productivity.app` `oauth-callback` / `plugin-oauth-callback`, plus `com.superproductivity.superproductivity` prefix `/plugin-oauth-callback`
- **Launcher shortcuts** (`res/xml/shortcuts.xml`): New Task, Today, Inbox via the `AppShortcutActivity` trampoline
- Custom WebDAV HTTP plugin (`plugins/webdavhttp`) + `crypto` module for the native HTTP path (bypasses WebView CORS)

### 18.6 Mobile-specific features

- Touch UI: swipe to complete/delete, long-press context menu, bottom navigation
- "Connectivity-free mode" for fully offline use
- Mobile-only settings (e.g. tracking reminder shown on mobile)
- Back-button and edge-to-edge/keyboard handling (see `docs/android-edge-to-edge-keyboard.md`)
- Mobile keyboard handling
- Offline behavior optimized for mobile

---

## 19. Desktop (Electron) features — mostly NOT needed for mobile+web

### 19.1 Desktop-only features (can be skipped for the new client unless targeting desktop)

- System tray (minimize to tray)
- Global keyboard shortcuts (registered at OS level)
- Local REST API (localhost server for integration)
- MCP (Model Context Protocol) server
- Idle detection via OS (desktop idle API)
- Native notifications via Electron
- App auto-update
- Native file dialogs
- Remember window size/position
- Multi-window support

### 19.2 Desktop features users may still expect

- Global quick-capture shortcut
- System notifications
- File attachment via native file picker
- Minimize to tray (optional)

---

## 20. Language & Localization

### 20.1 Supported languages

Verified — 28 shipped locale files in `src/assets/i18n/`:

`ar`, `cs`, `de`, `en`, `es`, `fa`, `fi`, `fr`, `hr`, `id`, `it`, `ja`, `ko`, `nb`, `nl`, `pl`, `pt-br`, `pt`, `ro-md`, `ro`, `ru`, `sk`, `sv`, `tr`, `uk`, `vi`, `zh-tw`, `zh`

`en.json` is the source of truth (~208 KB, the single largest file). Short-syntax date parsing additionally recognizes date words for a subset of these (en always; de, es, fr, it, ja, nl, pt, ru, sv, uk, vi, zh, zh-tw) via the Chrono-based parser — see `3.04-Short-Syntax.md`.

### 20.2 Localization system

- i18n JSON files per locale (`src/assets/i18n/<locale>.json`)
- Translation keys for all UI strings
- Language selectable in Settings → Language
- `formatDate`, `translate`, `getCurrentLanguage` in plugin API
- Date/time formatting per locale
- Number formatting per locale

---

## 21. Accessibility

- Accessibility states for tasks (done, in-progress, overdue, tracked, focused)
- Screen-reader-friendly labels where implemented
- Keyboard-navigable UI
- Color not the only indicator (priority shown with text/icon as well)
- High-contrast considerations

---

## 22. Daily workflow features

### 22.1 Before-finish-day

- Prompt before closing the day: review today's tasks, log time, finish incomplete tasks
- Configurable prompt time / trigger

### 22.2 Finish day before close

- Option to automatically finish the day when closing the app
- Day close triggers: worklog finalization, daily summary, metrics update

### 22.3 Add tasks for tomorrow

- Suggestion to add tasks for tomorrow at end of day
- Carry-over of unfinished tasks

### 22.4 Daily summary

- End-of-day summary view
- Metrics for the day
- Productivity score
- Task done count, time spent, focus sessions

---

## 23. Anti-Procrastination

- Anti-procrastination feature (from `procrastination-buster` plugin / feature)
- Prompts when a task has been pending for a while
- Encouragement / nudges to start tracking
- Configurable thresholds

---

## 24. Tracking Presence & Tracking Reminder

- Tracking presence indicator (is the user currently tracking?)
- Tracking reminder (nudge if no tracking has started and there are tasks due)
- Tracking reminder configurable

---

## 25. Agent / Assistant Capture

- Agent task capture integration (Claude, ChatGPT, Claude Code via OAuth capture connector)
- `/api/capture/*` endpoints on the server
- Capture grants, capture tokens, capture connect codes
- Agent submits tasks to the inbox via capture
- Capture feature toggle in settings

---

## 26. Native Capture

- Quick-capture from system (sharesheet, global shortcut, share target)
- Captured text becomes a task in inbox
- Native capture bridge (android-interface, capacitor plugins)

---

## 27. Search

- Global search page
- Search across tasks (title, notes, project, tags, issue id, context)
- Search across notes
- Search across archived tasks
- Search results grouped / filterable
- Search keyboard shortcut

---

## 28. Collaboration / Sharing (where supported)

- Multi-device sync (via SuperSync or other providers)
- Share task via deep link / URI
- Share target (receive shared content)
- Capture connector for AI assistants (agent task capture)

---

## 29. Data management

### 29.1 Local persistence

- IndexedDB for local data (task store, project store, tag store, note store, settings, sync state, op-log, encryption keys)
- Op-log local persistence (pending operations, applied operations, vector clock)
- Local recovery points (snapshots) for disaster recovery

### 29.2 Data management UI

- "Manage Your Data" section
- Export data (JSON, CSV)
- Import data
- Delete all data
- Restore from backup
- Backup management

### 29.3 Storage quota

- Sync storage quota (server-enforced, default 100 MB)
- Local storage management

---

## 30. Sync state & conflict handling

### 30.1 Vector clocks

- Per-device vector clock
- Merge on download
- Compare on upload for conflict detection
- Limit vector clock size (to bound memory)

### 30.2 Conflict resolution

- Server detects concurrent vs superseded uploads
- Client handles rejected operations (retry with new clock, merge, prompt)
- Download-side concurrency handling
- Full-state snapshot as fallback for repair

### 30.3 Sync planning

- Plan regular ops after full-state upload
- Plan snapshot hydration
- Sync interval / sync trigger (on change, on timer, on reconnect)
- WebSocket for real-time sync notifications (where supported by server)

---

## 31. Error handling & status

- Sync error states (conflict, rate limited, storage quota exceeded, encryption required, validation failed, internal error, client update required)
- Error codes enumerated in `supersync-http-contract.ts`
- User-facing error messages
- Retry logic for failed uploads/downloads
- Offline behavior (queue operations, sync when online)

---

## 32. First-run / onboarding flow

- New-install app features selection
- Feature onboarding (which features to enable)
- Sync setup onboarding
- Encryption password setup
- Language selection
- Theme selection

---

## 33. Accessibility & states

- Task states: active, completed, overdue, tracked, focused, scheduled, repeating, archived
- Visual indicators for each state
- Accessibility labels for state icons

---

## 34. Miscellaneous platform features

- Clipboard image paste (into notes / task notes)
- Share / deep link handling
- App URI actions
- App lifecycle handling (background/foreground)
- Boot receiver (Android)
- Exact alarm (Android)
- Foreground service (Android)
- Widget (Android)
- Local notifications (Android / Capacitor)
- System notifications (desktop / Capacitor)

---

## 35. Plugin-provided features (bundled plugins)

- GitHub issue provider (bundled plugin)
- Automations plugin
- SolidJS boilerplate plugin
- Other bundled plugins listed in `BUNDLED_PLUGIN_IDS`
- Each bundled plugin may add its own feature surface (issue sync, automation triggers, etc.)

---

## 36. End-to-end encryption (detailed)

- Already covered in 10.4, but also:
- Encryption password is separate from login credentials
- Password cannot be recovered — must be stored by the user
- Encryption applied to operation payloads before upload
- Server stores only encrypted payloads (plus plaintext causal metadata)
- Encryption key derived from password via Argon2id
- Session key cache for performance
- Legacy PBKDF2 ciphertexts still decryptable
- E2EE required gate per account

---

## 37. Server self-hosting requirements (for client compatibility)

- SuperSync server: Fastify + PostgreSQL + Prisma
- Auth: passkey (WebAuthn) + magic link, JWT tokens
- Sync endpoints: `/api/sync/ops` (POST upload, GET download), `/api/sync/status`, `/api/sync/devices`
- Snapshot endpoints: POST `/api/sync/snapshot`
- Auth endpoints: `/api/register/passkey/*`, `/api/register/magic-link`, `/api/login/passkey/*`, `/api/login/magic-link*`, `/api/verify-email`, `/api/recover/passkey*`, `/api/replace-token`, `/api/account` (DELETE)
- Capture endpoints: `/api/capture/*`, `/mcp` (when CAPTURE_CONNECTOR_ENABLED)
- Docker Compose deployment: SuperSync + PostgreSQL + Caddy (TLS)
- SMTP required for sign-up/login/recovery emails
- ALLOWED_EMAILS for private installs
- CORS_ORIGINS for web app hosting
- WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN for passkeys
- JWT_SECRET (min 32 chars), POSTGRES_PASSWORD
- DOMAIN + PUBLIC_URL (HTTPS required in production)
- Supported PostgreSQL: 16+ (14/15 supported but not tested in CI)
- AMD64 Linux host for Docker deployment

---

## 38. Error codes the client must handle

From `supersync-http-contract.ts`:

- VALIDATION_FAILED, INVALID_OP_ID, INVALID_OP_TYPE, INVALID_ENTITY_TYPE, INVALID_ENTITY_ID, INVALID_PAYLOAD, PAYLOAD_TOO_LARGE, INVALID_VECTOR_CLOCK, INVALID_TIMESTAMP, MISSING_ENTITY_ID, INVALID_SCHEMA_VERSION, INVALID_CLIENT_ID
- CONFLICT_CONCURRENT, CONFLICT_SUPERSEDED, REPAIR_STALE, DUPLICATE_OPERATION, SYNC_IMPORT_EXISTS
- RATE_LIMITED
- STORAGE_QUOTA_EXCEEDED
- ENCRYPTED_OPS_NOT_SUPPORTED, E2EE_REQUIRED
- CLIENT_UPDATE_REQUIRED
- INTERNAL_ERROR

---

## 39. Task model fields (consolidated reference)

`id, title, notes, projectId, tagIds, subTaskIds, parentId, created, updated, modified, isDone, doneOn, wontDoOn, timeEstimate, timeSpent, timeSpentOnDay, dueDay, dueWithTime, hasPlannedTime, deadlineDay, deadlineWithTime, deadlineRemindAt, remindAt, reminderId, repeatCfgId, attachments, priority, issueId, issueProviderId, issueType, issueWasUpdated, issueLastUpdated, issueAttachmentNr, issueTimeTracked, issuePoints, issueLastSyncedValues, _hideSubTasksMode`

Container state (`TaskState`): `currentTaskId, selectedTaskId, taskDetailTargetPanel, lastCurrentTaskId, isDataLoaded, dismissedCalendarAutoImportEventIdsByProvider`

---

## 40. Entity types in the sync op-log

Authoritative list from `packages/shared-schema/src/entity-types.ts` (`ENTITY_TYPES`). The server rejects unknown entity types, so a new client must use these exact strings.

`TASK, PROJECT, TAG, NOTE, GLOBAL_CONFIG, SIMPLE_COUNTER, WORK_CONTEXT, TIME_TRACKING, TASK_REPEAT_CFG, ISSUE_PROVIDER, PLANNER, MENU_TREE, METRIC, BOARD, SECTION, REMINDER, PLUGIN_USER_DATA, PLUGIN_METADATA, MIGRATION, RECOVERY, ALL`

- `ALL` and `RECOVERY` are special: full-state imports (sync/backup/repair) rather than per-entity ops.
- There is **no** separate worklog, focus-session, schedule-entry or calendar-config entity — those are derived views or nested fields (e.g. worklog is generated from `timeSpentOnDay`, focus sessions/journal live in feature state and config).

---

*This list is intended to be exhaustive. If a feature exists in the original Super Productivity source and is not listed here, that is an omission to be corrected.*
