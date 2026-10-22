# PARITY.md — Feature Parity Tracking

> This file tracks the parity status of every feature enumerated in `FEATURES.md`. Each feature from that list must eventually be marked **Done** here with specifics on how it was implemented.

**App identity:**
- Name: `superprod` (all lowercase)
- Package ID: `com.dwprod.superprod`
- Target: self-hosted server compatible, feature parity with Super Productivity

**How to read this file:**
- Each row = one feature from FEATURES.md
- Status: `TODO` | `In Progress` | `Done` | `N/A` (not applicable to this client)
- When a feature is marked **Done**, include: what was built, what data model it maps to, what UI it has, and any deviations from the original.

---

## 1. Core Task Model

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 1.1 | Task fields (id, title, notes, projectId, tagIds, subTaskIds, issueId, issueProviderId, timeEstimate, timeSpent, timeSpentOnDay, isDone, isFinished, finishedOn, startedOn, created, modified, dueDay, dueWithTime, deadlineDay, plannedAt, plannedDuration, repeatCfgId, repeatFinishedOn, attachments, attachmentsOnDay, spam, priority, context) | TODO | |
| 1.2 | Recursive nested subtasks (any depth, full task model on each) | TODO | |
| 1.3 | Collapsing/expanding subtask trees | TODO | |
| 1.4 | Bulk complete / bulk delete subtasks | TODO | |
| 1.5 | Subtask count visible on parent task | TODO | |
| 1.6 | Drag-and-drop reordering of subtasks | TODO | |
| 1.7 | Inline "Add subtask" in task detail and list | TODO | |
| 1.8 | Multiple list views (Inbox, Today, Scheduled, Planner, Board, Tag, Project, Calendar, Worklog, History, Metric, Habit) | TODO | |
| 1.9 | Drag-and-drop reordering of tasks within a list | TODO | |
| 1.10 | Drag task onto another to make it a subtask | TODO | |
| 1.11 | Multi-select with bulk operations (complete, delete, move to project, add tag, set priority, set time estimate) | TODO | |
| 1.12 | Context menu on each task row (all actions) | TODO | |
| 1.13 | Right-click / long-press context menu on mobile | TODO | |
| 1.14 | Keyboard navigation between task rows | TODO | |
| 1.15 | Filtering by: project, tag, context, due date range, completion status, priority, search text, issue association, time estimate range, time spent range | TODO | |
| 1.16 | Sorting by: due date, creation date, modification date, priority, time estimate, time spent, alphabetically, project, tag | TODO | |
| 1.17 | Global search across all task fields (title, notes, project, tags, issue id) | TODO | |
| 1.18 | Search page with full-text results | TODO | |
| 1.19 | "Today" virtual tag (auto-computed from due dates, planned tasks, manual Today) | TODO | |
| 1.20 | Task count badges on view headers | TODO | |
| 1.21 | Short syntax quick add (#project, @tag, p:N, t:MM:SS, d:DATE, !deadline, r:RECUR, c:CONTEXT, i:ISSUE) | TODO | |
| 1.22 | Short syntax parsed on task creation and inline edit | TODO | |
| 1.23 | Quick-add input with placeholder hints | TODO | |
| 1.24 | Add task via global hotkey | TODO | |
| 1.25 | Add task via system quick capture (sharesheet, global shortcut, share target) | TODO | |
| 1.26 | Task detail panel: edit all fields inline | TODO | |
| 1.27 | Task detail: markdown notes editor with preview | TODO | |
| 1.28 | Task detail: time tracking controls (start/stop/record) | TODO | |
| 1.29 | Task detail: subtask list with inline add/reorder/complete/delete | TODO | |
| 1.30 | Task detail: attachments list with add/remove/download | TODO | |
| 1.31 | Task detail: issue link display + open external issue | TODO | |
| 1.32 | Task detail: completion button with repeat-handling logic | TODO | |
| 1.33 | Task detail: activity / change history for the task | TODO | |
| 1.34 | Mark task done (checkbox, shortcut, swipe on mobile) | TODO | |
| 1.35 | Unmark / undo completion | TODO | |
| 1.36 | On completion: option to reopen, archive, or delete | TODO | |
| 1.37 | Repeating tasks: daily/weekly/monthly/yearly presets | TODO | |
| 1.38 | Repeating tasks: custom recurrence (day-of-week, day-of-month, interval) | TODO | |
| 1.39 | Repeating tasks: "repeat from completion" vs "repeat from original schedule" | TODO | |
| 1.40 | Repeating tasks: repeat configure dialog with preview of next occurrences | TODO | |
| 1.41 | On repeating task completion, auto-create next instance per recurrence rule | TODO | |
| 1.42 | Recurrence config model (type, interval, dayOfWeek, dayOfMonth, endAfterN, endByDate, repeatFromCompletion) | TODO | |
| 1.43 | Archive completed tasks (manual or automatic) | TODO | |
| 1.44 | Archived tasks hidden from main views, accessible via Archive view | TODO | |
| 1.45 | Unarchive / restore archived tasks | TODO | |
| 1.46 | Bulk archive completed tasks | TODO | |
| 1.47 | Auto-archive after N days completed (configurable) | TODO | |
| 1.48 | Archived tasks still sync and are searchable | TODO | |
| 1.49 | Task notes as markdown, persisted per task, synced as part of task payload | TODO | |
| 1.50 | Markdown checklist inside notes (- [ ], - [x]), check/uncheck, progress indicator | TODO | |
| 1.51 | Attachments: attach files, list, open/download, remove, metadata (name/size/type/path) | TODO | |
| 1.52 | Standalone notes (note model: id, title, content, created, modified), notes list view, CRUD | TODO | |
| 1.53 | Work contexts (id, title, color, icon), assign to task, filter by context, sync as own entity | TODO | |
| 1.54 | Projects (id, title, color, icon, description, parentProjectId), CRUD, task assignment, completion tracking, hierarchy | TODO | |
| 1.55 | Tags (id, title, color), CRUD, tag list view, multiple tags per task, filter, colors in rows, virtual "Today" tag, ordinal priority tags | TODO | |
| 1.56 | Planner view: day/week planning grid, drag tasks onto time slots, timeline | TODO | |
| 1.57 | Schedule view: timeline of scheduled tasks for day/week | TODO | |
| 1.58 | Board view: Kanban-style columns (by status, by project) | TODO | |
| 1.59 | Calendar view: day/week/month with due dates and scheduled tasks | TODO | |
| 1.60 | Drag to reschedule (change plannedAt/dueDay) | TODO | |

---

## 2. Time Tracking

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 2.1 | Start/stop/pause tracking on a task | TODO | |
| 2.2 | Track time against a task (task-level timeSpent) | TODO | |
| 2.3 | Track time against a work context (context-level timeSpent) | TODO | |
| 2.4 | Edit/adjust logged time manually | TODO | |
| 2.5 | Time spent displayed on task rows and task detail | TODO | |
| 2.6 | Daily time spent aggregation (timeSpentOnDay map) | TODO | |
| 2.7 | Per-task time spent history | TODO | |
| 2.8 | Only one "current task" tracked at a time | TODO | |
| 2.9 | Starting tracking on new task stops previous tracking | TODO | |
| 2.10 | Tracking tick interval (accumulation granularity) | TODO | |
| 2.11 | Idle time excluded from tracked time when idle detection on | TODO | |
| 2.12 | Tracking state persists across app restarts (resume on start if configured) | TODO | |
| 2.13 | Timer bar / timer section: current tracked task + elapsed (HH:MM:SS), start/stop/switch | TODO | |
| 2.14 | Stop tracking on task completion | TODO | |
| 2.15 | Break time tracked separately, subtracted or reported separately from productive time | TODO | |
| 2.16 | Time estimates (HH:MM or minutes), estimate vs time spent comparison, used in metrics/planner | TODO | |
| 2.17 | Worklog entry (started, ended, timeSpent, taskId, projectId, contextId), worklog list view, filter/sort, export | TODO | |
| 2.18 | History view: past completed tasks with time spent, filter by date range/project/tag, time aggregation totals | TODO | |
| 2.19 | Daily time aggregation (spentTime, breakTime, focusSession time, taskDone count) | TODO | |

---

## 3. Focus Mode & Pomodoro

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 3.1 | Pomodoro mode (fixed work interval + short break + long break after N cycles) | TODO | |
| 3.2 | Flowtime mode (work until you stop, proportional/manual break) | TODO | |
| 3.3 | Countdown mode (single timed session of arbitrary length + break after) | TODO | |
| 3.4 | Preparation screen (choose task before starting) | TODO | |
| 3.5 | Work session screen (timer running, task being tracked) | TODO | |
| 3.6 | Break screen (break timer) | TODO | |
| 3.7 | Session-done screen (summary, option to start next) | TODO | |
| 3.8 | Task-select overlay (pick which task to focus on) | TODO | |
| 3.9 | Focus overlay UI during active session (large timer, progress) | TODO | |
| 3.10 | FocusModeConfig: session mode, work duration, short break duration, long break duration, cycles before long break, auto-start session, auto-start break, auto-start next, skip breaks, sounds | TODO | |
| 3.11 | Focus session records (started, ended, duration, type, taskId, projectId), persisted per day | TODO | |
| 3.12 | Focus session records feed metrics (productivity score, focus time total) | TODO | |
| 3.13 | Focus mode accessible from timer bar / dedicated entry point | TODO | |
| 3.14 | Focus session auto-starts time tracking on chosen task | TODO | |
| 3.15 | Focus mode startable from task detail / task row | TODO | |
| 3.16 | Focus mode local settings (per-device, not synced): last used mode, active session state, break skip preference | TODO | |

---

## 4. Break Reminders / Take-a-Break / Idle

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 4.1 | Break reminder: enable/disable, interval, duration suggestion, notification/sound, skip | TODO | |
| 4.2 | Idle detection: enable/disable, idle timeout threshold, prompt on idle (resume / discard / keep tracking) | TODO | |
| 4.3 | Idle time excluded from tracked time | TODO | |
| 4.4 | Idle time reported in metrics (obstruction time / idle time) | TODO | |
| 4.5 | Idle detection dialog choices (resume, discard idle time, keep tracking) | TODO | |
| 4.6 | Break reminder sound (configurable) | TODO | |

---

## 5. Metrics, Daily Summary, Heatmap

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 5.1 | Daily metrics model (date, spentTime, startedWorking, endedWorking, breakTime, breakNr, taskDone, improvement, productivityScore, obstructionTime, focusSession records, worklog entries) | TODO | |
| 5.2 | Productivity score formula (replicate exact formula from metric service) | TODO | |
| 5.3 | Metrics page: daily summary, heatmap, charts (time spent per day, tasks done per day, focus time, break time), comparison to previous periods, score trend | TODO | |
| 5.4 | Heatmap (calendar heatmap, color intensity by metric, hover/tap day details) | TODO | |
| 5.5 | Daily summary page: today's stats, shown on demand / end of day | TODO | |
| 5.6 | Before-finish-day workflow: prompt to review the day before closing | TODO | |

---

## 6. Simple Counters & Habits

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 6.1 | SimpleCounter model (id, title, icon, type ClickCounter/StopWatch/RepeatCountdown, count, target, streak config, countOnDay) | TODO | |
| 6.2 | Habit list view (habit page), CRUD habits | TODO | |
| 6.3 | Daily count entry, streak display (current, longest, last counted date) | TODO | |
| 6.4 | Counter types: ClickCounter, StopWatch, RepeatCountdown | TODO | |

---

## 7. Scheduling, Calendar & Planner

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 7.1 | Schedule entry model (id, taskId, start datetime, duration, end datetime) | TODO | |
| 7.2 | Scheduled tasks have a planned time slot | TODO | |
| 7.3 | Schedule view: timeline of scheduled tasks for day/week | TODO | |
| 7.4 | Drag a task onto the schedule to create a schedule entry | TODO | |
| 7.5 | Drag to reschedule (change time slot) | TODO | |
| 7.6 | Schedule conflicts/overlaps indicated | TODO | |
| 7.7 | Planner view: day/week grid, drag tasks onto time slots, visualize planned tasks, free slots, week/day view | TODO | |
| 7.8 | Calendar integration providers: Google Calendar, CalDAV, ICS import, Outlook (where supported) | TODO | |
| 7.9 | Import calendar events into app's calendar view | TODO | |
| 7.10 | Two-way or one-way sync per provider | TODO | |
| 7.11 | Display external events alongside scheduled tasks in calendar/schedule/planner views | TODO | |
| 7.12 | Auth per provider (OAuth for Google/Outlook, credentials for CalDAV) | TODO | |
| 7.13 | Polling interval per provider | TODO | |
| 7.14 | Create a task from a calendar event | TODO | |
| 7.15 | Repeating scheduled tasks (next instance inherits/resets schedule per config) | TODO | |

---

## 8. Issue Integrations

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 8.1 | Issue provider model (id, title, type, auth config, base URL, polling interval, features supported) | TODO | |
| 8.2 | Issue model (id, providerId, externalId, title, url, status, assignee, labels) | TODO | |
| 8.3 | Issue providers: GitHub, GitLab, Jira, Gitea, OpenProject, Linear, Trello, CalDAV tasks (and any others from comparison doc) | TODO | |
| 8.4 | Per-provider: import issues, two-way sync, polling, search, create issue from task | TODO | |
| 8.5 | Auth per provider (PAT, OAuth, API key) | TODO | |
| 8.6 | Link task to issue (issueId + issueProviderId on task), display issue status/title/url, open external issue | TODO | |
| 8.7 | Update task from issue changes (e.g. title sync) | TODO | |
| 8.8 | Issue integration service: provider connections, per-provider settings (enabled, auth token, project filter, polling interval, sync direction) | TODO | |
| 8.9 | Issue sync runs on timer / on demand | TODO | |
| 8.10 | Issue state cached locally and synced | TODO | |
| 8.11 | Create issue from task (task title → issue title, store issue url back on task) | TODO | |

---

## 9. Reminders & Notifications

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 9.1 | Reminder model (id, taskId, remindAt, type, recurrent, message, status) | TODO | |
| 9.2 | Reminders attached to a task, remind at specific datetime (dueWithTime based or custom), recurring reminders tied to repeating tasks | TODO | |
| 9.3 | Local notifications (in-app and system), system notifications via platform (Android notification, desktop notification) | TODO | |
| 9.4 | Notifications on: task due, reminder time, tracking timer events, break reminders, idle prompts, before-finish-day, day close | TODO | |
| 9.5 | Notification customization: sound per type, frequency/grouping, quiet hours/DND, notification channels (Android) | TODO | |
| 9.6 | Reminder service: checks due reminders on timer, fires notification at remindAt, handles recurring reminder generation | TODO | |

---

## 10. Sync — SuperSync (self-hosted)

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 10.1 | Operation-based sync (op types: CRT, UPD, DEL, MOV, BATCH, SYNC_IMPORT, BACKUP_IMPORT, REPAIR) | TODO | |
| 10.2 | Operation model (id, clientId, actionType, opType, entityType, entityId, entityIds, payload, vectorClock, timestamp, schemaVersion, isPayloadEncrypted, syncImportReason, repairBaseServerSeq) | TODO | |
| 10.3 | Server assigns strictly increasing per-user server_seq | TODO | |
| 10.4 | Download operations since known sinceSeq | TODO | |
| 10.5 | Vector clocks (per-device causality, merge on download, compare on upload, limit size) | TODO | |
| 10.6 | Conflict detection on upload (CONFLICT_CONCURRENT, CONFLICT_SUPERSEDED) | TODO | |
| 10.7 | Full-state snapshots (initial, recovery, migration; SYNC_IMPORT, BACKUP_IMPORT, REPAIR) | TODO | |
| 10.8 | Import reasons (PASSWORD_CHANGED, FILE_IMPORT, BACKUP_RESTORE, FORCE_UPLOAD, SERVER_MIGRATION, REPAIR) | TODO | |
| 10.9 | Wire format compliance with supersync-http-contract.ts (all request/response schemas) | TODO | |
| 10.10 | JWT bearer authentication (full-access, long-lived token, Authorization: Bearer) | TODO | |
| 10.11 | Login: passkey (WebAuthn) or magic link (email) — via browser flow, copy token back to app | TODO | |
| 10.12 | Registration: passkey or magic-link registration | TODO | |
| 10.13 | Email verification required before account active | TODO | |
| 10.14 | Token replacement (revoke all tokens, sign-out everywhere) | TODO | |
| 10.15 | Account deletion (cascade operations, sync state, devices) | TODO | |
| 10.16 | End-to-end encryption (Argon2id + AES-256-GCM, wire format with salt+IV+ciphertext base64, legacy PBKDF2 fallback) | TODO | |
| 10.17 | Session key caching (salt per session+password, reuse across encrypt calls, clearSessionKeyCache on password change/logout) | TODO | |
| 10.18 | Legacy KDF warning handler (deprecation notice) | TODO | |
| 10.19 | Encryption optional per-snapshot/per-op (isPayloadEncrypted flag) | TODO | |
| 10.20 | E2EE required gate (E2EE_REQUIRED error when account requires encryption) | TODO | |
| 10.21 | Sync provider selection UI (SuperSync primary, WebDAV, file-based, cloud drives as alternatives) | TODO | |
| 10.22 | SuperSync setup flow (choose provider, set server URL, open browser to sign up/in, copy JWT, paste as access token, set encryption password) | TODO | |
| 10.23 | Additional device setup (same server URL + account, same encryption password, do NOT use revoke & replace when adding device) | TODO | |
| 10.24 | Sync status (latestSeq, devicesOnline, snapshotAge, storageUsedBytes, storageQuotaBytes) | TODO | |
| 10.25 | Devices list (clientId, lastSeenAt per device) | TODO | |
| 10.26 | Storage quota (default 100 MB, server-enforced) | TODO | |
| 10.27 | Rate limiting on sync endpoints (client handles 429 retry) | TODO | |
| 10.28 | Conflict/gap detection on download (gapDetected flag) | TODO | |
| 10.29 | WebSocket real-time sync notifications (where server supports it) | TODO | |
| 10.30 | Alternative sync providers: WebDAV (generic, "not recommended"), file-based/local file sync, cloud drives (Dropbox, OneDrive, Google Drive) where supported, Nextcloud, Proton Drive via rclone | TODO | |

---

## 11. Import / Export (IMEX)

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 11.1 | JSON backup import (full app state) | TODO | |
| 11.2 | CSV import (tasks from spreadsheet) | TODO | |
| 11.3 | Calendar import (ICS) | TODO | |
| 11.4 | Issue import from various providers | TODO | |
| 11.5 | JSON backup export | TODO | |
| 11.6 | CSV export (tasks, worklog, history) | TODO | |
| 11.7 | PDF export (task lists, worklog, reports) where supported | TODO | |
| 11.8 | Worklog export | TODO | |
| 11.9 | IMEX settings UI (default formats, auto-backup settings) | TODO | |
| 11.10 | Auto-backup (automatic periodic JSON backup, interval, location, max backups) | TODO | |

---

## 12. Plugins

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 12.1 | Plugin API compliance (manifest, hooks, permissions, UI slots, data persistence, i18n) | TODO | |
| 12.2 | Plugin manifest parsing (name, id, manifestVersion, version, minSupVersion, description, hooks, permissions, iFrame, uiKit, icon) | TODO | |
| 12.3 | Plugin hooks (TASK_COMPLETE, TASK_UPDATE, TASK_DELETE, FINISH_DAY, LANGUAGE_CHANGE, PERSISTED_DATA_CHANGED, ACTION) | TODO | |
| 12.4 | Plugin permissions model (nodeExecution, http+allowedHosts, deleteProject, plus read-only permissions) | TODO | |
| 12.5 | Plugin UI slots (header buttons, menu entries, side panel buttons, keyboard shortcuts, iframe UI, dialogs, snack, notify) | TODO | |
| 12.6 | Plugin data persistence (persistDataSynced, loadSyncedData, scoped to plugin, synced across devices) | TODO | |
| 12.7 | Plugin API capabilities (getTasks, getArchivedTasks, getCurrentContextTasks, getSelectedTask, getFocusedTask, updateTask, addTask, getAllProjects, addProject, deleteProject, getAllTags, addTag, showSnack, notify, openDialog, showIndexHtmlAsView, registerMenuEntry, registerHeaderButton, registerSidePanelButton, registerShortcut, translate, formatDate, getCurrentLanguage, cfg, request, persistDataSynced, loadSyncedData) | TODO | |
| 12.8 | Plugin loading (bundled plugins from BUNDLED_PLUGIN_PATHS/BUNDLED_PLUGIN_IDS, user-installed via zip upload) | TODO | |
| 12.9 | Plugin zip size limits (50 MB zip, 10 MB plugin.js, 100 KB manifest, 100 KB index.html) | TODO | |
| 12.10 | Bundled plugins support (at minimum the GitHub issue provider and any other bundled plugins from the original) | TODO | |

---

## 13. Calendar Integration

(Also covered in 7.8–7.15; duplicated here for the dedicated calendar integration feature area.)

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 13.1 | Google Calendar integration (OAuth, import, two-way where supported) | TODO | |
| 13.2 | CalDAV integration (username/password, calendar URL, import) | TODO | |
| 13.3 | ICS import (file import of .ics) | TODO | |
| 13.4 | Outlook integration (OAuth where supported) | TODO | |
| 13.5 | Display events in calendar/schedule/planner views | TODO | |
| 13.6 | Create task from calendar event | TODO | |
| 13.7 | Polling interval per provider configurable | TODO | |

---

## 14. Keyboard Shortcuts

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 14.1 | Global keyboard shortcuts (add task, toggle focus mode, start/stop tracking, complete current task, navigate views, search, settings, undo, redo) | TODO | |
| 14.2 | In-app keyboard shortcuts (arrow keys/Tab navigate rows, Enter open detail, Space toggle completion, Escape close panels, bulk actions, filtering, sorting) | TODO | |
| 14.3 | Keyboard shortcut customization (Settings → Keyboard, remappable, conflict detection) | TODO | |

---

## 15. Settings & Preferences

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 15.1 | App Features settings (enable/disable features) | TODO | |
| 15.2 | General/Misc settings (language, timezone, start of week, default project/tag/context, task list behavior, confirm on delete/complete, show completed, collapsed sections) | TODO | |
| 15.3 | Time Tracking settings (tracking behavior, idle detection, track context, auto-start tracking, track on complete, time format, tick interval, store per day) | TODO | |
| 15.4 | Tasks settings (task list settings, subtask behavior, repeat config default, due date behavior, spam handling, default estimate, task detail behavior, auto archive) | TODO | |
| 15.5 | Pomodoro/Focus Mode settings (session mode, work duration, short break, long break, cycles before long break, auto-start session/break/next, skip breaks, sounds) | TODO | |
| 15.6 | Reminders settings (enable, sound, notification, due reminder, repeat reminder, quiet hours) | TODO | |
| 15.7 | Schedule settings (schedule view settings, scheduler behavior, drag-to-schedule, default schedule duration) | TODO | |
| 15.8 | Calendar Integration settings (per-provider: Google, CalDAV, ICS, Outlook; polling intervals; sync direction) | TODO | |
| 15.9 | Issue Integrations settings (per-provider: GitHub, GitLab, Jira, etc.; auth tokens; project filters; polling intervals; sync direction) | TODO | |
| 15.10 | Sync & Backup settings (provider selection, server URL, access token, encryption password, backup settings, auto-backup, import/export defaults) | TODO | |
| 15.11 | Keyboard Shortcuts settings (per-action remapping) | TODO | |
| 15.12 | Language settings (language selection, locale) | TODO | |
| 15.13 | Theme/Appearance settings (dark mode, custom theme, CSS variables, background image/unsplash, theme color, font settings) | TODO | |
| 15.14 | Sound settings (task complete, tracking start/stop, focus session events, reminder sound, break reminder sound, notification sounds) | TODO | |
| 15.15 | Idle settings (idle detection enable, idle timeout, idle handling choice) | TODO | |
| 15.16 | Take a Break settings (break reminder enable, interval, duration, sound) | TODO | |
| 15.17 | Simple Counters settings (counter settings, default counter type, streak display) | TODO | |
| 15.18 | Task Widget settings (Android: widget config, update interval, shown fields, colors) | TODO | |
| 15.19 | Short Syntax settings (enabled, default project/tag on quick add, parse behavior) | TODO | |
| 15.20 | Clipboard Images settings (paste images into notes/tasks, image handling) | TODO | |
| 15.21 | Plugins settings (plugin list, enable/disable, upload plugin, bundled plugins) | TODO | |
| 15.22 | Evaluation/Telemetry settings (anonymous usage data, opt-in/opt-out) | TODO | |
| 15.23 | Automatic Backups settings (enable, interval, location, max backups) | TODO | |
| 15.24 | Focus Mode Local settings (per-device: last used mode, active session state, break skip preference; not synced) | TODO | |
| 15.25 | New install app features (first-run feature selection / onboarding choices) | TODO | |
| 15.26 | Task View Customizer (which columns/fields show in task list, order, visibility) | TODO | |
| 15.27 | Mobile settings (mobile-specific preferences) | TODO | |
| 15.28 | Notifications settings (notification permissions, channels, behavior) | TODO | |
| 15.29 | Global config model (full TypeScript interface, defaults, local persistence, synced vs local-only distinction) | TODO | |
| 15.30 | Onboarding / first-run (new-install app features selection, first-run walkthrough, encryption password setup on first sync, server setup flow) | TODO | |

---

## 16. Theme & Appearance

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 16.1 | Dark mode / light mode toggle | TODO | |
| 16.2 | Custom themes (CSS variables) | TODO | |
| 16.3 | Theme color picker | TODO | |
| 16.4 | Background image (Unsplash integration or local image) | TODO | |
| 16.5 | Font settings | TODO | |
| 16.6 | Accent color | TODO | |
| 16.7 | Theme persisted in global config, system preference detection | TODO | |

---

## 17. Views & Layout

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 17.1 | All main views/pages (Today, Inbox, Scheduled, Planner, Schedule, Board, Project, Tag, Calendar, Worklog, History, Metric, Habit, Notes, Archive, Search, Settings, Onboarding, Plugin views) | TODO | |
| 17.2 | Side navigation / bottom navigation (mobile) | TODO | |
| 17.3 | Task list panel | TODO | |
| 17.4 | Task detail panel (slide-out) | TODO | |
| 17.5 | Bottom panel / secondary panel (calendar, worklog, etc.) | TODO | |
| 17.6 | Header with view title, actions, search | TODO | |
| 17.7 | Timer bar (persistent timer display) | TODO | |
| 17.8 | Menu tree / navigation tree | TODO | |
| 17.9 | Responsive layout (web) + adaptive layout (mobile) | TODO | |
| 17.10 | Task view customizer (choose columns/fields, reorder, toggle visibility) | TODO | |

---

## 18. Android-specific features

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 18.1 | Android permissions (notifications, exact alarm, foreground service, internet, storage/filesystem, boot receiver, vibration, connectivity) | TODO | |
| 18.2 | Foreground service for time tracking / sync continuity | TODO | |
| 18.3 | Notification listener (where applicable) | TODO | |
| 18.4 | Boot receiver (restart services after boot) | TODO | |
| 18.5 | Alarm receiver for exact reminders | TODO | |
| 18.6 | Widget provider / widget update service | TODO | |
| 18.7 | Home screen widget (today's tasks, upcoming, tracked task), configurable update interval, tap actions, widget configuration, multiple sizes | TODO | |
| 18.8 | Local notifications for reminders, scheduled notifications (exact alarm), notification channels, notification actions (complete, snooze), foreground service notification | TODO | |
| 18.9 | Capacitor plugins (notifications, local notifications, app lifecycle, filesystem, platform) | TODO | |
| 18.10 | Capacitor config | TODO | |
| 18.11 | Android interface (native module bridge) | TODO | |
| 18.12 | Share target / intent filter (receive shared content as quick capture) | TODO | |
| 18.13 | Deep links / app-uri-actions | TODO | |
| 18.14 | Mobile touch UI (swipe to complete, swipe to delete, long-press context menu) | TODO | |
| 18.15 | Mobile navigation (bottom nav) | TODO | |
| 18.16 | Mobile settings (mobile-specific preferences) | TODO | |
| 18.17 | Mobile keyboard handling | TODO | |
| 18.18 | Offline behavior optimized for mobile | TODO | |

---

## 19. Desktop (Electron) features — N/A unless targeting desktop

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 19.1 | System tray (minimize to tray) | N/A unless desktop | |
| 19.2 | OS-level global keyboard shortcuts | N/A unless desktop | |
| 19.3 | Local REST API (localhost server for integration) | N/A unless desktop | |
| 19.4 | MCP (Model Context Protocol) server | N/A unless desktop | |
| 19.5 | Desktop idle detection via OS API | N/A unless desktop | |
| 19.6 | Native notifications via Electron | N/A unless desktop | |
| 19.7 | App auto-update | N/A unless desktop | |
| 19.8 | Native file dialogs | N/A unless desktop | |
| 19.9 | Remember window size/position | N/A unless desktop | |
| 19.10 | Multi-window support | N/A unless desktop | |

---

## 20. Language & Localization

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 20.1 | Supported languages (English, German, + all locales in src/assets/i18n/) | TODO | |
| 20.2 | i18n JSON files per locale, translation keys for all UI strings | TODO | |
| 20.3 | Language selectable in Settings → Language | TODO | |
| 20.4 | formatDate, translate, getCurrentLanguage in plugin API | TODO | |
| 20.5 | Date/time formatting per locale, number formatting per locale | TODO | |

---

## 21. Accessibility

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 21.1 | Accessibility states for tasks (done, in-progress, overdue, tracked, focused) | TODO | |
| 21.2 | Screen-reader-friendly labels where implemented | TODO | |
| 21.3 | Keyboard-navigable UI | TODO | |
| 21.4 | Color not the only indicator (priority shown with text/icon as well) | TODO | |
| 21.5 | High-contrast considerations | TODO | |

---

## 22. Daily workflow features

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 22.1 | Before-finish-day prompt (review today's tasks, log time, finish incomplete tasks; configurable prompt time/trigger) | TODO | |
| 22.2 | Finish day before close (auto-finish day when closing app; worklog finalization, daily summary, metrics update) | TODO | |
| 22.3 | Add tasks for tomorrow (suggestion at end of day, carry-over of unfinished tasks) | TODO | |
| 22.4 | Daily summary (end-of-day summary view, metrics, productivity score, task done count, time spent, focus sessions) | TODO | |

---

## 23. Anti-Procrastination

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 23.1 | Anti-procrastination feature (prompts when task pending for a while, encourage/nudge to start tracking, configurable thresholds) | TODO | |

---

## 24. Tracking Presence & Tracking Reminder

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 24.1 | Tracking presence indicator (is user currently tracking?) | TODO | |
| 24.2 | Tracking reminder (nudge if no tracking started and tasks due; configurable) | TODO | |

---

## 25. Agent / Assistant Capture

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 25.1 | Agent task capture integration (Claude, ChatGPT, Claude Code via OAuth capture connector) | TODO | |
| 25.2 | /api/capture/* endpoints on server (when CAPTURE_CONNECTOR_ENABLED) | TODO | |
| 25.3 | Capture grants, capture tokens, capture connect codes | TODO | |
| 25.4 | Agent submits tasks to inbox via capture | TODO | |
| 25.5 | Capture feature toggle in settings | TODO | |

---

## 26. Native Capture

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 26.1 | Quick-capture from system (sharesheet, global shortcut, share target) | TODO | |
| 26.2 | Captured text becomes a task in inbox | TODO | |
| 26.3 | Native capture bridge (android-interface, capacitor plugins) | TODO | |

---

## 27. Search

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 27.1 | Global search page | TODO | |
| 27.2 | Search across tasks (title, notes, project, tags, issue id, context) | TODO | |
| 27.3 | Search across notes | TODO | |
| 27.4 | Search across archived tasks | TODO | |
| 27.5 | Search results grouped/filterable | TODO | |
| 27.6 | Search keyboard shortcut | TODO | |

---

## 28. Collaboration / Sharing

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 28.1 | Multi-device sync (via SuperSync or other providers) | TODO | |
| 28.2 | Share task via deep link / URI | TODO | |
| 28.3 | Share target (receive shared content) | TODO | |
| 28.4 | Capture connector for AI assistants (agent task capture) | TODO | |

---

## 29. Data management

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 29.1 | IndexedDB for local data (task store, project store, tag store, note store, settings, sync state, op-log, encryption keys) | TODO | |
| 29.2 | Op-log local persistence (pending operations, applied operations, vector clock) | TODO | |
| 29.3 | Local recovery points (snapshots) for disaster recovery | TODO | |
| 29.4 | "Manage Your Data" section (export JSON/CSV, import, delete all data, restore from backup, backup management) | TODO | |
| 29.5 | Sync storage quota (server-enforced, default 100 MB) | TODO | |
| 29.6 | Local storage management | TODO | |

---

## 30. Sync state & conflict handling

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 30.1 | Per-device vector clock, merge on download, compare on upload, limit size | TODO | |
| 30.2 | Server detects concurrent vs superseded uploads | TODO | |
| 30.3 | Client handles rejected operations (retry with new clock, merge, prompt) | TODO | |
| 30.4 | Download-side concurrency handling | TODO | |
| 30.5 | Full-state snapshot as fallback for repair | TODO | |
| 30.6 | Sync planning (plan regular ops after full-state upload, plan snapshot hydration) | TODO | |
| 30.7 | Sync interval/trigger (on change, on timer, on reconnect) | TODO | |
| 30.8 | Offline behavior (queue operations, sync when online) | TODO | |

---

## 31. Error handling & status

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 31.1 | All error codes handled (VALIDATION_FAILED, INVALID_OP_ID, INVALID_OP_TYPE, INVALID_ENTITY_TYPE, INVALID_ENTITY_ID, INVALID_PAYLOAD, PAYLOAD_TOO_LARGE, INVALID_VECTOR_CLOCK, INVALID_TIMESTAMP, MISSING_ENTITY_ID, INVALID_SCHEMA_VERSION, INVALID_CLIENT_ID, CONFLICT_CONCURRENT, CONFLICT_SUPERSEDED, REPAIR_STALE, DUPLICATE_OPERATION, SYNC_IMPORT_EXISTS, RATE_LIMITED, STORAGE_QUOTA_EXCEEDED, ENCRYPTED_OPS_NOT_SUPPORTED, E2EE_REQUIRED, CLIENT_UPDATE_REQUIRED, INTERNAL_ERROR) | TODO | |
| 31.2 | User-facing error messages | TODO | |
| 31.3 | Retry logic for failed uploads/downloads | TODO | |

---

## 32. First-run / onboarding flow

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 32.1 | New-install app features selection | TODO | |
| 32.2 | Feature onboarding (which features to enable) | TODO | |
| 32.3 | Sync setup onboarding | TODO | |
| 32.4 | Encryption password setup | TODO | |
| 32.5 | Language selection | TODO | |
| 32.6 | Theme selection | TODO | |

---

## 33. Accessibility & states

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 33.1 | Task states (active, completed, overdue, tracked, focused, scheduled, repeating, archived) | TODO | |
| 33.2 | Visual indicators for each state | TODO | |
| 33.3 | Accessibility labels for state icons | TODO | |

---

## 34. Miscellaneous platform features

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 34.1 | Clipboard image paste (into notes/task notes) | TODO | |
| 34.2 | Share / deep link handling | TODO | |
| 34.3 | App URI actions | TODO | |
| 34.4 | App lifecycle handling (background/foreground) | TODO | |
| 34.5 | Boot receiver (Android) | TODO | |
| 34.6 | Exact alarm (Android) | TODO | |
| 34.7 | Foreground service (Android) | TODO | |
| 34.8 | Widget (Android) | TODO | |
| 34.9 | Local notifications (Android/Capacitor) | TODO | |
| 34.10 | System notifications (desktop/Capacitor) | TODO | |

---

## 35. Plugin-provided features (bundled plugins)

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 35.1 | GitHub issue provider (bundled plugin) | TODO | |
| 35.2 | Automations plugin | TODO | |
| 35.3 | SolidJS boilerplate plugin | TODO | |
| 35.4 | Other bundled plugins from BUNDLED_PLUGIN_IDS | TODO | |

---

## 36. End-to-end encryption (detailed)

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 36.1 | Encryption password separate from login credentials, not recoverable | TODO | |
| 36.2 | Operation payloads encrypted before upload | TODO | |
| 36.3 | Server stores only encrypted payloads + plaintext causal metadata | TODO | |
| 36.4 | Encryption key derived from password via Argon2id (OWASP 2023 mobile params) | TODO | |
| 36.5 | Session key cache for performance | TODO | |
| 36.6 | Legacy PBKDF2 ciphertexts still decryptable | TODO | |
| 36.7 | E2EE required gate per account | TODO | |

---

## 37. Server self-hosting compatibility (client requirements)

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 37.1 | Compatible with SuperSync server (Fastify + PostgreSQL + Prisma) | TODO | |
| 37.2 | Auth: passkey (WebAuthn) + magic link, JWT tokens | TODO | |
| 37.3 | Sync endpoints (/api/sync/ops POST/GET, /api/sync/status, /api/sync/devices) | TODO | |
| 37.4 | Snapshot endpoints (POST /api/sync/snapshot) | TODO | |
| 37.5 | Auth endpoints (/api/register/passkey/*, /api/register/magic-link, /api/login/passkey/*, /api/login/magic-link*, /api/verify-email, /api/recover/passkey*, /api/replace-token, /api/account DELETE) | TODO | |
| 37.6 | Capture endpoints (/api/capture/*, /mcp when enabled) | TODO | |
| 37.7 | Compatible with Docker Compose deployment (SuperSync + PostgreSQL + Caddy TLS) | TODO | |
| 37.8 | SMTP requirement understood (sign-up/login/recovery emails) | TODO | |
| 37.9 | ALLOWED_EMAILS for private installs understood | TODO | |
| 37.10 | CORS_ORIGINS for web app hosting understood | TODO | |
| 37.11 | WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN for passkeys understood | TODO | |
| 37.12 | JWT_SECRET (min 32 chars), POSTGRES_PASSWORD understood | TODO | |
| 37.13 | DOMAIN + PUBLIC_URL (HTTPS required in production) understood | TODO | |
| 37.14 | PostgreSQL 16+ (14/15 supported) understood | TODO | |
| 37.15 | AMD64 Linux host for Docker deployment understood | TODO | |

---

## 38. Error codes the client must handle

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 38.1 | All error codes from FEATURES.md section 38 handled | TODO | |

---

## 39. Task model fields (consolidated reference)

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 39.1 | All task model fields from FEATURES.md section 39 implemented | TODO | |

---

## 40. Entity types in the sync op-log

| # | Feature | Status | Implementation notes |
|---|---------|--------|----------------------|
| 40.1 | All entity types from FEATURES.md section 40 supported (Task, Project, Tag, Note, Context, SimpleCounter, Metric, Worklog, Focus session, Schedule, Calendar integration config, Issue integration config/issue cache, Plugin data, Settings/global config, Recovery point/snapshot metadata) | TODO | |

---

*Last updated: initial parity tracking file created. All items TODO until implemented.*
