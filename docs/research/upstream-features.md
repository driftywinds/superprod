# Upstream Super Productivity — Feature Inventory

Implementation-facing inventory for the Flutter rewrite. All paths are relative to
`original source code/`.

- **Local clone: v19.2.0** (`package.json` → `"version": "19.2.0"`). No changelog is vendored,
  so version differences can only be inferred from code comments and issue references.
- **Upstream stable: v20.0.0 (released 2026-11-06)** — newer than this clone. Anything below
  should be re-verified against v20.0.0 before it is treated as final, especially the
  task-focused areas listed in §0.1.
- Persisted entity set (must match): `TASK, PROJECT, TAG, NOTE, GLOBAL_CONFIG, SIMPLE_COUNTER,
  WORK_CONTEXT, TIME_TRACKING, TASK_REPEAT_CFG, ISSUE_PROVIDER, PLANNER, MENU_TREE, METRIC,
  BOARD, SECTION, REMINDER, PLUGIN_USER_DATA, PLUGIN_METADATA, MIGRATION, RECOVERY, ALL`.

Depth is deliberate: tasks, organization, recurrence, short syntax and planning views are
specified to implementation level; time tracking, metrics, counters, plugins, issue
providers, widgets, im/export and theming are inventory-level only.

---

## 0. Version drift (v19.2.0 clone → v20.0.0 stable)

### 0.1 Task-related areas most likely to have moved

Derived from how "recently added" the code presents itself in this clone (comments call these
out as new, opt-in, or version-gated). Re-check each against v20.0.0:

| Area | Evidence in this clone | Risk if stale |
|---|---|---|
| Priority field + icon presets | "Clients predating priorities ignore the field"; `priority?: TaskPriority \| 'high'\|'medium'\|'low' \| null`; `tasks.priorityIconPreset` typed as opaque string for forward-compat (`task.model.ts:102`, `global-config.model.ts:87`) | Encoding, filter presets, menu ordering |
| Task view customizer (view editor) | per-context sort/group/filter; `NO_TAG_GROUP_ID` sentinel | Option lists, persistence key |
| Sections | whole `section` entity + drag-between-sections | Placement in work view |
| Recurrence edge rules | `monthlyWeekOfMonth`/`monthlyWeekday` ("issue #6040"), `monthlyLastDay` ("#7726"), `repeatUntilDay` ("#10091"), `skipOverdue` ("safe baseline only") | Occurrence computation |
| Short-syntax recurrence + nth weekday | `@every …`, `@2monday`, `dueTimeStr` DST handling — all documented as recently added | Parser grammar |
| Deadline + deadline reminders | `deadlineRemindAt`, `_deadline` notification ids, "absent in events queued by an APK that predates deadline notifications" | Reminder model |
| Task multi-select + bulk actions | `taskMultiSelectService.isBulkFeedbackSuppressed()`, multi-drag preview | Bulk surface |
| Board panel sort/filter fields | `sortBy`/`sortDir`, `backlogState`, `includedTagsMatch`, legacy `sortByDue` migration | Panel cfg shape |
| Day-start offset with minute precision | `startOfNextDayTime` canonical, `startOfNextDay` deprecated | Logical-day math |

### 0.2 What is unlikely to move

Entity identity and persistence keys, `TODAY` as a virtual tag, `dueDay`/`dueWithTime`
mutual exclusivity, the reminder option ids (`m5…w1`), the short-syntax trigger characters
(`+ # @ !`), the worklog column set, the sync provider ids.

---

## 1. Navigation IA

Route table `src/app/app.routes.ts`; context child routes `src/app/routes/context.routes.ts`;
page barrel `src/app/routes/pages.routes.ts`. Side-nav IA
`src/app/core-ui/magic-side-nav/magic-nav-config.service.ts`. Mobile bar
`src/app/core-ui/mobile-bottom-nav/mobile-bottom-nav.component.ts` + `mobile-bottom-nav-slot.ts`.

### 1.1 Side nav, exact order

| # | Item | Route / action | Source |
|---|---|---|---|
| 1 | Today (virtual `TODAY` tag) | `/tag/TODAY/tasks` | `magic-nav-config.service.ts:372` |
| 2 | Inbox (project `INBOX`) | `/project/INBOX/tasks` | `:390` |
| 3 | Planner *(`isPlannerEnabled`)* | `/planner` | `:409` |
| 4 | Schedule *(`isSchedulerEnabled`)* | `/schedule` | `:421` |
| 5 | Boards *(`isBoardsEnabled`)* | `/boards` | `:432` |
| 6 | Habits *(`isHabitsEnabled`)* | `/habits` | `:443` |
| 7 | Plugin menu entries | plugin callback | `:457` |
| 8 | Projects tree + `visibility`, `create folder`, `create project` | tree | `:166` |
| 9 | Tags tree + `create folder`, `create tag` | tree | `:204` |
| 10 | Search *(`isSearchEnabled`)* | `/search` | `:237` |
| 11 | Donate *(`isDonatePageEnabled`, hidden on iOS/macOS)* | `/donate` | `:253` |
| 12 | Help menu: get help online, report a problem, send feedback, contribute, Reddit, quick tour, create-task tour, keyboard tour | external / tours | `:265` |
| 13 | Settings | `/config` | `:336` |

Mechanics: collapsed rail 56 px ↔ resizable 190–400 px (default 260, collapse <150, expand
>180), persisted in `LS.NAV_SIDEBAR_WIDTH` / `LS.NAV_SIDEBAR_EXPANDED`; below 600 px it becomes
a 300 px swipe-dismissable overlay that pushes a history state so Android back closes it
(`magic-side-nav.component.ts:48`, `:313`, `:335`, `:362`). Tree expansion persisted in
`LS.IS_PROJECT_LIST_EXPANDED` / `LS.IS_TAG_LIST_EXPANDED`. Tasks can be dropped onto a project
row (move) or a tag row (toggle membership; Today = schedule for today)
(`magic-side-nav.component.ts:674`).

### 1.2 Every top-level view and its sub-screens

| View | Route | Content | Source |
|---|---|---|---|
| Today work view | `/tag/TODAY/tasks` | see §2.17 | `src/app/pages/tag-task-page/` |
| Project work view | `/project/:id/tasks` | same as Today plus Backlog split pane, archived/complete notice banner with restore | `src/app/pages/project-task-page/` |
| Tag work view | `/tag/:id/tasks` | same, no backlog | `src/app/pages/tag-task-page/` |
| History (per context) | `/tag/:id/history`, `/project/:id/history`; `/worklog` and `/quick-history` redirect here | year → month → week tables, per-day rows, totals, per-month/week export | `src/app/features/history/history.component.*`, `context.routes.ts:7` |
| Daily summary | `/…/daily-summary`, `/…/daily-summary/:dayStr` | header celebration, start/end, tasks completed, spent/estimate, break, focus summary; tab 1 Review tasks (+week strip), tab 2 Evaluate day (impact, energy, reflections, notes, plan tomorrow) | `src/app/pages/daily-summary/` |
| Metrics | `/…/metrics` | context table, global metrics, evaluation over time, focus trends, counters, heatmap, impact stars, reflections | `src/app/pages/metric-page/`, `src/app/features/metric/` |
| Planner | `/planner` | multi-day plan (§2.17.4) | `src/app/features/planner/` |
| Schedule | `/schedule` | week / day / month (§2.17.5) | `src/app/features/schedule/` |
| Boards | `/boards` | board selector + N-column panel grid | `src/app/features/boards/` |
| Habits | `/habits` | simple-counter habit tracker | `src/app/pages/habit-page/` |
| Search | `/search` | one query over tasks, projects, tags, notes, archived, recently deleted; "include completed" toggle | `src/app/pages/search-page/` |
| Scheduled list | `/scheduled-list` | all recurring tasks, inline title edit, repeat tooltip, delete | `src/app/pages/scheduled-list-page/` |
| Archived projects | `/archived-projects` | archived + completed, unarchive, delete | `src/app/pages/archived-projects-page/` |
| Settings | `/config` | 6 tabs (§2.5) | `src/app/pages/config-page/`, `global-config-form-config.const.ts` |
| Work-context settings | `/active`, `/active/:subPageType`, `/active/:subPageType/:param` | rendered by `ConfigPageComponent` for the active context | `app.routes.ts:132` |
| Plugin page | `/plugins/:pluginId/index` | plugin iframe | `app.routes.ts:126` |
| Donate / contrast-test | `/donate`, `/contrast-test` | static / QA | `pages/donate-page/`, `app.routes.ts:119` |
| Wildcard | `**` | default start page: Today 0, Inbox 1, Planner 2, Schedule 3, Boards 4, or a project id | `app.routes.ts:151`, `default-start-page.const.ts` |

### 1.3 Mobile bottom bar (<600 px)

Today · add-task FAB · configurable slot · right-panel menu · side-nav toggle.
Slot options: Planner (default), Inbox, Boards, Schedule, Search, any plugin entry;
device-local in `LS.BOTTOM_NAV_SLOT`; long-press opens the picker
(`mobile-bottom-nav-slot.ts:37`). The panel menu is the only route to right-panel toggles at
this width: schedule-day panel, issue panel, project notes, plugin side panels
(`mobile-bottom-nav.component.ts:136`).

### 1.4 Always-rendered chrome

Header (`src/app/core-ui/main-header/`): page title, play/pause, tracked-task pill, focus-mode
button, desktop panel buttons, sync icon. Right panel host
`src/app/features/right-panel/right-panel.component.ts`: task detail, notes, issue panel,
schedule-day panel, plugin side panels. Bottom panel host
`src/app/features/bottom-panel/bottom-panel-container.component.ts`: add-task bar.

---

## 2. Domain inventory

### 2.1 TASK — fields

`src/app/features/tasks/task.model.ts` (`TaskCopy` / `Task`, extends plugin-api `Task` in
`packages/plugin-api/src/types.ts:314`).

| Field | Type | Notes |
|---|---|---|
| `id` | string | nanoid; recurring instances `rpt_<cfgId>_<YYYY-MM-DD>` (`get-repeatable-task-id.util.ts`) |
| `title` | string | short-syntax stripped before persist |
| `notes` | string? | markdown when `tasks.isMarkdownFormattingInNotesEnabled`; `- [ ]` checklists are parsed (`src/app/features/markdown-checklist/`) |
| `timeEstimate`, `timeSpent` | ms | |
| `timeSpentOnDay` | `{YYYY-MM-DD: ms}` | worklog source |
| `isDone`, `doneOn` | bool, ms? | |
| `wontDoOn` | ms? | counts only while `=== doneOn`; read via `isWontDoTask()` |
| `projectId` | string \| null | Inbox when unfiled |
| `tagIds` | string[] | never contains `'TODAY'` |
| `parentId`, `subTaskIds` | string?, string[] | one nesting level |
| `created`, `updated`, `modified` | ms | |
| `dueDay` | `YYYY-MM-DD` \| null | mutually exclusive with `dueWithTime` |
| `dueWithTime` | ms \| null | **read first** |
| `hasPlannedTime` | bool? | `false` = day-only (implied 9:00 downstream) |
| `deadlineDay` / `deadlineWithTime` | same pattern | |
| `deadlineRemindAt` | ms \| null | deadline reminder |
| `remindAt` | ms? | schedule reminder |
| `reminderId` | string? | legacy |
| `repeatCfgId` | string? | |
| `priority` | `1\|2\|3` \| `'low'\|'medium'\|'high'` \| null | 3 = high; legacy strings tolerated |
| `attachments` | `TaskAttachment[]` | `tasks/task-attachment/task-attachment.model.ts` |
| `issueId, issueProviderId, issueType, issueWasUpdated, issueLastUpdated, issueAttachmentNr, issueTimeTracked, issuePoints, issueLastSyncedValues` | | issue link |
| `_hideSubTasksMode` | `1` HideDone \| `2` HideAll | UI-only, persisted |

Search index uses `searchText` = lowercase `title + notes`
(`src/app/pages/search-page/search-page.model.ts`).

### 2.2 TASK — user actions

Source: context menu (`tasks/task-context-menu/task-context-menu-inner/…html`), service
(`tasks/task.service.ts`), detail panel (`tasks/task-detail-panel/`), multi-select bar
(`tasks/task-multi-select-bar/`).

- **Create** — add-task bar (§2.17.2), inline add, subtask, duplicate (`Ctrl+D`), from issue
  search, from calendar event, from Android share, from app-URI action, from markdown paste,
  from clipboard image, from a dropped file/image onto a task row.
- **Edit** — title inline, notes, estimate (dialog / custom / clear), tags (toggle menu with
  create), due date + optional time, reminder option, deadline + reminder option, priority,
  project, repeat config.
- **State** — toggle done, undo done, mark "won't do" (keeps `doneOn` + `wontDoOn`), move done
  to archive (single, bulk, or the whole day via Finish day), restore from archive, restore from
  "recently deleted" (10-entry ring, `tasks/recently-deleted/`).
- **Structure** — add subtask, convert to parent task, move to top / bottom / up / down, drag
  reorder within a list, drag across lists (Today, project, tag, section, board panel, planner
  day, backlog), move to / from backlog, remove from Today.
- **Multi-select** — `X` enters selection mode; selections drag as a group; bar offers
  schedule, unschedule, add to My Day, set/remove deadline, mark done/undone, move to
  backlog/regular, estimate, priority, tags, move to project, delete, clear.
- **Time** — start/stop tracking, add/remove time spent, round time spent for a day.
- **Issue** — open issue, update issue data, mark updates read, submit worklog.
- **Attachments** — add file/link/image, edit, remove, open.
- **Delete** — with confirmation when `tasks.isConfirmBeforeDelete`; deleting an occurrence of a
  recurring task adds its date to `repeatCfgId.deletedInstanceDates`.
- **Plugin** — entries from `registerTaskContextMenuEntry`.

### 2.3 TASK — task row anatomy

`src/app/features/tasks/task/task.component.html` (hot path — one per row).

| Region | Behaviour |
|---|---|
| Swipe wrapper | swipe right = toggle done, swipe left = open context menu; disabled while title editing or in touch selection mode |
| Done toggle | tri-state: undone / done / won't-do; shows current-task ring; done/undone animations; in selection mode replaced by a selection ring (a check would read as "done") |
| Parent breadcrumb | shown when a subtask appears in a flat list (`!isInSubTaskList && parentId`) |
| Title | inline editable; read-only in touch selection mode; click clears selection |
| Tag row | project tag, tags, repeat icon, issue icon — hidden inside a subtask list |
| Time | `timeSpent / timeEstimate`; click opens the estimate dialog (only when the task has no subtasks); parent tasks instead show subtask total spent / remaining |
| Hover controls | start/stop, add to Today / remove from Today, select (hover-capable pointers only) |
| Buttons | attachments (if any), schedule (alarm + time badge when `remindAt`; sun icon when today; date badge when day-only; conflict tooltip), time-conflict icon, deadline (flag; warn when overdue, accent when approaching; time or day badge), checklist progress badge (`done/total`), detail-panel toggle (accent "update" icon when the issue changed) |
| Priority indicator | chevrons or numbers per `tasks.priorityIconPreset` |
| Progress bar | shown while the task is the current tracked task |
| Subtask block | toggle with progress badge (`+`, `−`, filled `−` when done-hidden), nested `task-list` (SUB), add-subtask input |
| Drag-over state | "drop to add as attachment" message |
| Overlays | context menu, project picker menu, tag toggle menu |

### 2.4 TASK — list anatomy

`src/app/features/tasks/task-list/task-list.component.html` + `.ts`.

- One `cdkDropList` per list id; lists register with `DropListService` and are interconnected
  (`dropListService.dropLists`). List ids (`ListModelId`): `UNDONE`, `DONE`, `BACKLOG`,
  `OVERDUE`, `LATER_TODAY`, `ADD_TASK_PANEL`, `SUB`, plus a section id.
- Sorting disabled for `LATER_TODAY` and in touch selection mode; drag delay on touch; vertical
  lock on xs.
- "Active drag anchor" is passed to the drop handler (`getAnchorFromDragDrop`) so a drop
  computes the target index inside `taskIds`.
- When a list is in hide-done / hide-all mode, a "show hidden subtasks (n)" expander is rendered
  above it.
- Empty state comes from `noTasksMsg`.
- Drag into a list from elsewhere can rewrite semantics: onto a tag list → tag membership, onto
  a board panel → tag rewrite to satisfy the panel filter (`boards.util.ts:rewriteTagIdsForPanel`),
  onto a planner day → `planTaskForDay`, onto backlog → move to backlog.
- Multi-drag: when >1 tasks are selected, the drag preview is a stacked summary card and the
  drop moves the whole set.

### 2.5 GLOBAL_CONFIG

Model `src/app/features/config/global-config.model.ts`; defaults
`default-global-config.const.ts`. Sections:

| Section | Fields (default) |
|---|---|
| `appFeatures` | `isTimeTrackingEnabled, isFocusModeEnabled, isSchedulerEnabled, isPlannerEnabled, isBoardsEnabled, isScheduleDayPanelEnabled` (legacy), `isIssuesPanelEnabled, isProjectNotesEnabled, isSyncIconEnabled, isSearchEnabled, isDonatePageEnabled, isHabitsEnabled, isFinishDayEnabled` — all `true` |
| `tasks` | `isConfirmBeforeDelete(true), isAutoAddWorkedOnToToday(true), isAutoMarkParentAsDone(false), isTrayShowCurrent(true), defaultProjectId(INBOX), isMarkdownFormattingInNotesEnabled(true), notesTemplate, priorityIconPreset('chevrons')` |
| `shortSyntax` | `isEnableProject(true), isEnableDue(true), isEnableDeadline(false), isEnablePriority(true), isEnableTag(true), urlBehavior('keep')` |
| `localization` | `lng, dateTimeLocale, firstDayOfWeek` (undefined = system, null = reset) |
| `misc` | `isConfirmBeforeExit(false), isConfirmBeforeExitWithoutFinishDay(true), isMinimizeToTray, isCheckForUpdates, isTrayShowCurrentCountdown, startOfNextDay(0), startOfNextDayTime('00:00'), isDisableAnimations, isVerticalActionBar, isDisableCelebration(true), isShowProductivityTipLonger, customTheme, defaultStartPage(0), backgroundImageDark/Light, backgroundOverlayOpacity, backgroundImageBlur, unsplashApiKey, isUseCustomWindowTitleBar` |
| `evaluation` | `isHideEvaluationSheet` |
| `idle` | `isEnableIdleTimeTracking(true), minIdleTime(5 m), isOnlyOpenIdleWhenCurrentTask(false), isSuppressIdleDuringFocusMode(true)` |
| `takeABreak` | `isTakeABreakEnabled(true), isLockScreen, isTimedFullScreenBlocker, timedFullScreenBlockerDuration, isFocusWindow, takeABreakMessage, takeABreakMinWorkingTime(60 m), takeABreakSnoozeTime(15 m), motivationalImgs[]` |
| `pomodoro` | `duration(25 m), breakDuration(5 m), longerBreakDuration(15 m), cyclesBeforeLongerBreak(4)` |
| `flowtime` | `isBreakEnabled(false), breakMode('ratio'\|'rule'), breakPercentage(20), breakRules[]` |
| `focusMode` | `isShowPreparation(false), focusModeSound('off'\|'tick'\|'whiteNoise'), focusModeSoundVolume(40), isPauseTrackingDuringBreak(true), autoStartFocusOnPlay(false), isManualBreakStart(false)` (+ deprecated `isSkipPreparation`, `isPlayTick`, `isStartInBackground`) |
| `keyboard` | ~65 bindings, `default-global-config.const.ts:141` |
| `localBackup` | `isEnabled(true), maxBackupFiles` |
| `sound` | `volume(75), isIncreaseDoneSoundPitch(true), doneSound, breakReminderSound, trackTimeSound` |
| `timeTracking` | `defaultEstimate(0), defaultEstimateSubTasks(0), isNotifyWhenTimeEstimateExceeded(true), isAutoStartNextTask(false), isTrackingReminderEnabled(false), isTrackingReminderShowOnMobile(false), trackingReminderMinTime(5 m), isTrackingReminderNotify, isTrackingReminderFocusWindow` |
| `reminder` | `isCountdownBannerEnabled(true), countdownDuration(10 m), defaultTaskRemindOption('AtStart'), disableReminders, isFocusWindow, useAlarmStyleReminders` (Android), `notifyOnDueDate(true), dueDateNotificationHour(9)` |
| `schedule` | `isWorkStartEndEnabled(true), workStart('9:00'), workEnd('17:00'), isLunchBreakEnabled(false), lunchBreakStart('13:00'), lunchBreakEnd('14:00')` |
| `sync` | `isEnabled, isEncryptionEnabled, isCompressionEnabled, isUseSplitSyncFiles, syncProvider, syncInterval, isManualSyncOnly, captureKey` + view-model `webDav, superSync, localFileSync, nextcloud, oneDrive` |
| `dailySummaryNote` | `txt, lastUpdateDayStr` |
| `clipboardImages` | `imagePath` |
| `dominaMode` | deprecated; migrated to the voice-reminder plugin |

Settings page tabs: General (theme picker, app features, language, misc, task widget, keyboard,
clipboard images) · Tasks (task settings, short syntax) · Time & Tracking (time tracking, idle,
schedule, reminder) · Productivity (focus mode, focus-mode local, take-a-break, evaluation) ·
Plugins · Sync & Backup (`global-config-form-config.const.ts`).
Device-local (never synced): `taskWidget`, `focusModeLocal`, theme selection
(`LS.CUSTOM_THEME`), dark mode (`LS.DARK_MODE`), nav width/expanded, bottom-nav slot,
task-view customizer state per context.

### 2.6 PROJECT

`src/app/features/project/project.model.ts`: `id, title, isArchived?, isDone?, doneOn?,
isHiddenFromMenu?, isEnableBacklog?, taskIds[], backlogTaskIds[], noteIds[],
issueIntegrationCfgs?` + `WorkContextCommon` (`advancedCfg.worklogExportSettings`, `theme`,
`icon`, `created`). Inbox is `INBOX_PROJECT` (`project.const.ts`).

Actions: create (`dialogs/create-project/`), edit (title, icon, backlog toggle, hide from menu,
theme) via `dialog-work-context-settings/`, archive/unarchive, complete (celebration; stays
distinguishable via `isDone`; open tasks go through `dialog-complete-resolve-tasks/`), delete,
project folders (§2.12), reorder by drag, drop a task on its nav row to move it, project notes,
per-project issue providers, per-project worklog export settings.

Derived: project task page (undone/done/backlog), archived projects page, project history /
daily summary / metrics, planner and schedule inclusion, board panel project filter.

### 2.7 TAG

`src/app/features/tag/tag.model.ts`: `id, title, color?, icon?, created, taskIds[], theme,
advancedCfg`. System tags (`tag.const.ts`): `TODAY` (`'TODAY'`, virtual — membership derives
from `dueDay`/`dueWithTime`, `TODAY_TAG.taskIds` stores ordering only), `EM_URGENT`,
`EM_IMPORTANT`, `KANBAN_IN_PROGRESS` (`SYSTEM_TAG_IDS`).

Actions: create (`src/app/ui/dialog-create-tag/`), edit (title/icon/color/theme), delete, tag
folders, drag a task onto a tag row (toggles membership), tag toggle menu on each task, tag
work view, tasks-by-tag view (`tasks/tasks-by-tag/`).

Derived: tag work view, tag history/metrics, tag time tracking, board tag filters, display-tag
resolution (`tasks/util/resolve-display-tag-ids.util.ts` — a subtask also shows its parent's
tags).

### 2.8 SECTION

`src/app/features/section/section.model.ts`: `{ id, contextId, contextType (PROJECT|TAG),
title, isExpanded?, taskIds[] }`.

Actions (`section.service.ts`): create, rename (inline prompt), delete (tasks fall back to the
"no section" bucket), reorder sections by drag, drag a task between sections, collapse/expand.
Derived: `undoneTasksBySection` groups the undone list — only when the task-view customizer is
**not** active (`work-view.component.html:170`); `section.taskIds` is authoritative for
in-section order.

### 2.9 FILTERS / SMART LISTS / VIEW EDITOR

Four distinct mechanisms — they are not interchangeable:

1. **Task view customizer** (per work context, "view editor") —
   `src/app/features/task-view-customizer/`. Toolbar with three menus (Sort / Group / Filter) +
   Reset, each option has an explicit "save" action.
   - Sort: name, scheduledDate, deadline, creationDate, estimatedTime, timeSpent, tag, priority;
     asc/desc.
   - Group: tag, project, scheduledDate, deadline.
   - Filter: tag, project, scheduledDate, deadline (today / tomorrow / thisWeek / nextWeek /
     thisMonth / nextMonth / not specified), estimatedTime (<10/30/60/120 min presets),
     timeSpent, priority (low/medium/high/not specified).
   - State per context (`CustomizerContextState {sort, group, filter, collapsedGroupIds}`), with
     collapsed groups remembered. Group-by-tag uses `NO_TAG_GROUP_ID` for the virtual "no tag"
     bucket (dropping there clears tags) and `null` for unknown/ambiguous buckets.
2. **Fixed panels** in the work view: Overdue, Later Today, Done, Recurring, Claim pool,
   Backlog — always computed, only visibility collapses (§2.17.1).
3. **Search** (`/search`) — substring over title+notes with an "include completed" toggle;
   results are tasks (live + archived), notes, projects, tags, recently deleted; ordering puts
   recently-deleted last; selecting a result navigates and highlights (`isFromSearch`).
4. **Board panels** (§2.15) — persistent saved filters with their own include/exclude tag logic,
   done/scheduled/backlog state, parent-only and sort fields.

### 2.10 NOTE

`src/app/features/note/note.model.ts`: `id, projectId (null = Today), isPinnedToToday, content,
imgUrl?, isLock?, backgroundColor?, created, modified`; state adds `todayOrder[]`.
Actions (`note.service.ts`): `add`, `update`, `remove`, `updateOrder`, `moveToOtherProject`,
`createFromDrop`, pin to today, fullscreen markdown editing (`dialog-add-note/`).
Surfaces: project notes panel, Today notes, right panel, startup banner for pinned notes
(`note-startup-banner.service.ts`), search, local REST routes. Gated by
`appFeatures.isProjectNotesEnabled`.

### 2.11 SIMPLE_COUNTER

`src/app/features/simple-counter/simple-counter.model.ts`: `id, title, isEnabled,
isHideButton?, icon, type (StopWatch|ClickCounter|RepeatedCountdownReminder), isTrackStreaks?,
streakMinValue?, streakMode('specific-days'|'weekly-frequency'), streakWeekDays?,
streakWeeklyFrequency?, countdownDuration?, countOnDay{day: number}, isOn`.

Actions: create/edit/delete, per-counter settings, click to increment, start/stop, repeated
countdown reminder, habit tracker, toggle from daily summary, plugin counter API.
Derived: streaks (`get-simple-counter-streak-duration.ts`), habit page, daily-summary items,
metric charts, idle-dialog adjustments.

### 2.12 MENU_TREE

`src/app/features/menu-tree/store/menu-tree.model.ts`: `{ projectTree[], tagTree[] }`; node kinds
`FOLDER 'f' | PROJECT 'p' | TAG 't'`; folder carries `children[], name, isExpanded?`. Service
`menu-tree.service.ts` (initialize, create folder, move into/out of folder, rename, delete,
`buildProjectViewTree`, `buildTagViewTree`). Actions: create/rename/delete folder, drag into
folder, reorder, collapse/expand; project visibility toggle removes it from the menu.

### 2.13 METRIC

`src/app/features/metric/metric.model.ts`: `id (YYYY-MM-DD), focusSessions?, notes?,
remindTomorrow?, reflections[{text,created}], impactOfWork?(1–4), energyCheckin?(1–3),
totalWorkMinutes?, completedTasks?, plannedTasks?`. `SimpleMetrics` aggregate fields:
`start, end, timeSpent, timeEstimate, breakTime, breakNr, nrOfCompletedTasks, nrOfAllTasks,
nrOfSubTasks, nrOfMainTasks, nrOfParentTasks, daysWorked, avgTasksPerDay, avgTimeSpentOnDay,
avgTimeSpentOnTask, avgTimeSpentOnTaskIncludingSubTasks, avgBreakNr, avgBreakTime`.
Actions: daily evaluation (impact, energy, reflections, notes, remind tomorrow), edit/delete
focus sessions, share-stats image. Gated by `evaluation.isHideEvaluationSheet`.

### 2.14 PLANNER (state)

`src/app/features/planner/store/planner.reducer.ts`: `{ days: { [YYYY-MM-DD]: taskId[] },
addPlannedTasksDialogLastShown?: string }`. Day view model and `ScheduleItem` union are in
`planner.model.ts` (see §2.17.4).

### 2.15 BOARD

`src/app/features/boards/boards.model.ts`: `BoardCfg { id, title, cols, panels[] }`;
`BoardPanelCfg = { id, title, taskIds[] }` + `BoardSrcCfg { includedTagIds[],
includedTagsMatch('all'|'any'), excludedTagIds[], excludedTagsMatch('all'|'any'),
projectIds[] ('' = All Projects sentinel), taskDoneState(All|Done|UnDone),
scheduledState(All|Scheduled|NotScheduled), isParentTasksOnly, sortBy?('dueDate'|'created'|
'title'|'timeEstimate'), sortDir?('asc'|'desc'), backlogState?(All|NoBacklog|OnlyBacklog) }`.
Defaults: Eisenhower matrix (2 cols) + Kanban (3 cols) in `boards.const.ts`; unknown sort fields
are dropped on load (`boards.util.ts:sanitizePanelCfg`).
Actions: create/edit/delete board, columns, add/edit/delete panel, drag tasks between panels
(tags rewritten to satisfy the target filter), manual reorder when `sortBy` unset, per-panel
done toggle. Membership predicate `doesTaskMatchPanel`.

### 2.16 REMINDER

Two layers: a legacy `Reminder` entity (`reminder.model.ts`: `id, remindAt, title,
type('NOTE'|'TASK'), relatedId, recurringConfig?`) that is migrated once into `task.remindAt`
(`reminder.service.ts:151`; NOTE reminders are dropped), and the current task-based model
(`task.remindAt` + `task.deadlineRemindAt`). A Web Worker (`reminder.worker.ts`) owns the timers;
`ReminderService` pushes `{id, remindAt, title, type:'TASK'}` with `_deadline` appended for
deadline ids. `reminder.disableReminders` short-circuits delivery. Dismissing the modal without
acting suppresses re-open for 5 min per `taskId_remindAt` occurrence.

### 2.17 Task-focused UI surfaces (implementation detail)

#### 2.17.1 Work view (Today / project / tag)

`src/app/features/work-view/work-view.component.*` (857 + 496 lines).

Header stats: estimate remaining (with "today remaining" tooltip), working today, working today
(incl. archived), working without break, break time, reset-break-timer button, finish-day
button.

Body order:

1. **Add-task bar** (unless a plugin embed replaced the list).
2. **Main undone list** — one of three shapes:
   - grouped by the view editor's group option (`grouped`), or
   - user sections (`sections()` non-empty and not customized): "no section" list first, then
     one list per section with `title (count)`, a per-section `⋯` menu (edit / delete) and drag
     handles for reordering sections, or
   - a single flat list.
3. **Overdue** (Today only) — count, collapse, "add all overdue to My Day" button.
4. **Later today** (Today only) — calendar events that have not started yet; re-evaluated on a
   coarse tick so an appointment drops out once it starts.
5. **Done tasks** — count incl. `doneTodayArchived`, move-done-to-archive button.
6. **Recurring tasks** — repeat cfg previews for this context + link to `/scheduled-list`.
7. **Claim pool** (Plainspace shared projects) — read-only unclaimed tasks.
8. **Finish day** button (Today, when `isFinishDayEnabled`).
9. **Backlog** split pane (projects with `isEnableBacklog`): draggable splitter, collapsible.

Empty state text differs for "all done" vs "nothing planned".

#### 2.17.2 Add-task bar

`src/app/features/tasks/add-task-bar/` (`add-task-bar.component.ts` ~1 040 lines,
`add-task-bar-state.service.ts`, `add-task-bar-parser.service.ts`, `add-task-bar-actions/`).

Input: autosizing textarea (1–4 rows) with a mirrored highlight layer painting detected syntax
spans, `@`-mention autocomplete for tags/projects, task/issue autocomplete, paste handling
(URLs, images), note field (collapsible), search mode (add existing task / issue / archived
task instead of creating).

Controls row: project chip, due-date chip + clear, deadline chip + clear, tags chip + clear,
estimate chip + clear, repeat chip + clear, reminder option, attachments, add-to-top/bottom
toggle, add-to-backlog toggle (when the context has a backlog), submit; sticky "plan for day"
variant hides tag/due chips.

Behaviour:

- Short syntax is parsed on every keystroke (§5) and the resulting values are pushed into
  state; the cleaned title is what gets submitted.
- Picking a control that contradicts typed syntax strips that syntax from the input and takes
  ownership, so the value survives the next parse.
- Priority has **no** control — it can only arrive from `p1`/`p2`/`p3`.
- Submitting with an empty title is a no-op; `tasks.defaultProjectId` / active context decides
  the default project.
- Keyboard: Enter submits (IME composition and keyCode 229 are ignored), Ctrl/Cmd+Enter reveals
  the note field; inside the note field plain Enter inserts a newline and Ctrl/Cmd+Enter submits;
  Escape closes the bar from the title, and collapses the note back to the title from the note
  field; mention/autocomplete popups consume Escape and Enter while open.

#### 2.17.3 Task detail panel

`src/app/features/tasks/task-detail-panel/`. Right-hand panel (or full-screen dialog on small
screens) with three collapsible panels plus header actions:

- **Sub-tasks** — nested list, "add sub task", empty state.
- **Additional info** — parent task link, time (spent/estimate), schedule, Today membership,
  repeat ("Repeat: …"), deadline (+ remove), issue panel, notes/checklist (markdown editor with
  live formatting, auto-save, checklist progress), attachments (local + issue attachments, add
  via file picker/paste, edit/remove).
- Header: title, done toggle, more-actions menu, close; "updated issue" indicator.

#### 2.17.4 Planner / week planning

`src/app/features/planner/`. `PlannerDay` (`planner.model.ts`): `isToday?, dayDate, timeEstimate,
timeLimit, itemsTotal, tasks[], deadlineTasks[], noStartTimeRepeatProjections[], allDayEvents[],
scheduledIItems[] (ScheduleItem[]), availableHours?, progressPercentage?`. `ScheduleItem` is a
timed union: `Task | CalEvent | RepeatProjection` with `start`/`end`.

Day column order: header (date, planned load, progress bar) → all-day area (planned tasks, repeat
projections, all-day calendar events, empty state) → "Scheduled" section with time-ordered items
(task, calendar event, repeat projection) → "Deadlines" section (`planner-deadline-task`).
Nav strip (`planner-calendar-nav/`) shows a month/day strip with dots for days with tasks, swipe
gestures (`planner-calendar-gesture-handler.ts`) and a "today" reset. Available hours come from
`util/calculate-available-hours.ts` (work start/end minus lunch break minus existing blocks);
`util/build-day-window.ts` builds the visible window.

Actions: drag a task from any list onto a day; drag between days; reorder inside a day;
add-task-inline per day; "add planned tasks" prompt (`addPlannedTasksDialogLastShown`);
drag a repeat projection to materialise it; click a day in the strip to scroll.

#### 2.17.5 Schedule (week / day / month) and calendar

`src/app/features/schedule/`. View mode from `LayoutService.selectedTimeView()`: `week` (default),
`day`, `month`.

- **Week/day**: time-grid columns per day, configurable row height (desktop vs mobile),
  horizontal scroll below 1900 px, day column widths 180/150/120 px at desktop/tablet/mobile.
- **Entries** (`SVEType`, `schedule.const.ts`): `WorkdayStart`, `WorkdayEnd`, `LunchBreak`,
  `ScheduledTask`, `CalendarEvent`, `RepeatProjection`, `Task`, `TaskPlannedForDay`, `SplitTask`,
  `SplitTaskContinued`, `SplitTaskContinuedLast`, `RepeatProjectionSplit`,
  `RepeatProjectionSplitContinued`, `RepeatProjectionSplitContinuedLast`, plus
  `ScheduledRepeatProjection`. Z-order from `SCHEDULE_VIEW_TYPE_ORDER`; minimum task block
  `10 min + 1 ms`.
- **Layout algorithm**: tasks are laid into the free space of the workday, splitting across days
  at midnight and at the workday end (`map-schedule-data/`), with "beyond budget" tasks collected
  separately (`get-tasks-within-and-beyond-budget.ts`), calendar events, work start/end and
  lunch break inserted as blocked blocks (`create-blocked-blocks-by-day-map.ts`,
  `insert-blocked-blocks-view-entries-for-schedule.ts`).
- **Drag**: drag a block to move it in time/day (snap) with a custom floating preview and a time
  badge; **Shift held = "no-schedule" mode** — the task is *planned for the day* / reordered
  relative to other tasks instead of being given a time
  (`isShiftNoScheduleMode`, `schedule-week-drag.service.ts:104`, `:198`, `:276`); **Ctrl held**
  keeps the inline "create task here" slot visible while a task is being dragged, so a drop can
  create a new task instead of moving one
  (`schedule-week.component.html` placeholder condition). Dropping on an empty slot opens the
  inline create-task placeholder (`create-task-placeholder/`). An external drag service accepts
  tasks from the task lists (`schedule-external-drag.service.ts`); plugin-backed calendar events
  are moved through their provider (`schedule-week-drag.service.ts:244`).
- **Month**: month grid (`schedule-month/`), month navigation.
- **Panels**: day panel (`schedule-day-panel/`) lists the selected day's agenda; calendar filter
  popover lists calendar providers with visibility toggles (`hidden-calendar-providers.service.ts`).
- **Calendar integration**: `src/app/features/calendar-integration/` — model, fetch/normalize,
  create task from event, create/update/delete time blocks back to write-capable providers,
  regex include/exclude filters, hidden events, all-day detection (`isAllDayCalendarEvent`).

---

## 3. Time tracking (brief)

- One `currentTaskId` in task state; start/stop via `TaskService.setCurrentId` /
  `toggleStartTask` / `pauseCurrent` / `startFirstStartable`; header play button and tracked-task
  pill.
- A 1 s global tick accrues into `timeSpent` + `timeSpentOnDay[today]`; accumulated writes are
  flushed as one op.
- Break time / break count accumulate on the active context, shown in the work-view header with
  reset.
- `isAutoStartNextTask` continues tracking after completion; `isAutoAddWorkedOnToToday` adds a
  started task to Today; `isNotifyWhenTimeEstimateExceeded` warns at the estimate.
- Tracking reminder: banner (+ optional notification / focus window) after
  `trackingReminderMinTime`; `isTrackingReminderShowOnMobile` gates touch devices.
- Take-a-break: banner after `takeABreakMinWorkingTime` of work, snooze
  `takeABreakSnoozeTime`, message template with `${duration}`.
- Worklog: derived from `timeSpentOnDay` + per-day work start/end
  (`TimeTrackingState.project|tag[ctxId][date].{s,e}`) into year → month → week → day
  (`worklog.service.ts`, `worklog.model.ts`); timestamps rounded to minutes on write.
- Rounding: `RoundTimeOption` applied independently to work time, start, end
  (`roundDuration`/`roundTime`); manual re-round of an already-tracked day via
  `roundTimeSpentForDayEverywhere`.
- Idle (`src/app/features/idle/`): on idle, the idle span is **removed** from the current task,
  the task is unselected, running stopwatch counters lose the time and are switched off, then
  the idle dialog lets the user assign the span to a task, a new task, a break, or counters.
  Skipped when idle is disabled, while a focus session runs (`isSuppressIdleDuringFocusMode`),
  or when no task is current (`isOnlyOpenIdleWhenCurrentTask`).
- Focus mode (`src/app/features/focus-mode/`): three modes — Pomodoro (fixed work/break, long
  break every N cycles, auto-continue), Flowtime (open-ended work; break only if enabled, by
  ratio or rules, min 1 min), Countdown (fixed duration, capped to the task's remaining
  estimate). State `{timer, currentScreen, mainState, isOverlayShown, mode, currentCycle,
  lastCompletedDuration, pausedTaskId, _isOvertimeEnabled}`; `isPauseTrackingDuringBreak`,
  tick/white-noise sound at `focusModeSoundVolume`%, session persistence, sessions logged into
  `metric.focusSessions`.

---

## 4. Recurring tasks and reminders

### 4.1 Recurrence — config model

`src/app/features/task-repeat-cfg/task-repeat-cfg.model.ts`: `id, projectId,
lastTaskCreation?, lastTaskCreationDay?, title, tagIds[], order (deprecated), defaultEstimate?,
priority?, startTime?, remindAt? (TaskReminderOptionId), isPaused, quickSetting, repeatCycle
('DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY'), startDate?, repeatUntilDay?, repeatEvery,
monday…sunday?, monthlyWeekOfMonth?(1..4, -1), monthlyWeekday?(0..6), monthlyLastDay?, notes,
shouldInheritSubtasks?, subTaskTemplates[{title, timeEstimate?, notes?}],
repeatFromCompletionDate?, waitForCompletion?, disableAutoUpdateSubtasks?,
deletedInstanceDates?[YYYY-MM-DD], skipOverdue?`.

`quickSetting` presets: `DAILY`, `WEEKLY_CURRENT_WEEKDAY`, `MONTHLY_CURRENT_DATE`,
`MONTHLY_FIRST_DAY`, `MONTHLY_LAST_DAY`, `MONTHLY_NTH_WEEKDAY`, `MONDAY_TO_FRIDAY`,
`YEARLY_CURRENT_DATE`, `CUSTOM`. Presets only seed `repeatCycle`/`repeatEvery`/weekday flags —
the persisted truth is the raw fields.

### 4.2 Occurrence computation

`store/get-next-repeat-occurrence.util.ts`.

| Cycle | Rule |
|---|---|
| DAILY | day diff from effective start date `>= 0` and `% repeatEvery === 0` |
| WEEKLY | week diff `% repeatEvery === 0` **and** that weekday's flag is true |
| MONTHLY | Nth-weekday anchor if `monthlyWeekOfMonth` + `monthlyWeekday` are both in range; else day-of-month = 31 when `monthlyLastDay`, else `startDate.getDate()`, clamped to the month's last day; month diff `% repeatEvery === 0` |
| YEARLY | same month/day as `startDate`, year diff `% repeatEvery === 0`; Feb 29 → Feb 28 in non-leap years |

Scan bounds: 2 years (daily/weekly), 24 months (monthly), 10 years (yearly). End bound
`repeatUntilDay` is inclusive (`repeat-until-day.util.ts`); a window with no allowed occurrence
creates nothing rather than falling back to today. Effective start/last-creation come from
`get-effective-repeat-start-date.util.ts` and `get-effective-last-task-creation-day.util.ts`
(`lastTaskCreationDay` wins when present, which is what makes `repeatFromCompletionDate` work).
`inclusive` mode (used when relocating a live instance after a schedule edit) starts the scan at
`fromDate` itself and neutralises the last-creation gate. Dates are anchored at noon to dodge
DST.

### 4.3 Instance creation

`task-repeat-cfg.service.ts:174` `_getActionsForTaskRepeatCfg`.

1. `isPaused` → nothing.
2. Resolve target occurrence (`getNewestPossibleDueDate`); none due → nothing.
3. Deterministic id `rpt_<cfgId>_<dayStr>`; if an instance with that id **or** that `created`
   day already exists → only advance `lastTaskCreation`/`lastTaskCreationDay` (race healing).
4. Day in `deletedInstanceDates` → skip.
5. `waitForCompletion` and any live **or archived** instance still open → nothing, and do **not**
   advance the cursor.
6. `skipOverdue` and the occurrence is before today → advance the cursor, create nothing.
7. Create from template: `repeatCfgId`, `timeEstimate = defaultEstimate`, `priority`,
   `projectId`, `notes`, `dueDay`, `tagIds` minus `TODAY`, `created` = noon of the occurrence
   day, id as above; then
   - `startTime` + `remindAt` → also `scheduleTaskWithTime` (due at that time, reminder at the
     option offset, kept in Today only if it lands today),
   - `shouldInheritSubtasks` → recreate `subTaskTemplates` with deterministic sub ids
     (`getRepeatableSubTaskId`).

Trigger points: logical-day change / app load (`tasks/store/task-due.effects.ts` →
`addAllDueToday()`), "add all due tomorrow", sync completion, and explicit
`addAllDueToday()` after a schedule edit or a resume.

### 4.4 On completion / skip / delete / pause

`updateStartDateOnComplete$` (`task-repeat-cfg.effects.ts:682`), fired on `isDone === true`:

| Config | Effect |
|---|---|
| `repeatFromCompletionDate` and this is the latest instance | set `startDate` **and** `lastTaskCreationDay` to today, so the next occurrence counts from the completion day |
| `waitForCompletion` | re-run creation; the gate then lets the next copy appear immediately |
| neither | nothing here — the normal day-change path creates the next occurrence |

Other transitions:

- **Skip one occurrence** — deleting an instance calls `deleteTaskRepeatCfgInstance(cfgId,
  dateStr)`, adding the day to `deletedInstanceDates`; that day is never materialised again.
- **Skip overdue** — `skipOverdue` (schedule-aware default from
  `dialog-edit-task-repeat-cfg/get-default-skip-overdue.ts`; baseline `false` in
  `DEFAULT_TASK_REPEAT_CFG`).
- **Pause** — `isPaused` suppresses creation; a pause/resume alone does not move the open copy.
  Resuming on a scheduled day triggers `addAllDueToday()` so today's copy appears immediately.
- **Edit schedule** — only `SCHEDULE_AFFECTING_FIELDS` (`store/schedule-affecting-fields.const.ts`)
  relocate a live instance; the dialog offers "update all instances?" and updates live + archived
  instances field-by-field (title, notes, tags, priority, estimate) via
  `checkToUpdateAllTaskInstances$`.
- **Delete config** — confirm dialog; removes the config and its instances.
- **End date** — `repeatUntilDay` is editable in the dialog and shows as the rule sentence.

Mobile additionally pre-schedules native alarms for upcoming timed occurrences straight from the
configs (same deterministic ids, 14-day lookahead, cap 32, skips `waitForCompletion`)
(`src/app/features/mobile/store/mobile-notification.effects.ts:267`).

### 4.5 Reminder scheduling semantics

`TaskReminderOptionId` → offset from the due moment
(`tasks/util/remind-option-to-milliseconds.ts`):

| id | offset |
|---|---|
| `DoNotRemind` | none |
| `AtStart` | 0 |
| `m5 / m10 / m15 / m30` | −5 / −10 / −15 / −30 min |
| `h1` | −1 h |
| `d1 / d3 / w1` | −1 day / −3 days / −1 week (fixed 24 h days → DST shifts by 1 h) |

Reverse map for display: `millisecondsDiffToRemindOption`. Long lead times are not offered where
the option id itself is persisted (`TASK_REMINDER_OPTIONS_WITHOUT_LONG_LEAD`).

- Reminders are task fields: scheduling with a time sets `dueWithTime` and
  `remindAt = dueWithTime − offset`; changing the due time recomputes it
  (`with-remind-at-for-due-change.ts`).
- Deadline reminders use `deadlineRemindAt`, computed from the deadline moment, and are kept
  separate from `remindAt`.
- Firing: in-app modal is primary; past-due reminders fire on next load. Completing, archiving or
  deleting a task clears its reminders.
- Native (Android/iOS) schedules four independent streams and cancels any id that disappears:
  schedule reminders, upcoming repeat reminders, due-date notifications (`notifyOnDueDate` at
  `dueDateNotificationHour` for tasks with a due day and no reminder), deadline reminders.
- `reminder.disableReminders` cancels all native alarms and suppresses the modal.
- Countdown banner before a reminder: `isCountdownBannerEnabled` + `countdownDuration`.
- Android: `useAlarmStyleReminders`; exact-alarm permission tracked and surfaced, reminders
  degrade to inexact (§9).

---

## 5. Short syntax

Parser `src/app/features/tasks/short-syntax.ts` (`shortSyntax(...)`), date words from
`chrono-node` with per-locale lazy chunks (`short-syntax-date-parser.ts`), add-bar orchestration
+ highlighting + per-token removal (`add-task-bar/add-task-bar-parser.service.ts`). Gated by
`shortSyntax.*` (`config/form-cfgs/short-syntax-form.const.ts`). Runs on every new task created
through normal UI paths; **skipped** for issue tasks and Android shares (`task.issueId` guards,
`isIgnoreShortSyntax`).

Stage order: priority → estimate + due (incl. recurrence) → deadline → project → tags → URLs.

| Token | Grammar (exact) | Effect | Gate |
|---|---|---|---|
| Priority | `(?:^\|\s)p([1-3])(?=\s\|$)` — lowercase, whitespace-delimited | `p1`→3 (High), `p2`→2, `p3`→1 (Low); `p4` deliberately not a token; last token wins | on unless `isEnablePriority === false`; skipped for issue tasks |
| Estimate / spent | `(?:\s\|^)t?((?:\d+(?:\.\d+)?[mh]\s*)+)(?:\s*/((?:\s*\d+(?:\.\d+)?[mh])+)?)?(?=\s\|$)` | before `/` = time spent today; after `/` = estimate; with no `/` the single value is the estimate. Sums (`1h 30m`) and decimals (`1.5h`) allowed | `isEnableDue` (shared gate) |
| Due | `@` + one or more chars not in `+ # @ !` | `@<chrono text>` → `dueWithTime`; no explicit hour → day-only (`hasPlannedTime:false`). Fallback: a bare number ≤ 24 → that hour today, else tomorrow | `isEnableDue` |
| Recurrence | inside the `@` token, anchored: `daily\|weekly\|monthly\|yearly\|annually`; `every <days?\|weeks?\|months?\|years?\|weekdays?\|workdays?\|<weekday>\|<ordinal 1..31 st/nd/rd/th>`; `every <1..999> <days?\|weeks?\|months?\|years?\|<weekday>>` | `@daily`→`DAILY`; `@every friday`→`WEEKLY_CURRENT_WEEKDAY`; `@every 15th`→`MONTHLY_CURRENT_DATE`; `@every weekday`→`MONDAY_TO_FRIDAY`; `@every 2 days` / `@every 2 fridays` → interval (`CUSTOM`) | only when creating in the add-task bar (`isParseRepeat`), never on title edits |
| Nth weekday | `^(\d{1,2})(\s*)(<weekday>)(?![\w])` inside the `@` token; glued form allows any 1–2 digits, spaced form only 1–5 | `@2monday` = 2nd next Monday (org-mode counting; `n=1` ≡ `@monday`); out-of-range counts consume the token but yield no date | `isEnableDue` |
| Deadline | `!` + chars not in `+ # @ !`; `!` only at start or after a space | `!<chrono text>` → `deadlineWithTime` (+ `hasDeadlineTime`); same numeric fallback | `isEnableDeadline` (default **off**), not for issue tasks |
| Project | `\+(?!\s)((?:(?!\s+(?:#\|@\|t?\d+[mh]\b)).)+)` | `+Project` → `projectId`. Matching: full typed title first, then shortest prefix, whitespace-insensitive (`+SomePro`); ignored when the preceding char isn't a space | `isEnableProject`; archived / hidden projects excluded; not for issue tasks |
| Tag | `#[^+ # @ !\s]+` (case-insensitive) | `#tag` adds the tag by case-insensitive title, otherwise creates it. Add bar uses `replace`, title edits use `combine`. `#123` only mid-title and not on issue tasks; ignored when the preceding char isn't a space | `isEnableTag` |
| URL / markdown link | `(?:(?:https?\|file)://\S+\|www\.\S+?)(?=\s\|$)`; markdown `[text](url)` with one level of balanced parens | `urlBehavior`: `keep` (default, no change), `extract` (remove from title, keep as attachment; empty title falls back to the URL basename), `keep-and-attach`; duplicate paths filtered | not for issue tasks |

Cleanup rules: a consumed token takes its surrounding whitespace with it; trailing `.,;:!?`
stays attached to the previous word (`Water plants @every friday.` → `Water plants.`); a
mid-title removal does not leave a double space; deadlines need the trigger at start/after a
space so `Done!` is not a deadline; `@` tokens stop at the next `+ # @ !` so
`@tomorrow #tag` parses both.

Date language: chrono plus the UI language when chrono ships that locale (de, es, fi, fr, it,
ja, nl, pt, pt-br, ru, sv, uk, vi, zh, zh-tw); the UI-language parse wins only when it starts
earlier or is longer, and 1–3 letter words are only trusted at the token start (avoids
`max@firma.de so bald` becoming Sunday). Numeric dates follow the user's day/month order;
2-digit years 50–99 are reinterpreted as current/next year.

DST safety: `dueTimeStr` carries the typed wall-clock time when the resolved day is a
spring-forward day; `skipExcludedWeekend` keeps `MONDAY_TO_FRIDAY` off weekends.

Token removal/highlighting: every stage records the consumed raw ranges (`ShortSyntaxRange`), so
the add bar can highlight exactly what was parsed and delete exactly one token when a control
overrides it (`removeShortSyntaxFromInput`). A recurrence token owns its whole due token,
including an adjacent absorbed time (`@every friday 3pm`).

Suggestions for the add bar: `CHRONO_SUGGESTIONS` (today, tomorrow, tonight, this
morning/afternoon/evening, next week, next weekend, weekday names, next <weekday>, months,
`in N minutes/hours/days/weeks/months`, `at 7am`…, `now`) and `REPEAT_SUGGESTIONS`
(`add-task-bar.const.ts:70`, `:139`).

Examples:

```
Fix login bug p1 #backend +Website @tomorrow 2h
Standup @every weekday 9am 15m
Water plants @every friday.
Pay rent @every 15th !2025-01-20
Read paper 30m/1h @2monday
Call Bob @3pm @tomorrow          → last due token wins
https://x.dev/a 1h               → urlBehavior 'extract': title "a", attachment "//x.dev/a"
```

---

## 6. Integrations (inventory)

### 6.1 Issue providers — complete list

Built-in (`src/app/features/issue/providers/`), with their config keys:

| Key | Config fields | Notes |
|---|---|---|
| `JIRA` | `host, userName, password, altPublicLinkHost, isAllowSelfSignedCertificate, usePAT, allowFetchFallback, autoAddBacklogJqlQuery, searchJqlQuery, isCheckToReAssignTicketOnStart, isWorklogEnabled, isAddWorklogOnSubTaskDone, worklogDialogDefaultTime` | transition dialog, Jira link content, worklog submit |
| `GITLAB` | `project, token, scope, gitlabBaseUrl, filterUsername, filter, isEnableTimeTracking` | submit-worklog-for-day dialog |
| `CALDAV` | `caldavUrl, resourceName, username, password, categoryFilter, isAddSubTasks, pollIntervalMinutes`, `twoWaySync.{isDone,title,notes,createOnServer,deleteOnServer}` | full two-way sync |
| `ICAL` (calendar) | `icalUrl, isAutoImportForCurrentDay, isReferenceCalendar, color, icon, checkUpdatesEvery, showBannerBeforeThreshold, isDisabledForWebApp, filterIncludeRegex, filterExcludeRegex` | read-only calendar; auto-import today's events |
| `OPEN_PROJECT` | `host, token, projectId, scope, isShowTimeTrackingDialog, isShowTimeTrackingDialogForEachSubTask, timeTrackingDialogDefaultTime` | transition dialog |
| `PLAINSPACE` | `host, spaceId, token` | shared-task claim pool + sync adapter |

Migrated-to-plugin keys still valid on persisted data: `GITHUB, CLICKUP, GITEA, LINEAR, TRELLO,
AZURE_DEVOPS, REDMINE, NEXTCLOUD_DECK`. Plugin keys: `plugin:<id>`.
Bundled plugin providers (`src/app/plugins/bundled-plugins.const.ts`): the eight above plus
calendar providers `google-calendar-provider`, `caldav-calendar-provider`; import plugins
`todoist-import`, `ticktick-import`; others `yesterday-tasks`, `sync-md`,
`api-test-plugin` (dev), `procrastination-buster`, `automations`, `brain-dump`,
`voice-reminder`, `doc-mode`, `app-auto-track`, `parallel-code`, `ai-productivity-prompts`.

Common provider fields (`issue.model.ts`): `isEnabled, defaultProjectId?, pinnedSearch?,
isAutoPoll?, isAutoAddToBacklog?, isIntegratedAddTaskBar?,
pollingMode('whenProjectOpen'|'always'), defaultTagIds?, defaultNote?`.
Polling: `poll-issue-updates.effects.ts` (8 s initial delay), backlog polling
(`poll-to-backlog.effects.ts`). Provider interface: `issue-service-interface.ts`.

### 6.2 Calendar

Model `features/calendar-integration/calendar-integration.model.ts` (`id, calProviderId, title,
description?, start, duration, isAllDay?, legacyIds?, url?, issueProviderKey, dueWithTime?,
isReferenceCalendar?, color?`). Services: fetch/normalize, event actions (create task, schedule,
delete block), regex filters, hidden events/providers, `is-calender-event-due`. Surfaces: planner,
schedule week/month, work-view "Later today", issue-panel calendar agenda. Auto-import of today's
events with dismissal tombstones in
`TaskState.dismissedCalendarAutoImportEventIdsByProvider`.

### 6.3 Plugins / plugin API (inventory)

Types `packages/plugin-api/src/types.ts`; runtime `src/app/plugins/` (`plugin-api.ts`,
`plugin-bridge.service.ts`, `plugin-loader.service.ts`, `plugin-runner.ts`, `plugin-security.ts`).

- Manifest: `name, id, manifestVersion, version, minSupVersion, description, hooks[],
  permissions[], allowedHosts[], iFrame, isSkipMenuEntry, type('standard'|'issueProvider'),
  assets[], issueProvider?, icon, nodeScriptConfig?, sidePanel?, uiKit?, jsonSchemaCfg?,
  i18n.languages[]`.
- Hooks: `taskCreated, taskComplete, taskUpdate, taskDelete, currentTaskChange, finishDay,
  languageChange, persistedDataChanged, action, anyTaskUpdate, projectListUpdate,
  workContextChange`.
- Registration: hook, header button, menu entry, task-context-menu entry, config handler,
  shortcut (+ unregister), side-panel button, work-context header button, issue provider.
- Data: task/project/tag CRUD, `reorderTasks`, `getAppState`, `getSelectedTask`,
  `getFocusedTask`, `getActiveWorkContext`, `selectTask`, batch project update, synced
  persistence (`persistDataSynced`/`loadSyncedData`), config, i18n, OAuth flow + token,
  device-local secrets, `request` (host allow-list + `http` permission), `downloadFile`,
  `executeNodeScript` (Electron), `dispatchAction` (allow-list), focus state, counter API,
  snack/notify/dialog, work-view embed, `onReady`/`onUnload`/`onMessage`.
- Namespaces: `PLUGIN_USER_DATA` (synced), `PLUGIN_METADATA` (install state); secrets are
  device-local and never exported.

### 6.4 Widgets / notifications

See §9.

---

## 7. Import / export / backup (inventory)

- **Full backup JSON** — `BackupService.loadCompleteBackup(true)` → one document with every
  entity slice + sync metadata (`src/app/op-log/model/model-config.ts` `AppDataComplete`).
  Filename `${BACKUP_FILENAME_PREFIX}_<timestamp>.json`.
- **Anonymized export** — `imex/file-imex/privacy-export.ts`: replaces string values of ~35
  sensitive keys (`username, password, token, apiKey, secret, authorization, notes, host, title,
  content, path, …`) with `<key>__<n>`; prefix `BACKUP_FILENAME_PREFIX_ANONYMIZED`.
- **Import** — `imex/file-imex/file-imex.component.ts`: file picker or URL (with hostname
  confirmation and `importFromUrl` query param) → JSON parse → V1 rejected → encryption-change
  warning → `importCompleteBackup(..., isSkipReload=true)` → import-encryption handling → drafts
  cleared → navigate to Today. Validation/repair failures surface as dedicated errors. Only the
  app's own JSON is accepted; Todoist/TickTick import via bundled plugins.
- **Automatic local backups** — `imex/local-backup/local-backup.service.ts`: two-slot ring
  (`backup`/`backup_prev` in IndexedDB on Android, two JSON files on iOS, files on desktop),
  every 5 min and 30 s after changes, guarded against overwriting a substantial backup with a
  near-empty one; `localBackup.isEnabled`, `maxBackupFiles`; backups list dialog + recovery
  banner.
- **Worklog CSV export** — `features/worklog/worklog-export/`: group by `DATE|PARENT|TASK|
  WORKLOG`; columns `DATE, START, END, TITLES, TITLES_INCLUDING_SUB, NOTES, PROJECTS, TAGS,
  TIME_MS, TIME_STR, TIME_CLOCK, ESTIMATE_MS, ESTIMATE_STR, ESTIMATE_CLOCK`; defaults
  `['DATE','START','END','TIME_CLOCK','TITLES_INCLUDING_SUB']`, separator `' | '`; independent
  rounding of work/start/end; `;`-separated CSV with quoting and CSV-injection guarding; fixed
  English headers; download or copy to clipboard.
- **Archive** — `features/archive/`: `archiveYoung`/`archiveOld` hold tasks + time tracking;
  finished days move there; compression dialog; included in backups, worklog, metrics.
- **Sync** — `imex/sync/` + `op-log/`: providers `Dropbox, OneDrive, WebDAV, LocalFile,
  SuperSync, Nextcloud`; E2EE password flows, compression, split-file format, interval,
  manual-only, conflict dialog, restore point, device list, background sync. Wire format is
  documented separately (`docs/research/sync-contract.md`).

---

## 8. Theming / i18n (inventory)

- **App theme**: CSS-variable stylesheet, `core/theme/custom-theme.service.ts`; selection
  `builtin:<id>` / `user:<id>` in `LS.CUSTOM_THEME`; user themes are CSS bytes in IndexedDB,
  validated before injection. 16 built-ins: `default, classic, zen, arc, catppuccin-mocha, cybr,
  dark-base, dracula, everforest, glass, liquid-glass, nord-polar-night, nord-snow-storm,
  plainspace, rainbow, velvet`; some force a mode.
  Required tokens: `--surface-1/2`, `--ink`, `--ink-on-channel`; recommended `--surface-0/3/4`,
  `--ink-strong`, `--ink-muted`, `--separator`, `--divider`, `--scrim`
  (`core/theme/theme-contract.const.ts`).
- **Work-context theme** (per project/tag): `primary/huePrimary, accent/hueAccent, warn/hueWarn`
  (hues 50–900), `isAutoContrast`, `isDisableBackgroundTint`, wallpaper quartet
  (`backgroundImageDark/Light` URL, `backgroundOverlayOpacity` 0–99, `backgroundImageBlur` 0–20)
  — `features/work-context/work-context.const.ts`, applied by
  `core/theme/global-theme.service.ts`. Precedence: context image → global wallpaper
  (`misc.backgroundImage*`) → none; non-work-context routes never use the sticky context image.
- **Dark mode**: `dark | light | system` in `LS.DARK_MODE`, `prefers-color-scheme` listener;
  also drives the Android status/navigation bars.
- **Languages (28)** — `core/locale.constants.ts`: `ar, cs, de, en, es, fa, fi, fr, hr, id, it,
  ja, ko, nb, nl, pl, pt, pt-br, ro, ro-md, ru, sk, sv, tr, uk, vi, zh, zh-tw`; files
  `src/assets/i18n/<code>.json`; RTL `ar`, `fa`. Date/time locales are separate
  (`DateTimeLocales`, regional variants + browser fallbacks); defaults language `en`, locale
  `en-gb`, first day of week `1`. `localization` can override (`null` = reset to system).
- **Day-start offset**: `misc.startOfNextDayTime` (`HH:mm`, default `00:00`), legacy
  `startOfNextDay` hour migrated into it (`normalize-start-of-next-day-config.ts`).
  `DateService` exposes `getStartOfNextDayDiffMs`, `getLogicalTodayDate`, `getLogicalTomorrowMs`,
  `todayStr`, `isToday`, `isYesterday`; pure reducers take the offset as an argument
  (`isTodayWithOffset`). Everything "today"-shaped uses the logical day: Today list, overdue,
  day change, repeat materialisation, due-date notifications, Android widget `validUntil`.

---

## 9. Android-only behaviours

Bridge contract `src/app/features/android/android-interface.ts`; platform flag
`util/is-android-web-view.ts`; Capacitor config `capacitor.config.ts` (plugins: Browser,
StatusBar, safe-area, App, Filesystem, LocalNotifications, Share, android-dark-mode-support,
background-task; `smallIcon: ic_stat_sp`).

- **Home-screen widget** — contract `features/android/android-widget.model.ts`, blob key
  `widget_data`, native reader `android/.../widget/WidgetData.kt`; Angular is the only writer.
  Blob `{ v:1, dayStr, validUntil, tasks[{id,title,isDone,projectId?}], projectColors{} }`;
  `validUntil` is the shipped staleness verdict. Pushes: debounced 500 ms on state change, once
  when the sync window closes, undebounced on pause. Done-checkbox taps are queued natively and
  drained on resume / drain signal, applying only real changes and showing a snack.
- **Share targets** — `onShareWithAttachment$` (`{title, subject, type FILE|LINK|IMG|COMMAND|
  NOTE, path}`) creates a task with short syntax **disabled**, attaches the content, snack
  "Task created from share". Title: subject → title → readable URL → first text line → "Shared
  note", truncated to 150 chars. Pending shares pulled on cold start and resume.
- **Notifications / alarms** — native reminders with deterministic notification ids, `_deadline`
  suffix; tap / done / snooze come back as events plus persisted pull queues drained on cold
  start and resume; `useAlarmStyleReminders`; due-date notifications at
  `dueDateNotificationHour`; explicit permission denial nags once, the OS prompt is requested
  lazily; background sync credential + reminder-settings bridge so a WorkManager worker can
  schedule/cancel alarms while the WebView is dead.
- **Exact alarms** — `features/reminder/exact-alarm-status.service.ts` tracks a denied
  "Alarms & reminders" permission (reminders become inexact), re-checks on resume,
  `<exact-alarm-hint>` surfaces it; re-registration as exact happens natively.
- **Foreground service — tracking** — `startTrackingService/updateTrackingService/
  stopTrackingService/getTrackingElapsed`; the native counter is authoritative after a kill and
  is reconciled on resume (gap credited, JS interval reset, higher value kept on service crash);
  a force-stop credits the time but does not resume; notification actions pause tracking / mark
  done; start failures surface a warning with a settings shortcut.
- **Foreground service — focus mode** — `start/update/stopFocusModeService`,
  `getFocusModeElapsed` recovery, actions `onFocusPause/Resume/Skip/Complete`,
  `onFocusModeTimerComplete(isBreak)`, `updateFocusTask`/`adjustFocusTaskTime`.
- **Remote tracking presence** — `updateRemoteTrackingNotification` /
  `cancelRemoteTrackingNotification` (SuperSync), self-destructs when updates stop.
- **Back button** — `features/android/android-back-button.service.ts`: back from a top-level
  destination returns to the start destination; history-backed overlays close via
  `history.back()`; store-backed overlays (focus mode, task context menu, layout popups) close
  directly; a dialog without history state is dismissed; `disableClose` dialogs swallow it.
- **Other** — safe-area insets from Capacitor SystemBars; `--keyboard-height` from
  VisualViewport; `performHapticFeedback('confirm'|'threshold'|'longPress')`; Play in-app review
  (no-op on F-Droid); legacy native capture inbox import with a receipts ledger; app-URI task
  actions; text zoom; native toasts.

---

## 10. Explicit out of scope (desktop/Electron-only)

Gated by `IS_ELECTRON` (`src/app/app.constants.ts`) or living under `electron/`:

- Main process / IPC: `main.ts`, `preload.ts`, `ipc-handler.ts`, `ipc-handler-wrapper.ts`,
  `main-window.ts`, `navigation-guard.ts`, `protocol-handler.ts`, `start-app.ts`,
  `window-maximized-state.ts`, `window-restore-bounds.ts`, `web-preferences-guard.ts`,
  `proxy-agent.ts`, `gpu-startup-guard.ts`, `error-handler-with-frontend-inform.ts`,
  `secure-file.ts`, `exec.ts`.
- Native app menu, tray icon, task-widget window, indicator overlay, macOS behaviours
  (`electron/menu.ts`, `indicator.ts`).
- System-wide global shortcuts (`globalShowHide`, `globalToggleTaskStart`, `globalAddNote`,
  `globalAddTask`, `globalToggleTaskWidget`).
- Desktop window behaviour: minimize-to-tray, confirm-before-exit, custom window title bar,
  GNOME/Wayland handling, fullscreen IPC, zoom shortcuts, update checks.
- Lock screen / timed fullscreen break blocker (`lockscreen.ts`, `full-screen-blocker.ts`),
  "focus window" options.
- Local REST API server (`local-rest-api.ts`) and the note / simple-counter / repeat REST route
  services; Jira IPC + image auth; clipboard image handler; image cache; secure file storage;
  `local-file-sync.ts`; `sync-path-resolver.ts`; `simple-store.ts`; `shared-state.ts`.
- Plugin `executeNodeScript` + node-execution consent (Electron-only capability).
- On-disk backup rotation/cleanup (`backup.ts`, `backup-file-cleanup.util.ts`).
- Desktop-only OAuth loopback and proxy paths for Dropbox/OneDrive/WebDAV/Nextcloud/LocalFile.
- Chromium-extension integration (idle / WebDAV bridging).
- Dev/QA surfaces: `/contrast-test`, e2e helpers, store-video scripts, `api-test-plugin`.
- Release/packaging: snap, flatpak, docker, `fastlane`, `electron-builder.yaml`, `nginx/`.

---

## 11. Open questions to resolve against v20.0.0

1. Does `priority` gain more than three levels, or a task-list quick control (today it only
   arrives via `p1`–`p3`)?
2. Did the task-view customizer gain new sort/group/filter axes or become the default view
   (replacing sections)?
3. Any change to the recurrence anchor fields (`monthlyWeekOfMonth`/`monthlyLastDay`/
   `repeatUntilDay`, or a new `repeatFromCompletionDate` variant)?
4. Did the short-syntax grammar change (new triggers, `p4`, duration units, recurrence words)?
5. Any new persisted task fields (all new fields must be optional on the Flutter side, with
   runtime defaults)?
6. Did the planner/schedule views change view-type set or drag modifiers (Shift = plan-for-day /
   reorder, Ctrl = keep the create-task slot while dragging)?
7. Android: notification channel/types or widget blob version bump (`v: 1` today).
