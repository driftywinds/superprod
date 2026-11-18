# Task core — Super Productivity v20.0.0

Implementation contract for the Flutter rewrite. Every rule cites its source.

**Path convention:** all `path:line` references are relative to
`original source code/` (upstream v20.0.0, `package.json:3`). Where a v20 rule
replaces a v19.2.0 rule, the marker **NEW in v20** appears inline and §8 lists them
all. Verified unchanged v19.2.0 → v20.0.0: `task.reducer.ts`,
`task.reducer.util.ts`, `work-context.selectors.ts`, `core/date/date.service.ts`,
`util/start-of-next-day.util.ts`, `util/is-today.util.ts`, all meta-reducers except
`task-shared-crud`/`task-shared-helpers`, and the whole `addTask()` submit body.

---

## 0. State containers

```
TaskState      = EntityState<Task> + ids:List<String>
                 + currentTaskId:String? + selectedTaskId:String?
                 + taskDetailTargetPanel:TaskDetailTargetPanel?
                 + lastCurrentTaskId:String? + isDataLoaded:bool
                 + dismissedCalendarAutoImportEventIdsByProvider:Map<String,List<String>>
                 task.model.ts:249-270
TaskArchive    = EntityState<ArchiveTask>, ids sorted        task.model.ts:57-59, archive.service.ts:74-79
ProjectState   = EntityState<Project>                        project.model.ts:49
TagState       = EntityState<Tag>                            tag.model.ts:18
WorkContextState = { activeId:String, activeType:'PROJECT'|'TAG' }   work-context.model.ts:87-91
AppState       = { todayStr:'YYYY-MM-DD', startOfNextDayDiffMs:int }  root-store/app-state/app-state.reducer.ts:7-15
PlannerState   = { days: Map<'YYYY-MM-DD', List<String>> }   features/planner/store/planner.reducer.ts
```

`TaskDetailTargetPanel` = `Default|Attachments|Notes|DONT_OPEN_PANEL` (`task.model.ts:13-18`).
`isDataLoaded` flips true on `loadAllData` / `allDataWasLoaded` (`task.reducer.ts:183,205`).

---

## 1. Task field table

Canonical type is the **intersection** of `packages/plugin-api/src/types.ts:391-425`
(`Task`) and `task.model.ts:86-175` (`TaskCopy` = `Omit<PluginTask, issue*>` +
`IssueFieldsForTask` + app fields). `Task = Readonly<TaskCopy>` (`task.model.ts:185`).
Units: `timeEstimate`/`timeSpent`/`timeSpentOnDay[*]` are **milliseconds**.

| Field | Dart type | Default | Notes |
|---|---|---|---|
| `id` | `String` | `''` then `nanoid()` on create | `DEFAULT_TASK.id=''` `task.model.ts:236`; real id `nanoid()` `task.service.ts:1470`. Never log content (`AGENTS.md`). |
| `title` | `String` | `''` | Required by plugin type (`types.ts:392`). Single-line: pasted newlines collapse to spaces `add-task-bar.component.ts:888`. |
| `notes` | `String?` | absent | Optional markdown (`types.ts:393`). |
| `timeEstimate` | `int` (ms) | `0` | `task.model.ts:240`. On a **parent** this is derived, see §4 `timeEstimate` rollup. |
| `timeSpent` | `int` (ms) | `0` | Always `sum(timeSpentOnDay.values)`; never set independently (`task.model.ts:239`, recomputed `calc-total-time-spent.ts:3-11`). |
| `isDone` | `bool` | `false` | `task.model.ts:241`. |
| `projectId` | `String` | `''` = no project | Plugin type allows `string \| null` (`types.ts:398`); app narrows to non-null `task.model.ts:100` and the add reducer coerces `task.projectId \|\| ''` (`task-shared-crud.reducer.ts:92`). Tolerate absent/null on read (legacy). `INBOX_PROJECT.id='INBOX_PROJECT'` is a normal project id. |
| `tagIds` | `List<String>` | `[]` | `task.model.ts:243`. **`'TODAY'` must never appear here** (`tag.const.ts:9-20`, `task-shared-crud.reducer.ts:83`). |
| `parentId` | `String?` | absent | Max nesting depth is 1 — enforced by the reducers, not the model: `canApplyConvertToSubTask` rejects a target that is itself a subtask plus self-nesting (`util/can-convert-task-to-sub-task.ts:47-55`), and `canConvertTaskToSubTask` also rejects a task that has subtasks, a `repeatCfgId`, any `issue*`, `dueWithTime`, `reminderId` or `remindAt` (`:16-25`). The drop path is looser — it unschedules first (`canDropTaskIntoSubTaskList`, `:35-36`). |
| `created` | `int` (ms epoch) | `Date.now()` | `DEFAULT_TASK` captures `Date.now()` once at module load (`task.model.ts:244`); creation overrides it per task (`task.service.ts:1468`). Used to pick the newest repeat instance (`task-shared-helpers.ts:344-364`). |
| `updated` | `int?` | absent | Plugin-API field only (`types.ts:402`); the app writes `modified` instead. |
| `subTaskIds` | `List<String>` | `[]` | `task.model.ts:237`. **The single source of truth for subtask order.** Duplicates are de-duped on load (`task.reducer.ts:112-134`). Subtasks are *also* held in the entity map; `subTaskIds` is authoritative for order and membership. |
| `timeSpentOnDay` | `Map<String,int>` (ms) | `{}` | `task.model.ts:238`. Key = local `YYYY-MM-DD` day string. Normalized to a non-null object on `loadAllData` (`task.reducer.ts:95-110`). Parent = sum of subtasks per day (`task.reducer.util.ts:36-80`). |
| `doneOn` | `int?` (ms epoch) | absent | `task.model.ts:158`. Set **only** on completion (`task.reducer.util.ts:126-150`); cleared on reopen. Completion never writes `dueDay` (see §4). |
| `wontDoOn` | `int?` (ms epoch) | absent | `task.model.ts:170`. Won't-do = `isDone && wontDoOn != null && wontDoOn == doneOn` (`util/is-wont-do-task.ts:12-13`). Reopen/complete stamp new `doneOn` so a stale value stops counting. |
| `attachments` | `List<TaskAttachment>` | `[]` | `task.model.ts:153`, `task-attachment.model.ts:13-23`. `TaskAttachment = { id:String?, type:String, title?, icon?, originalImgPath?, path?, ...DropPasteInput }`. |
| `remindAt` | `int?` (ms epoch) | absent | Reminder for `dueWithTime`; cleared whenever the schedule is cleared (`task-shared-scheduling.reducer.ts:143,247`). |
| `dueDay` | `String?` `YYYY-MM-DD` | absent | **Mutually exclusive with `dueWithTime`**; readers check `dueWithTime` first (`task.model.ts:114-136`). Invalid shape is cleared at creation (`task.service.ts:1498-1501`). |
| `dueWithTime` | `int?` (ms epoch) | absent | Takes priority over `dueDay` for all membership decisions. Setting it clears `dueDay` (`task-shared-scheduling.reducer.ts:80-84`). |
| `hasPlannedTime` | `bool?` | absent | Short-syntax marker: `false` means the `@`-token resolved to a day only, so the effect plans the day instead of scheduling a time (`short-syntax.ts:1006-1014`, `short-syntax.effects.ts:190-197`). Persisted if set. |
| `deadlineDay` | `String?` `YYYY-MM-DD` | absent | Mutually exclusive with `deadlineWithTime` (`task.model.ts:139-143`). |
| `deadlineWithTime` | `int?` | absent | `task.model.ts:149`. Clearing on set: `task-shared-deadline.reducer.ts:129-131`. |
| `deadlineRemindAt` | `int?` | absent | `task.model.ts:152`. |
| `reminderId` | `String?` | absent | Legacy local notification handle; cleared on archive (`archive.service.ts:55`). |
| `modified` | `int?` (ms epoch) | absent | Every `updateTask`/convert writes `Date.now()` (`task-shared-crud.reducer.ts:228,351,939`). |
| `repeatCfgId` | `String?` | absent | Link to a `TaskRepeatCfg`; cleared on restore if the cfg is gone (`task-shared-lifecycle.reducer.ts:77-86`). Stale refs on archive are kept. |
| `priority` | `int?` 1\|2\|3, or legacy `'high'\|'medium'\|'low'`, or `null` | absent | `task.model.ts:112`. 1=Low, 2=Medium, 3=High. `undefined` and `null` both mean "none" and sort/filter identically. **Read both encodings; write numbers only** (`task-priority.const.ts:36-50`). `'p1'`→3, `'p2'`→2, `'p3'`→1 (`short-syntax.ts:398`). |
| `_hideSubTasksMode` | `int?` 1\|2 | absent (= show all) | `task.model.ts:174`, `HideSubTasksMode.HideDone=1`, `HideAll=2` (`task.model.ts:7-11`). Persisted synced field despite the `_` prefix; written through `updateTaskUi` (`task.actions.ts:41-62`). Cleared on archive (`archive.service.ts:59`). |
| `issueId` | `String?` | absent | `task.model.ts:69`. Not unique (GitHub). |
| `issueProviderId` | `String?` | absent | `task.model.ts:70`. |
| `issueType` | `String?` (IssueProviderKey) | absent | `task.model.ts:71`. `'ICAL'` = calendar-sourced (`task.selectors.ts:32-36`). |
| `issueWasUpdated` | `bool?` | absent | `task.model.ts:72`. |
| `issueLastUpdated` | `int?` — **`null` is a real value** | absent | `task.model.ts:74` (`// TODO remove null again`). |
| `issueAttachmentNr` | `int?` | absent | `task.model.ts:75`. |
| `issueTimeTracked` | `Map<String,int>?` | absent | `task.model.ts:63-65,76`. |
| `issuePoints` | `int?` | absent | `task.model.ts:77`. |
| `issueLastSyncedValues` | `Map<String,dynamic>?` | absent | `task.model.ts:78`. Two-way-sync baseline. |

`DEFAULT_TASK` (`task.model.ts:235-247`) = exactly
`{id:'', subTaskIds:[], timeSpentOnDay:{}, timeSpent:0, timeEstimate:0, isDone:false,
title:'', tagIds:[], created:Date.now(), attachments:[]}` — **no** `projectId`
(omitted from the type), so the creator must supply it.

Cascade invariants (all reducers):
- parent `timeSpentOnDay` = per-day sum of subtasks; `timeSpent` = its total (`task.reducer.util.ts:36-80`).
- parent `timeEstimate` = `Σ over subtasks (isDone ? 0 : max(0, estimate - spent))` (`sum-sub-task-time-left.ts:10-18`, applied `task.reducer.util.ts:82-124`).
- a subtask is never in `project.taskIds`/`backlogTaskIds` nor in `tag.taskIds` as a top-level entry; it only appears nested (`task-shared-crud.reducer.ts:99-117` skips subtasks).

---

## 2. Project and Tag field tables

### Project

Base: plugin `Project` (`packages/plugin-api/src/types.ts:427-447`) plus
`ProjectCopy` = `Omit<PluginProject,'advancedCfg'|'theme'>` + `ProjectBasicCfg` +
`WorkContextCommon` + `issueIntegrationCfgs` (`project.model.ts:15-41`).

| Field | Dart type | Default | Notes |
|---|---|---|---|
| `id` | `String` | `''` (`DEFAULT_PROJECT`); `'INBOX_PROJECT'` for Inbox | `project.const.ts:11-24,26-39`. Inbox is auto-inserted at ids[0] if missing (`project.reducer.ts:72-85`). |
| `title` | `String` | `''` | `work-context.const.ts:49`. |
| `taskIds` | `List<String>` | `[]` | **Ordered, only top-level (non-subtask) tasks of this project.** Source of order for the project work view; no self-healing — stale ids are dropped at lookup (`work-context.selectors.ts:216`). |
| `backlogTaskIds` | `List<String>` | `[]` | Same, for the backlog list. A task is in at most one of `taskIds`/`backlogTaskIds`. |
| `noteIds` | `List<String>` | `[]` | Project notes. Reorder merges positions only, never membership (`project.reducer.ts:579-598`). |
| `isEnableBacklog` | `bool?` | `false` | Gate for every backlog move (`project.reducer.ts:310-313`). |
| `isArchived` | `bool?` | `false` | Hides from menu; archived projects' tasks are filtered out of active lists (`task.selectors.ts:83-94,158-166`). |
| `isDone` | `bool?` | `false` | Completion flag, distinct from archiving; `completeProject` sets both (`project.reducer.ts:203-216`). |
| `doneOn` | `int?` | `null` | `project.model.ts:23`. |
| `isHiddenFromMenu` | `bool?` | `false` | Hides from sidebar only; still a valid move target (`project.selectors.ts:86-90`). |
| `icon` | `String?` | `null` (`'list_alt'` for new projects, `'inbox'` for Inbox) | `project.const.ts:8,28`. |
| `theme` | `WorkContextThemeCfg` | `WORK_CONTEXT_DEFAULT_THEME` + `primary:'#29a1aa'` | Keys: `isAutoContrast`, `isDisableBackgroundTint`, `primary`, `huePrimary`, `accent`, `hueAccent`, `warn`, `hueWarn`, `backgroundImageDark`, `backgroundImageLight`, `backgroundOverlayOpacity`, `backgroundImageBlur` (`work-context.model.ts:45-58`, defaults `work-context.const.ts:23-37`). |
| `advancedCfg` | `{ worklogExportSettings: … }` | `WORKLOG_EXPORT_DEFAULTS` | `work-context.const.ts:7-14,39-50`. |
| `issueIntegrationCfgs` | `Map<String,dynamic>?` | absent | `project.model.ts:38`. |
| `created` | `int?` | absent | Plugin type only. |
| `updated` | `int?` | absent | Plugin type only. |

### Tag

Base: plugin `Tag` (`types.ts:449-461`) + `WorkContextCommon` (`tag.model.ts:11-16`).
Virtual/system tags: `TODAY` (`tag.const.ts:21-39`), `EM_URGENT`, `EM_IMPORTANT`,
`KANBAN_IN_PROGRESS` (`tag.const.ts:55-96`); system set `tag.const.ts:102-107`.

| Field | Dart type | Default | Notes |
|---|---|---|---|
| `id` | `String` | `''` | `'TODAY'` for the virtual Today tag. |
| `title` | `String` | `''` (`'Today'` for TODAY) | |
| `color` | `String?` | `null` | `types.ts:452`. |
| `created` | `int` | `Date.now()` | Required (`types.ts:453`). |
| `updated` | `int?` | absent | |
| `taskIds` | `List<String>` | `[]` | **Order only, not membership.** Membership comes from `task.tagIds` (regular tags) or `dueDay`/`dueWithTime` (`TODAY`). For TODAY it is *also* not authoritative — see §5. |
| `icon` | `String?` | `null` (`'wb_sunny'` for TODAY) | |
| `theme` | `WorkContextThemeCfg` | `WORK_CONTEXT_DEFAULT_THEME` + `primary:'#a05db1'` | TODAY overrides: `isAutoContrast:true, huePrimary:'400', hueAccent:'500', hueWarn:'500', primary:'#6495ED', backgroundImageDark:'', isDisableBackgroundTint:true` (`tag.const.ts:28-38`). |
| `advancedCfg` | same as Project | `WORKLOG_EXPORT_DEFAULTS` | |

`TODAY_TAG` is force-inserted at `ids[0]` if missing on init and after
`loadAllData` (`tag.reducer.ts:189-208,215-217`).

---

## 3. New-task defaults

### 3.1 The one factory

`TaskService.createNewTaskWithDefaults` (`task.service.ts:1452-1525`) is the only
creator; the add-task bar and add-subtask path both go through it.

```
createNewTaskWithDefaults({title, id?, additional, workContextType?, workContextId?}) -> Task:
  d = DEFAULT_TASK                                     # §1 defaults
  d.created = Date.now()
  d.title   = title ?? ''
  d.id      = id ?? nanoid()
  d.projectId = workContextType == PROJECT
                  ? workContextId
                  : (globalConfig.tasks.defaultProjectId ?? INBOX_PROJECT.id)     # :1472-1478
  d.tagIds  = (workContextType == TAG
               && !additional.parentId
               && workContextId != 'TODAY') ? [workContextId] : []                # :1480-1485
  d.dueDay  = (workContextId == 'TODAY'
               && !additional.parentId
               && !additional.dueWithTime
               && !('dueDay' in additional)) ? todayStr : <unset>                 # :1487-1492
  d = {...d, ...additional}                                                       # :1494
  if (d.dueDay is set && !isDBDateStr(d.dueDay))     d.dueDay = undefined         # :1498-1501
  if (d.deadlineDay is set && !isDBDateStr(...))     d.deadlineDay = undefined    # :1502-1509
  if (!d.projectId) d.projectId = workContextType == PROJECT
                                    ? workContextId
                                    : (tasks.defaultProjectId ?? 'INBOX_PROJECT')  # :1511-1516
  assert(type) ; return d
```
Note the `'dueDay' in additional` test is a **presence** test, not a value test —
an explicit `dueDay: undefined` (as the add bar always passes when the user picked
no date, `add-task-bar.component.ts:663`) suppresses the Today auto-assignment.

`workContextId/Type` are read from the *active* work context
(`task.service.ts:402-404`) — not from the caller.

### 3.2 Post-add side effects that also shape the task

`addTask` is dispatched with `getDeadlineAutoPlanFields(...)`
(`task.service.ts:414-428`). Then:

1. **Reducer** `handleAddTask` (`task-shared-crud.reducer.ts:67-163`) — see §4.1.
   It sets `timeSpent = calcTotalTimeSpent(timeSpentOnDay)`, strips `TODAY` from
   `tagIds`, and coerces `projectId || ''`.
2. **Deadline auto-plan** (`task-shared-deadline.reducer.ts:199-211`): if the new
   task has a deadline today, it is added to Today (see §4.14).
3. **Default estimate** (`task-internal.effects.ts:78-102`): if `timeEstimate` is
   falsy, set it from `timeTracking.defaultEstimate` (main task) or
   `defaultEstimateSubTasks` (subtask). Both default to `0`, i.e. a no-op by default
   (`default-global-config.const.ts:215-216`).
4. **Short syntax re-parse** (`short-syntax.effects.ts:60-286`) — see §3.7.

### 3.3 add-from-project

```
{...DEFAULT_TASK, created:now, id:nanoid, title,
 projectId: <that project id>,
 tagIds: [],                       # unless in a tag context
 dueDay: absent, dueWithTime: absent,
 timeEstimate: 0, timeSpentOnDay: {}, isDone:false, attachments:[], subTaskIds:[]}
```
→ lands only in `project.taskIds` (`task-shared-crud.reducer.ts:99-117`), unless
`isAddToBacklog && project.isEnableBacklog` → `backlogTaskIds` (`:106-116`).

### 3.4 add-from-tag (regular tag)

`workContextType == TAG`, `workContextId != 'TODAY'` →
`projectId = tasks.defaultProjectId ?? 'INBOX_PROJECT'`, `tagIds = [thatTagId]`,
no `dueDay`. → appended to `tag.taskIds` for every existing tag in `tagIds`
(`task-shared-crud.reducer.ts:121-141`) and inserted into its project list.
`tag.taskIds` gets the id inserted **at the front** unless `isAddToBottom`
(`task-shared-helpers.ts:313-336`).

### 3.5 add-from-Today

`workContextType == TAG`, `workContextId == 'TODAY'` →
`projectId = defaultProjectId ?? 'INBOX_PROJECT'`, `tagIds = []`,
`dueDay = todayStr` (logical today) → membership in Today plus a `TODAY_TAG.taskIds`
entry (`task-shared-crud.reducer.ts:76-77,121-141`).

### 3.6 add-from-Inbox

Inbox is a **project** (`INBOX_PROJECT.id`), so this is §3.3 with
`projectId='INBOX_PROJECT'`. From any other project context where
`tasks.defaultProjectId` is set, a task on a tag context still lands in the default
project, not Inbox.

### 3.7 add-from-add-bar (incl. short syntax)

The bar keeps its own parsed state and builds `taskData` before calling `add()`
(`add-task-bar.component.ts:531-756`):

```
title = state.cleanText || rawInput                     # :550 (short syntax already stripped)
finalTagIds = [...state.tagIds /*picked*/, ...state.tagIdsFromTxt /*#tag*/]
if state.newTagTitles.length: confirm dialog -> create tags -> append ids   # :558-564, 1047-1063
finalTagIds -= tagsToRemove[]                            # :567-570
taskData = {
  ...additionalFields,                                   # caller-provided (issue, view prefill…)
  projectId: state.projectId,                            # +project or default (§3.7.1)
  tagIds: unique([...finalTagIds, ...(additionalFields.tagIds ?? [])]),
  timeEstimate: state.estimate || 0,                     # 0 forced when unset
  attachments: state.attachments.length ? state.attachments : (additionalFields.attachments ?? []),
  notes: noteTxt.trim() || absent,
  timeSpentOnDay: state.spent || absent,
  priority: state.priority || absent,
  deadlineDay / deadlineWithTime (+deadlineRemindAt) from state,   # :600-620
  dueWithTime | dueDay from state.date/state.time     # :641-664
}
startDay = rollWeekendDateForRepeat(state.date || todayStr, state.repeat)  # :636-639
if state.date && state.time:  dueWithTime = local(date@time); hasPlannedTime = true   # :647-652
elif state.date:              dueDay = startDay
elif state.repeat non-DIALOG: dueDay = startDay
else:                         dueDay = undefined (explicit)          # :660-664
taskId = taskService.add(title, isAddToBacklog, taskData, isAddToBottom)
if dueWithTime: scheduleTask(task, dueWithTime, remindOption)          # :684-696
if state.repeat: create repeat cfg (startDate=startDay, title, notes, priority,
                                     tagIds, defaultEstimate, startTime, remindAt)  # :698-745
```

**Defaults the bar injects per context** (`add-task-bar.component.ts:249-294`):

- `defaultProject$`: active project if the context is a project; else
  `tasks.defaultProjectId`; else `INBOX_PROJECT` (`:259-267`).
- `defaultDateAndTime$`: `planForDay` arg if given; else **Today context →
  `date = todayStr`**; else no date (`:271-294`). This is why a task added from
  Today lands on today even though the bar explicitly passes `dueDay`.
- default tags: only when the context is a *regular* tag → `[contextId]`
  (`:1099-1107`); Today and projects get `[]`.
- `isAddToBottom` defaults to a per-work-context UI preference
  (`:183`); `isAddToBacklog` starts `false` (`:186`).

#### 3.7.1 Short-syntax tokens the bar understands

Parsed by `shortSyntax()` (`short-syntax.ts:434-580`), in this order:

| Token | Effect | Cite |
|---|---|---|
| `p1`/`p2`/`p3` | `priority` 3/2/1 (last wins, all consumed) | `short-syntax.ts:396-398,1433-1452` |
| `30m`, `1h`, `1.5h`, `30m/1h` | before `/` = `timeSpentOnDay[today]` (absolute total), after `/` = `timeEstimate` | `short-syntax.ts:66-70,1454-1491` |
| `@…` date | chrono parse; with an explicit hour → `dueWithTime`; day only → `dueWithTime` at that day's resolved time **and** `hasPlannedTime:false` | `short-syntax.ts:976-1015` |
| `@18h`, `@9h30` | `dueWithTime` at the next occurrence of that clock time | `short-syntax.ts:948-974` |
| `@5` | `dueWithTime` at 05:00, rolling to tomorrow if passed | `short-syntax.ts:1018-1053` |
| `@every …`, `@daily`, `@weekly`… | repeat cfg (`isParseRepeat` only) | `short-syntax.ts:213-292,911-915` |
| `!…` | `deadlineWithTime`/`deadlineDay` (only when `shortSyntax.isEnableDeadline`, default **false**) | `short-syntax.ts:515-522`; `default-global-config.const.ts:83` |
| `+project` | `projectId` (archived projects excluded) | `short-syntax.ts:524-536` |
| `#tag` | `tagIds`; unknown titles → `newTagTitles` (confirmation required) | `short-syntax.ts:538-547`; `short-syntax.effects.ts:288-346` |
| URLs / markdown links | `attachments` | `short-syntax.ts:553-563` |

Toggle switches: `shortSyntax.{isEnableProject,isEnableDue,isEnableDeadline,
isEnablePriority,isEnableTag,urlBehavior}` with defaults
`true,true,false,true,true,'keep'` (`default-global-config.const.ts:80-87`).

**Double parse is intentional.** The bar cleans the title; the `addTask` effect then
re-parses the cleaned title (`short-syntax.effects.ts:60-143`) and folds every
result into one atomic `applyShortSyntax` action (`:261-269`). `isIgnoreShortSyntax`
skips this for external content (`types.ts:974-979`, `short-syntax.effects.ts:63-66`).
For **title edits**, only the words typed since the shared title are parsed
(**NEW in v20**, `util/short-syntax-for-new-words.ts:21-53`).

`schedulingInfo` derived from the parse (`short-syntax.effects.ts:178-209`):
`dueWithTime && hasPlannedTime !== false` → schedule with time (and
`remindAt = remindOptionToMilliseconds(dueWithTime, reminder.defaultTaskRemindOption)`);
`hasPlannedTime === false` → `{day: dateOf(dueWithTime), isAddToTop:false}`.

---

## 4. Reducers — exact state transitions

Ordering of the meta-reducer chain matters: the handlers below run **before** the
feature reducers (`taskSharedCrudMetaReducer` etc. wrap the root reducer and hand
their result on, e.g. `task-shared-crud.reducer.ts:1133-1146`).

### 4.1 ADD (`TaskSharedActions.addTask`) — `task-shared-crud.reducer.ts:67-163`

```
todayStr    = appState.todayStr ?? getDbDateStr()
newTask     = {...DEFAULT_TASK, ...task,
               tagIds: task.tagIds - 'TODAY',
               timeSpent: Σ task.timeSpentOnDay.values,
               projectId: task.projectId || ''}
taskState   = addOne(newTask)
if task.projectId exists in projects && !task.parentId:
    targetList = (isAddToBacklog && project.isEnableBacklog) ? backlogTaskIds : taskIds
    project[targetList] = addTaskToListAtAnchor(project[targetList], task.id,
                              anchorId, isAddToBottom)
anchorId = getPreviousRepeatInstanceId(state, task)      # NEW in v20; repeat instance
                                                         # takes the previous one's slot
tagIdsToUpdate = (newTask.tagIds ++ (task.dueDay == todayStr ? ['TODAY'] : []))
                   .filter(exists)
for each: tag.taskIds = addTaskToListAtAnchor(tag.taskIds, task.id, anchorId, isAddToBottom)
if task.dueDay && task.dueDay != todayStr:
    planner.days[dueDay] = unique(isAddToBottom ? [...ids, task.id] : [task.id, ...ids])
```
`addTaskToListAtAnchor` (`task-shared-helpers.ts:326-336`): no-op if already
present; if `anchorId` found, insert **immediately above** the anchor; else
`addTaskToList` = prepend (or append when `isAddToBottom`).
`getPreviousRepeatInstanceId` (`:344-364`): newest `created` other main task with the
same `repeatCfgId`, still in state; `undefined` for a first instance or a subtask.

Note `workContextId`/`workContextType` are **not** read here — placement is derived
from `task.projectId` / `task.tagIds` / `task.dueDay`.

### 4.2 ADD SUBTASK (`addSubTask`) — `task.reducer.ts:512-566`

```
parent must exist, else devError and no-op
insert task with:
  parentId  = parentId
  tagIds    = []                       # always emptied
  projectId = parent.projectId         # always inherited
  if parent.subTaskIds.isEmpty && task.timeSpentOnDay.isEmpty:
      timeSpentOnDay = parent.timeSpentOnDay ; timeSpent = Σ
  if parent.subTaskIds.isEmpty && !task.timeEstimate:
      timeEstimate = parent.timeEstimate
parent.subTaskIds = parent.subTaskIds ++ [task.id]   # unless already present
if currentTaskId == parentId: currentTaskId = task.id
reCalcTimesForParentIfParent(parentId)
```
Creator side: `addSubTaskTo` (`task.service.ts:817-836`) uses
`createNewTaskWithDefaults` with the caller's `additional` (so `tagIds` are computed
by the factory and then discarded by the reducer). Default estimate for a subtask
comes from `timeTracking.defaultEstimateSubTasks` (`task-internal.effects.ts:84-87`).

### 4.3 UPDATE (`TaskSharedActions.updateTask`) — `task-shared-crud.reducer.ts:807-1026`

```
if task not in state: no-op
1  strip a synthetic completion dueDay: when changes.isDone===true and
   changes.dueDay is a string and (task already had a schedule or is a subtask) and
   changes.dueDay == dateStr(changes.doneOn ?? today) != task.dueDay
   -> delete changes.dueDay                                    # :749-781
2  when changes.isDone===true: tagIds -= 'KANBAN_IN_PROGRESS'    # :783-805
3  projectId guard: drop changes.projectId unless
   typeof string && !task.parentId && (projectId == '' || project exists)  # :837-847
4  if changes.tagIds: handleTagUpdates(old,new)                 # :850-855, 1028-1067
     removed = old - new, minus 'TODAY', minus non-existent:
        for each: tag.taskIds -= taskId
     added   = new - old, minus 'TODAY', minus non-existent:
        for each: tag.taskIds = unique([taskId, ...tag.taskIds])   # prepend
5  if changes.projectId (string) && !task.parentId:             # :857-923
     subTaskIds = payload.projectMoveSubTaskIds ?? state-scanned subtasks
     allTaskIds = [taskId, ...subTaskIds]
     remove allTaskIds from EVERY project's taskIds and backlogTaskIds
     if target project exists:
        same project  -> keep placement: drop subtask ids; if taskIds has taskId then
                         backlogTaskIds -= taskId, else if backlog lacks taskId then
                         taskIds += taskId
        other project -> target.taskIds = unique([...target.taskIds, taskId])  # append
     set projectId = target on every subtask
6  timeSpentOnDay -> updateTimeSpentForTask (recomputes timeSpent, adjusts parent
   incrementally, deleting zero/negative parent days)          # :929-931, util:181-262
   timeEstimate present or 'isDone' in changes -> updateTimeEstimateForTask
                                                               # :932, util:264-288
   isDone present -> updateDoneOnForTask (doneOn=now|given / undefined)  # :933, util:126-150
7  updateOne(changes ++ {modified: Date.now()})                 # :934-943
8  if isDone===true && !parentId && currentTask.dueDay==today && TODAY_TAG lacks id:
       TODAY_TAG.taskIds += taskId                              # :950-964
9  dueDay transition (newDueDay = changes.dueDay if the key is present, else
   taskAfter.dueDay when a completion changed it)                # :966-1023
     remove task from ALL planner days
     if newDueDay && newDueDay != today && !isToDone: planner.days[newDueDay] += taskId (append)
     old==today && new!=today -> TODAY_TAG.taskIds -= taskId; also strip 'TODAY' from
                                 task.tagIds (legacy cleanup)
     old!=today && new==today -> TODAY_TAG.taskIds += taskId (append, if absent)
```
Other update shapes:
- `__updateMultipleTaskSimple` → `updateMany` only, no side effects (`task.reducer.ts:381-383`).
- `TaskSharedActions.updateTasks` → `updateMany` only (`task.reducer.ts:398-400`).
- `updateTaskUi` → `updateOne` with `applyClearedFields` restoring keys that a
  replayed op lost to JSON (`task.reducer.ts:385-395`). This is the only writer of
  `_hideSubTasksMode`, and **no** meta-reducer or effect reacts to it (`task.actions.ts:41-46`).

### 4.4 COMPLETE / UNCOMPLETE

There is no dedicated complete action: both are `updateTask({changes:{isDone}})`.
Effect from `updateDoneOnForTask` (`task.reducer.util.ts:126-150`):

```
complete (isDone:true):   doneOn = (changes.doneOn if number else Date.now())
                          dueDay / dueWithTime / remindAt UNCHANGED
uncomplete (isDone:false): doneOn = undefined            # key removed
                          wontDoOn left as-is (stops counting, §1)
```
Won't-do is the same action with `{isDone:true, doneOn:now, wontDoOn:now}`
(`util/is-wont-do-task.ts:20-26`).

Nothing is removed from `TODAY_TAG.taskIds`, `project.taskIds`, `tag.taskIds` or the
planner on completion — the lists split done/undone by `isDone` at read time (§5).

Auto-complete parent (**effect**, `task-internal.effects.ts:44-76`): when all subtasks
are `isDone` and at least one is *completed* (not all won't-do) and the parent is not
done → `updateTask(parent, {isDone:true})`. Gated by
`tasks.isAutoMarkParentAsDone` (default `false`,
`default-global-config.const.ts:46`).

### 4.5 DELETE (`deleteTask` / `deleteTasks`) — `task-shared-crud.reducer.ts:425-580`

`deleteTask` (single):
```
taskState = deleteTaskHelper(state, task)              # task.reducer.util.ts:290-353
   removeOne(task.id)
   currentTaskId = (currentTaskId == task.id) ? null : currentTaskId
   if task.parentId: removeTaskFromParentSideEffects   # util:355-393
   subTaskIds = task.subTaskIds ∪ {ids whose parentId == task.id}   # orphan repair
   removeMany(subTaskIds); currentTaskId = null if it was one of them
dismissedCalendarAutoImportEventIdsByProvider += ICAL ids of task + its subtasks
if task.projectId: project.taskIds -= id ; project.backlogTaskIds -= id
removeTasksFromAllTags([task.id, ...task.subTaskIds])   # scans EVERY tag
```
`removeTaskFromParentSideEffects(state, task, isCopyTimesAfterLast)` (`util:355-393`):
- remove id from parent's `subTaskIds`;
- if it was the **last** subtask and `isCopyTimesAfterLast` (delete/archive path), copy
  `timeSpentOnDay` and `timeEstimate` onto the parent;
- else recompute parent `timeSpentOnDay`/`timeSpent` and `timeEstimate`.

`deleteTasks` (bulk) mirrors it, but removes each parent-surviving subtask through the
singular path in the parent's `subTaskIds` order first (so the "last subtask" time copy
is deterministic), then `removeMany(allIds)`; it also removes all affected ids from
every project list and every tag. **Planner days are not touched** — stale ids stay
until `PlannerActions.cleanupOldAndUndefinedPlannerTasks`
(`features/planner/store/planner.reducer.ts:75-100`).

### 4.6 MOVE to another project (`moveToOtherProject`) — `project-shared.reducer.ts:38-90`

```
canonical   = state.entities[task.id]
subTaskIds  = unique(canonical.subTaskIds ∪ task.subTaskIds)
srcProject  = canonical.projectId ?? task.projectId
allTaskIds  = [task.id, ...subTaskIds]
srcProject.taskIds -= allTaskIds ; srcProject.backlogTaskIds -= allTaskIds
target.taskIds = unique([...target.taskIds, task.id])          # append, parent only
for id in allTaskIds: task.projectId = targetProjectId
```
Subtask drag/drop uses `speakLater`→ `moveSubTask` instead; a *project change* on the
parent always carries the subtasks with it.

### 4.7 MOVE task between lists of one project (backlog ⇄ today)

- today → backlog (`project.reducer.ts:308-330`): requires
  `project.isEnableBacklog`, else `Log.err` and no-op. `taskIds -= id`,
  `backlogTaskIds = moveItemAfterAnchor(id, afterTaskId, backlogTaskIds)`.
- backlog → today (`project.reducer.ts:332-359`): `backlogTaskIds -= id`;
  if `afterTaskId === null && target === 'DONE'` → append to end of `taskIds`,
  else `moveItemAfterAnchor`.
- auto variants used by scheduling: to backlog prepends
  (`project.reducer.ts:505-525`), to regular prepends or appends per `isMoveToTop`
  (`:527-545`), both no-ops if already in the target list.

### 4.8 REORDER inside a list

Generic anchor move (`work-context-meta.helper.ts:18-48`):
```
listWithout = list without itemId
if afterItemId == null:            return [itemId, ...listWithout]        # to start
anchorIdx = listWithout.indexOf(afterItemId)
if anchorIdx == -1:
    if itemId was in list:        return list                # concurrent anchor delete: no-op
    else:                         return [...listWithout, itemId]   # cross-list fallback: append
return listWithout with itemId spliced at anchorIdx+1
```
Dispatch sites:
- `moveTaskInTodayList` (`tag.reducer.ts:229-259`, `project.reducer.ts:105-129`):
  if `afterTaskId === null && target === 'DONE'` → remove & append to end; else the
  generic anchor move. `target` is the *destination section*, `'DONE' | 'UNDONE'`.
- move up/down (`tag.reducer.ts:261-309`, `project.reducer.ts:361-401`) use
  `moveUndoneTaskUpInList` / `moveUndoneTaskDownInList` (**NEW in v20**,
  `work-context-meta.helper.ts:144-189`) with the op's `undoneTaskIds` snapshot:
  move to right before the upper neighbour, skipping done tasks; if that neighbour
  vanished, take its slot after the nearest surviving earlier task (this makes a move
  commute with a concurrent delete). Legacy fallback =
  `arrayMoveLeftUntil`/`arrayMoveRightUntil` over ids absent from the snapshot.
- move to top/bottom = `arrayMoveToStart`/`arrayMoveToEnd`
  (`array-move.ts:80-96`, called from `tag.reducer.ts:311-343`,
  `project.reducer.ts:403-435`).
- backlog up/down still use `arrayMoveLeftUntil`/`RightUntil`
  (`project.reducer.ts:437-473`).
- `moveTaskInTodayTagList` (`task-shared-scheduling.reducer.ts:288-308`): requires
  both ids in `TODAY_TAG.taskIds`; `moveItemBeforeItem` (`util/move-item-before-item.ts:3-24`)
  places `fromTaskId` immediately before `toTaskId`.

Subtasks:
- `moveSubTask` (`task.reducer.ts:402-471`): guards — both parents must exist, no
  self-move (`taskId != srcTaskId`, `!= targetTaskId`), no cycle
  (`wouldCreateCircularReference`, `:67-84`, walks `parentId` chain). Then remove from
  old parent's `subTaskIds` + `reCalcTimesForParentIfParent(old)`; insert into new
  parent at `moveItemAfterAnchor(taskId, afterTaskId, …)` +
  `reCalcTimesForParentIfParent(new)`; set `task.parentId = newParent.id` and
  `task.projectId = newParent.projectId`.
- `moveSubTaskUp/Down/ToTop/ToBottom` (`task.reducer.ts:473-487,136-165`):
  `arrayMoveLeft|Right|ToStart|ToEnd` over the parent's `subTaskIds`; no-op with a
  logged error if the subtask is not in the parent's list.

### 4.9 CONVERT

`convertToSubTask` (`task-shared-crud.reducer.ts:290-363`):
```
guard canApplyConvertToSubTask(task, targetParent)   # util/can-convert-task-to-sub-task.ts:47-55:
   task and parent exist, task.id != parent.id, parent.parentId is empty,
   task has no parentId, no subTaskIds, no repeatCfgId, no issue*, no dueWithTime,
   no reminderId, no remindAt                                        -> else NO-OP
```
then:
```
srcProject.taskIds -= id ; srcProject.backlogTaskIds -= id
if TODAY_TAG.taskIds has id: TODAY_TAG.taskIds -= id          # dueDay is cleared below
remove task from ALL planner days
targetParent.subTaskIds = moveItemAfterAnchor(id, afterTaskId, parent.subTaskIds)
task.parentId  = targetParent.id
task.projectId = targetParent.projectId
task.dueDay    = undefined
task.modified  = Date.now()
reCalcTimesForParentIfParent(targetParent)
# tagIds are KEPT (#9651); only the TODAY ordering entry is dropped
```

`convertToMainTask` (`:165-288`):
```
keptTagIds = own stored tagIds (minus TODAY) if non-empty, else parent's tagIds (minus TODAY)
remove task from its parent's subTaskIds (+ side effects)
parentId = undefined ; tagIds = keptTagIds ; modified = captured ?? now
if isPlanForToday && !dueWithTime: dueDay = today
if isDone !== undefined:
   isDone  -> isDone, doneOn = capturedDoneOn ?? now, dueDay = today, dueWithTime = undefined
   undone  -> isDone=false, doneOn = undefined
srcProject.taskIds = positionConverted(taskIds)     # append when (afterTaskId==null && isDone),
                                                   # else moveItemAfterAnchor
for each of keptTagIds ++ (isPlanForToday ? ['TODAY'] : []) that exists:
   tag.taskIds = positionConverted(tag.taskIds)
```

### 4.10 ARCHIVE (`moveToArchive`) — `task-shared-lifecycle.reducer.ts:35-52`

```
taskIdsToArchive = collectTaskAndSubTaskIds(state, [ids from payload],
                     payload subTaskIds + payload subTasks ids)   # helpers:67-91
                   = payload ids ∪ parents' state subTaskIds ∪ reverse child scan
removeTasksFromAllProjects(taskIdsToArchive)      # every project, both lists
removeTasksFromAllTags(taskIdsToArchive)          # every tag
task.reducer: for each payload task -> deleteTaskHelper(...)    # task.reducer.ts:643-651
```
So active state loses the tasks; the archive write is a separate effect path
(`ArchiveOperationHandler`) which stores `ArchiveTask` per
`archive.service.ts:31-63`: `isDone:true`, `doneOn = task.doneOn ?? parent.doneOn ??
now`, `reminderId/dueWithTime/dueDay/_hideSubTasksMode = undefined`. Archive ids are
kept sorted (`:74-79`).

### 4.11 RESTORE (`restoreTask`) — `task-shared-lifecycle.reducer.ts:88-220`

```
idempotent: no-op if the root already exists (or is a prototype name)
task = normalizeRestoredTask({...task, isDone:false, doneOn:undefined}, state)
   projectId -> INBOX if its project is gone (or undefined if Inbox gone)
   tagIds    -> remove 'TODAY' and every non-existent tag
   repeatCfgId -> undefined if the cfg is gone
task.projectId ??= ''
subTasks = payload subtasks that belong to the root and are absent-or-child-of-root,
           normalized the same way, parentId=root, projectId=root.projectId
addMany([root, ...subTasks])
adopt reverse-linked children (parentId == root.id) -> root.subTaskIds normalized
removeTasksFromAllProjects(restoredTaskIds)
root project: taskIds = unique([...taskIds, root.id])          # append
for every restored task's tags: tag.taskIds = unique([...taskIds, ...ids])  # append
if restoreToToday: scheduling meta-reducer also runs planTasksForToday (§4.13) and
                   the action creator materialized dueDay=today / remindAt=undefined
                   (+ clear dueWithTime when it wasn't today)  (task-shared.actions.ts:199-245)
```

`restoreDeletedTask` (undo delete) is the *other* path
(`task-shared-crud.reducer.ts:627-743`): merge semantics — `addMany` with
`modified: now`, then `mergeTaskIdsAtPositions(captured, current, restoredIds)`
(`:587-617`, insert at the captured index, clamped) for the parent's `subTaskIds`,
each tag's `taskIds`, and either the project's `taskIds` or `backlogTaskIds` (whichever
held the task).

### 4.12 SCHEDULE / UNSCHEDULE / PLAN

`scheduleTaskWithTime` / `reScheduleTaskWithTime`
(`task-shared-scheduling.reducer.ts:40-124`):
```
if currentTask.dueWithTime==due && remindAt==remindAt
   && isToday(due)==TODAY_TAG.contains(id) && !isMoveToBacklog: no-op
task.dueWithTime = due ; task.dueDay = undefined ; task.remindAt = remindAt
if isMoveToBacklog && project.isEnableBacklog && !backlog.contains(id):
   project.taskIds -= id ; project.backlogTaskIds = [id, ...backlog]
if isTodayWithOffset(due) != TODAY_TAG.contains(id):
   joining  -> TODAY_TAG.taskIds = unique([id, ...taskIds])       # prepend
   leaving  -> TODAY_TAG.taskIds -= id
planner.reducer: remove the task from every planner day          # planner.reducer.ts:32-46
```

`unscheduleTask` (`:126-164`):
```
task.dueDay      = isLeaveInToday ? today : undefined
task.dueWithTime = undefined ; task.remindAt = undefined
if TODAY_TAG contains id && !isLeaveInToday: TODAY_TAG.taskIds -= id
planner: remove from every day
```

`planTasksForToday` (`:182-270`):
```
today  = action.today  ?? appState.todayStr ?? getDbDateStr()
offset = action.startOfNextDayDiffMs ?? appState.startOfNextDayDiffMs ?? 0
newTasksForToday = ids where task exists && TODAY_TAG lacks id && parent not in TODAY_TAG
tasksNeedingUpdate = ids where
   (dueDay != today && (in newTasksForToday || TODAY_TAG contains id))
   || (dueDay == today && isClearScheduledTime && (remindAt != null || dueWithTime != null))
if both empty: NO-OP
for each tasksNeedingUpdate:
   shouldClearTime = isClearScheduledTime ? dueWithTime != null
                                         : shouldClearDueTimeForToday(dueWithTime, today, offset)
   changes: dueDay = today, remindAt = undefined, (+ dueWithTime = undefined if shouldClearTime)
TODAY_TAG.taskIds = unique([...newTasksForToday, ...existing])    # PREPEND in argument order
remove ALL taskIds from every planner day
```
`shouldClearDueTimeForToday` (`util/is-today.util.ts:27-39`): `false` for null/undefined;
`true` for an invalid timestamp; else `!isTodayWithOffset(dueWithTime, today, offset)`
— i.e. a time that already lands on today is **kept**.

`planTaskForDay` (`PlannerActions`, `planner-shared.reducer.ts:174-261`):
```
task.dueDay = day ; task.dueWithTime = undefined ; task.remindAt = undefined   (task.reducer.ts:738-750)
if day == today: TODAY_TAG.taskIds = unique(isAddToTop ? [id, ...others] : [...others, id])
elif TODAY_TAG contains id: TODAY_TAG.taskIds -= id
remove from all planner days
if day != today: planner.days[day] = insert(id at isAddToTop ? 0 : Infinity)
                 and remove the task's subTaskIds from that day only
```
`transferTask` (`planner-shared.reducer.ts:36-172`) is the drag-across-days variant:
same `dueDay`/`dueWithTime` write, planner day bookkeeping, and a `TODAY_TAG.taskIds`
insert at the target index / removal, plus a `TODAY` cleanup in `tagIds`.

`moveBeforeTask` (`task.reducer.ts:720-736` + `planner-shared.reducer.ts:263-308`):
sets `dueDay = target.dueDay`, `dueWithTime = undefined`, and, when the target is in
Today, splices the source in **before** the target in `TODAY_TAG.taskIds`
(removing it from Today if the target is not).

`dismissReminderOnly` (`:166-180`): only `remindAt = undefined`.

### 4.13 Deadlines

`setDeadline` (`task-shared-deadline.reducer.ts:97-144`): validates formats, then
`deadlineDay = deadlineWithTime ? undefined : deadlineDay`,
`deadlineWithTime = deadlineDay ? undefined : deadlineWithTime`,
`deadlineRemindAt = deadlineRemindAt`, and runs the auto-plan (§4.14).
`removeDeadline` clears all three (`:156-174`); `clearDeadlineReminder` clears
`deadlineRemindAt` only (`:176-192`).

### 4.14 Deadline auto-plan

`autoPlanTaskDueToDeadline` (`task-shared-deadline.reducer.ts:30-95`), decision
`getDeadlineAutoPlanDecision` (`util/get-deadline-auto-plan-fields.ts:83-139`):

```
skip if isDone, or the deadline is not today (deadlineWithTime's logical day, else deadlineDay)
skip if the subtask's parent is in TODAY_TAG or the parent is due today
dueTodayBySchedule (dueWithTime's logical day == today, else dueDay == today):
    if not already in TODAY_TAG.taskIds -> add to Today order only (no field writes)
no due date/time at all  -> dueDay = today, add to Today
scheduled for an earlier day -> dueDay = today, and if dueWithTime was set also clear
                               dueWithTime + remindAt
scheduled for a LATER day -> skip (the user's forward plan wins)
writes: if dueDay updated, remove the task from all planner days
        TODAY_TAG.taskIds = unique([taskId, ...taskIds])          # prepend
```

### 4.15 TAG membership writes

- `addTagToTask` (`task.reducer.ts:627-639`): **only** `task.tagIds =
  unique([...tagIds, tagId])`. The tag's `taskIds` is *not* touched — this is a legacy
  action (`tag.reducer.ts:389`); the current path is `updateTask({tagIds})` (§4.3
  step 4).
- `removeTagsForAllTasks` (`tag-shared.reducer.ts:334-347`): strips the ids from every
  task's `tagIds`; **no** orphan cleanup.
- `deleteTag` / `deleteTags` (`tag-shared.reducer.ts:276-328`): strip the ids from
  every task; a task left with no `tagIds`, no `projectId` and no `parentId` is
  deleted together with its `subTaskIds`; then repeat cfgs lose the tags (and are
  deleted if they have no tags and no project), `timeTracking.tag[tagId]` is removed,
  and issue providers lose the tag from `defaultTagIds`. `updateTag` filters
  `taskIds` down to ids that exist (`:54-97`).

### 4.16 `applyShortSyntax` — one atomic op (`short-syntax-shared.reducer.ts:61-156`)

```
if targetProjectId && != current.projectId: moveTaskToProject (§4.6 semantics, but
     the target list write is `unique([...target.taskIds, task.id])`)
if schedulingInfo.dueWithTime: handleScheduleWithTime  -> additional changes
                               {dueWithTime, dueDay:undefined, remindAt?}
elif schedulingInfo.day:       handlePlanForDay        -> {dueDay:day, dueWithTime:undefined}
                               (+ TODAY add/remove + planner day add/remove,
                                  + tagIds cleanup if 'TODAY' was present)
if timeSpentOnDay: merged = {...current.timeSpentOnDay, ...changes.timeSpentOnDay};
                   updateTimeSpentForTask; remove from the change set
updateOne(remaining changes)
if 'timeEstimate' in changes && task has a parent: reCalcTimeEstimateForParentIfParent
```

### 4.17 Project / tag lifecycle

- `archiveProject` sets `isArchived:true`; refuses Inbox; `unarchiveProject` clears
  `isArchived/isDone/doneOn`; `completeProject` sets
  `{isDone:true, doneOn, isArchived:true}`; `reopenProject` clears all three
  (`project.reducer.ts:172-232`). Archived projects' tasks are filtered out of
  `selectAllTasksInActiveProjects` (`task.selectors.ts:158-166`).
- `deleteProject` (`task-shared-crud.reducer.ts:434-447` + `project-shared.reducer.ts:136-179`):
  `removeTasksFromAllTags(allTaskIds)`, drop `timeTracking.project[projectId]`, drop
  every repeat cfg whose `projectId` matches, remove the project entity, and
  `task.reducer.ts:212-220` removes all `allTaskIds` entities (nulling `currentTaskId`
  if it was one of them). `allTaskIds` is enriched from the deleted project's current
  root lists and their direct children (`task-shared-helpers.ts:380-405`).

### 4.18 Time tracking (`timeSpentOnDay`)

- `addTimeSpent` (`task.reducer.ts:222-244`): reject non-finite durations; `day` value
  `+= duration`; `timeSpent` recomputed; parent adjusted incrementally
  (`task.reducer.util.ts:181-227` — deltas applied per day, a parent day that reaches
  `<= 0` is **deleted**).
- `syncTimeSpent` (`:251-280`): identical but applies **only** when
  `meta.isRemote` (local state already has the tick); replay is additive on every
  client.
- `removeTimeSpent` (`:489-510`): `day = max(day - duration, 0)`.
- `roundTimeSpentForDay` (`:578-623`): only leaf tasks (`subTaskIds empty`) or
  subtasks, optionally limited to `projectId` (a `null` projectId also counts as a
  filter); `day = roundDurationVanilla(value, roundTo, isRoundUp)`; then every affected
  parent is recomputed.

### 4.19 Load-time normalization

`loadAllData` (`task.reducer.ts:187-210`):
```
if no task slice: keep current
ids       = ids minus ids with no entity          (devError when orphans found)
currentTaskId = null ; selectedTaskId = null
lastCurrentTaskId = previous currentTaskId
isDataLoaded = true
dismissedCalendarAutoImportEventIdsByProvider ??= {}
normalizeTimeSpentOnDay: every entity gets timeSpentOnDay = {} when missing
normalizeSubTaskIds:    every parent's subTaskIds de-duped (order kept)
```
Tags/projects: `TODAY_TAG` and `INBOX_PROJECT` are re-inserted at index 0 if missing
(`tag.reducer.ts:189-208,215-217`; `project.reducer.ts:72-85,99-103`).

---

## 5. Selectors

### 5.1 Logical-day inputs

`todayStr = selectTodayStr` and `offset = selectStartOfNextDayDiffMs` from
`appState` (`app-state.selectors.ts:8-16`). Both are written by
`AppStateActions.setTodayString` (`app-state.reducer.ts:19-23`) from
`GlobalTrackingIntervalService.todayDateStr$` (`app-state.effects.ts:22-34`,
`global-tracking-interval.service.ts:200`) and from the start-of-next-day config
effects (`global-config.effects.ts:159-250`). Selectors and reducers **never** call
`Date.now()` for day math; they take the offset as an argument so replay is
deterministic (`AGENTS.md` rule 4).

### 5.2 Is-a-task-in-Today (the one predicate)

```
inToday(task) =
   task.dueWithTime != null
       ? localDate(task.dueWithTime - offset) == todayStr
       : task.dueDay == todayStr
```
`work-context.selectors.ts:69-79`; helper `isTodayWithOffset`
(`util/is-today.util.ts:3-13`, throws on a non-positive timestamp). Note the
`dueWithTime` branch never falls through to `dueDay` — mutual exclusivity, with
`dueWithTime` authoritative even on legacy rows carrying both
(`work-context.selectors.ts:59-64`).

### 5.3 Today list (`selectTodayTaskIds`)

`work-context.selectors.ts:42-121` (compute) + `:346-360` (wiring:
tag state, scheduling snapshot record, todayStr, offset).

```
candidates = []
for task in allTasksInActiveProjects (iteration = task-state id order):
    if inToday(task): candidates.push(task.id)
if candidates empty: return []
topLevel = candidates where task.parentId == null || parentId not in candidates
if topLevel empty: return []
storedOrder  = TODAY_TAG.taskIds            # ordering only, never membership
slots        = array<id?>  ; extra = []
for id in topLevel:
    idx = storedOrder.indexOf(id)
    if idx found: slots[idx] = id  else extra.push(id)
return [for id in slots: id if id != null && topLevel.contains(id)] ++ extra
```
Consequences to reproduce exactly:
- a Today member whose `TODAY_TAG.taskIds` entry is missing is appended **after** all
  ordered entries, in task-state insertion order;
- a stored id that is no longer eligible leaves **no gap** (it is filtered from the
  slot array);
- a subtask is never a top-level Today row when its parent is also in Today
  (`:87-93`).

`selectUndoneTodayTaskIds` = `selectTodayTaskIds` filtered to `isDone === false`
(`:362-369`). `selectTodayProgress` = `{done: all - undone, total: all}` from the same
state snapshot (`:379-386`).

Repair rule (`selectTodayTagRepair`, `:435-514`): `TODAY_TAG.taskIds` is inconsistent
when it holds an ineligible id or misses an eligible top-level one; the repaired value
is `[stored ids that are still eligible, in order] ++ [eligible ids that were missing]`.

### 5.4 Inbox

Inbox is not a special list: it is `INBOX_PROJECT`'s `taskIds`
(`work-context.selectors.ts:210-221`), i.e. §5.5 with `projectId == 'INBOX_PROJECT'`.

### 5.5 Project list

`selectActiveWorkContext` for a project returns
`{...project, taskIds: project.taskIds || [], isEnableBacklog, backlogTaskIds:
project.backlogTaskIds || []}` verbatim (`work-context.selectors.ts:210-221`). No
membership computation, no self-healing: order is the stored array, and ids whose
entity is missing are dropped at hydration (`work-context.service.ts:336-351` →
`selectTasksWithSubTasksByIdsFactory`, which skips unknown ids,
`task.selectors.ts:851-902`). `mainListTasksInProject$` is a *derived* view that keeps
only tasks (or subtasks) due today (`work-context.service.ts:356-369`).

### 5.6 Regular tag list

`computeOrderedTaskIdsForTag` (`tag.reducer.ts:92-156`):
```
members    = all tasks whose tagIds contains tagId          # membership source of truth
topLevel   = members where parentId == null || parent not a member
slots/extra = same slot-filling against tag.taskIds as §5.3
return compacted slots ++ extra
```
Points: self-healing in both directions (stale stored ids vanish, missing members are
appended); subtasks appear only nested under a member parent.

### 5.7 Overdue

`selectOverdueTaskIds` (`task.selectors.ts:428-442`) over the active-project
scheduling snapshot:
```
todayStartMs = logicalStartOfDay(todayStr) + offset        # is-task-overdue.ts:10-18
overdue(task) = (task.dueDay is a valid YYYY-MM-DD && dueDay < todayStr)   # lexicographic
             || (task.dueWithTime && dueWithTime < todayStartMs)           # is-task-overdue.ts:31-43
```
`selectUndoneOverdue` = overdue minus `isDone` (`:451-456`).

Today's overdue panel (`selectOverdueTaskIdsForToday`, **NEW in v20**,
`:526-558`): overdue tasks **plus** tasks with no plan date whose deadline has passed
(`isTaskDeadlineMissedUnplanned`, `is-task-overdue.ts:70-80`: `!dueDay && !dueWithTime
&& (deadlineDay < todayStr || deadlineWithTime < todayStartMs)`). Done tasks are never
admitted. A missed-deadline *subtask* is skipped when its parent has a plan date.
`selectOverdueTasksWithSubTasks` (`:570-610`) then keeps only undone top-level rows
(subtasks whose parent is also in the set are dropped) and sorts ascending by
`dueWithTime` (if planned) else start-of-day of `dueDay`, and for unplanned
missed-deadline tasks by `deadlineWithTime` / `deadlineDay`; a calendar-invalid date
gets sort key `0`. `selectOverdueTasksOnToday` = overdue ∩ raw
`TODAY_TAG.taskIds` (`:513-520`) — used only to *clean up* stale Today ordering.

Deadline lists: `selectUndoneOverdueDeadlineTasks` (`:458-479`),
`selectUndoneDeadlineSortedTaskIds` (`:1065-1085`, ascending deadline, `dueDay`-style
dates parsed via `dateStrToUtcDate`), `selectAllUndoneTasksWithDeadlineSorted`
(`:1087-1092`).

### 5.8 Done lists

Per context (`work-context.service.ts:523-530`):
```
doneTasksToArchive = (isToday ? allTasksWithSubTasks : mainListTasks)
                       .filter(isDone).sort(doneOn desc, null -> 0)   # work-context.util.ts:10-12
```
Today additionally narrows to tasks that belong to today (`:537-553`, **NEW in v20**):
```
isDoneTaskForToday(task) = task.dueDay == todayStr
                        || isTodayWithOffset(task.dueWithTime)
                        || isTodayWithOffset(task.doneOn)      # work-context.util.ts:30-37,
                                                              # range-guarded :16-23
```
Undone list (`:499-513`): `mainListTasks` minus `isDone`, and on Today also minus the
"Later Today" window unless tracked (§5.9). Trackable/startable lists add
`sortDoneLast` (done rows after undone, otherwise order preserved,
`work-context.selectors.ts:229-237,239-289`).

### 5.9 Later Today

`selectLaterTodayStructure` (`task.selectors.ts:658-768`): candidates are Today
members (`inToday`, §5.2) that are not done, not tracked, and whose `dueWithTime`
falls in `[now, endOfToday]` where
`endOfToday = startOfLogicalDay(todayStr) + 24h - 1ms + offset`
(`util/later-today-window.ts:8-15,22-26`); `isTracked` covers the current task, its
parent, and its subtasks (`:677-685`). A parent is admitted for its own start time or
for a scheduled subtask; orphan scheduled subtasks are admitted as top-level rows; the
result is sorted by the earliest start time in the subtree, and a parent's subtask
order comes from `parent.subTaskIds`, never from iteration order (`:750-766`).
The main list hides the same window (`work-context.service.ts:859-885`).

### 5.10 Subtask visibility

`subTasks` are resolved per parent from `subTaskIds` (`task.selectors.ts:37-57`;
`mapIdsToTasksWithSubTasks` `:851-902`). Visibility is a **render-time filter**, not a
selector (`filter-done-tasks.pipe.ts:4-17`), applied only inside a subtask list
(`task-list.component.ts:177-186`):
```
isHideDone (mode == HideDone=1): keep tasks where !isDone
isHideAll  (mode truthy, i.e. 1 or 2): keep only task.id == currentTaskId (else [])
otherwise: keep all
```
The parent passes both flags from `_hideSubTasksMode` (`task.component.html:357-365`;
`isHideAll = !!_hideSubTasksMode`, `isHideDone = mode == HideDone`).
`getNextHideSubTasksMode` (`util/get-next-hide-sub-tasks-mode.ts:19-53`) cycles
`undefined(0) → 1 → 2 → 0`, skipping state `1` when the parent has 0 or all subtasks
done; it persists the absolute value, not a toggle.

### 5.11 Misc selectors worth porting

| Selector | Rule | Cite |
|---|---|---|
| `selectAllTasksInActiveProjects` | all tasks minus those in archived projects (`projectId` empty or unarchived) | `task.selectors.ts:158-166` |
| `selectTasksDueForDay(day)` | `dueDay == day` (all tasks incl. subtasks) | `:973-980` |
| `selectTasksDueAndOverdueForDay(day)` | `dueDay <= day` (lexicographic) | `:982-992` |
| `selectTasksWithDueTimeForRange(start,end)` | `dueWithTime ∈ [start,end]` inclusive | `:994-1005` |
| `selectAllTasksWithDueTimeSorted` | has `dueWithTime`, ascending | `:1017-1034` |
| `selectAllTasksWithReminder` | `remindAt` is a number && `!isDone` | `:1047-1054` |
| `selectStartableTasks` | `!isDone && (parentId set \|\| no subtasks)` | `:129-139` |
| `selectTrackableTasksForActiveContext` | for each context id: expand one level to subtasks, else the task itself; then done-last | `work-context.selectors.ts:239-261` |
| `selectMainTasksWithoutTag(tagId)` | no `parentId` && `tagIds` lacks the tag | `task.selectors.ts:942-948` |
| `selectMainTasksWithoutProject(projectId)` | no `parentId` && `projectId != id` (**NEW in v20**) | `:950-956` |
| `selectAllDoneIds` | ids of all done tasks | `:777-780` |
| `isCalendarIssueTask` | `issueType == 'ICAL'` or a plugin issue provider | `:32-36` |

---

## 6. Ordering / move rules

### 6.1 Drop → anchor

The drag-drop event yields a **new visible order**; the dispatched op carries only an
anchor id, never a full list (`work-context-meta.helper.ts:58-67`):
```
anchor = (indexOf(item) <= 0) ? null : newOrderedIds[indexOf(item) - 1]
```
The visible list may be filtered (done hidden, future scheduled hidden), so the
anchor — not the index — is what the reducer applies against the full stored list
(`:81-87`). Port this exact pair.

The drop handler also computes the target order to decide "before vs after"
(`task-list.component.ts:533-573`): dragging **down** inserts *after* the target row;
dragging **up** or from another list inserts *before* it
(`moveItemBeforeItem`, `util/move-item-before-item.ts:3-24`).

### 6.2 Insertion position math

`moveItemAfterAnchor` (§4.8) is the only insertion primitive. Its four cases are
load-bearing:
1. `afterItemId == null` → item becomes first.
2. anchor present → item is spliced at `anchorIndex + 1`.
3. anchor absent **and the item was already in the list** → return the original array
   reference (no-op; keeps NgRx memoization intact).
4. anchor absent **and the item is new to this list** → append to the end (prevents a
   cross-list move from silently dropping the task).

`addTaskToListAtAnchor` (§4.1) is the *add* variant: above the anchor, else
prepend/append by `isAddToBottom`; never duplicates.

### 6.3 Cross-list moves

| From → To | Op | List writes |
|---|---|---|
| UNDONE ⇄ DONE (same context) | `moveTaskInTodayList(src,target,afterTaskId)` | position only; `DONE`+null anchor appends |
| OVERDUE → UNDONE/DONE | `planTasksForToday` **then** `moveTaskInTodayList` (+ `updateTask{isDone:true}` for DONE) | task-list.component.ts:822-852 |
| BACKLOG ⇄ regular (project) | `moveProjectTaskToBacklogList` / `moveProjectTaskToRegularList` | remove from one list, `moveItemAfterAnchor` into the other |
| subtask → top-level DONE/UNDONE | `convertToMainTask{afterTaskId,isDone,today,modified}` | §4.9; tag & project lists repositioned by anchor |
| top-level → subtask list | `unscheduleTask` (if it had a time/reminder) then `convertToSubTask{targetParentId,afterTaskId}` | §4.9 |
| subtask list A → subtask list B | `moveSubTask{srcTaskId,targetTaskId,afterTaskId}` | §4.8 |
| project A → project B | `moveToOtherProject` | §4.6 |
| across tag groups in the grouped view | `_retagAcrossGroups` → `updateTags` | `tagIds` rewritten: drop the source group's tag, add the target's; the "No tag" bucket keeps only the active context tag (`task-list.component.ts:901-922`) |
| into a view column | `placeRow(taskId, afterTaskId)` on the view host | view-owned order; sorted columns ignore it (`:645-660`) |

Reordering *inside* the Done list is suppressed (`src==DONE && target==DONE` returns
early, `:703-705`) because the list is re-sorted by `doneOn` on every emission.
`OVERDUE` and `LATER_TODAY` accept no drops and `BACKLOG ⇄ section` is refused
(`enterPredicate`, `:270-376`).

Subtask↔parent drags are further disambiguated by hit-testing the pointer against the
subtask list's rows vs its padding (`:404-456`) — a behavioural detail, not a state
rule.

### 6.4 Tag rewrites on a normal tag change

`handleTagUpdates` (§4.3 step 4): removals filter the id out of `tag.taskIds`; additions
**prepend** (`unique([taskId, ...taskIds])`). `TODAY` is filtered from both sides and
non-existent tags are ignored, so a remote op referencing a deleted tag cannot
resurrect it (`task-shared-crud.reducer.ts:1028-1067`).

`TODAY_TAG.taskIds` rewrites by trigger:

| Trigger | Position | Cite |
|---|---|---|
| add with `dueDay == today` | anchor (repeat) else prepend/append by `isAddToBottom` | crud:121-141, helpers:326-336 |
| `scheduleTaskWithTime` landing on today | prepend | scheduling:114-123 |
| `planTasksForToday` | prepend, in argument order | scheduling:259-266 |
| `planTaskForDay(today)` | top or bottom by `isAddToTop` | planner-shared:186-203 |
| `transferTask`/`moveBeforeTask` | at the target index | planner-shared:135-169, 263-308 |
| `applyShortSyntax` day-today | top or bottom by `isAddToTop` | short-syntax-shared:299-314 |
| deadline auto-plan | prepend | deadline:82-92 |
| completion of a task already due today | append if missing | crud:950-964 |
| leaving today | removed | crud:993-1000, scheduling:116, planner-shared:107-116,218-228 |
| `removeTasksFromTodayTag` (`localRemoveOverdueFromToday`) | removed; task-state `ids` reordered | scheduling:272-286, task.reducer:752-779 |
| restore | not restored by default (only `restoreToToday` re-plans) | lifecycle + §4.11 |

`removeTasksFromTodayTag` additionally rewrites **`TaskState.ids`** via
`moveValidIdsToFront` so a subsequent "move to overdue" keeps the relative order
(`task.reducer.ts:752-766`, `util/move-valid-ids-to-front.ts`).

---

## 7. Logical day

### 7.1 `startOfNextDayDiffMs`

`getStartOfNextDayDiffMs(startOfNextDayTime, startOfNextDay)`
(`util/start-of-next-day.util.ts:60-86`):

```
if startOfNextDayTime is a string:
    if it does NOT match /^([01]?\d|2[0-3]):([0-5]\d)$/ : return 0        # #7645
    return clamp(parseMinutes(t), 0, 23*60+59) * 60_000
# no time string at all (pre-v18.5.0 data): the legacy hour is genuine intent
hour = validHour(startOfNextDay)          # integer 0..23, else undefined
return hour != null ? hour * 3_600_000 : 0
```
`parseMinutes` (string) = `hh*60 + mm`; for a number it is `validHour(n) * 60`, `0`
when invalid (`:21-38`). `clamp` to `[0, 1439]` minutes (`:40-41`).

Config normalization keeps the pair coherent (`features/config/normalize-start-of-next-day-config.ts:19-55`):
`startOfNextDayTime` wins when valid and derives
`startOfNextDay = floor(minutes/60)`; an invalid time string resets **both** to the
default (`'00:00'`, `0`); a legacy `startOfNextDay` number with no time string derives
`'HH:00'`.

Defaults: `misc.startOfNextDay = 0`, `misc.startOfNextDayTime = '00:00'`
(`default-global-config.const.ts:60-61`). `DateService.setStartOfNextDayDiff` stores
the result and only emits on change (`core/date/date.service.ts:13-34`).

### 7.2 `todayStr`

```
todayStr(date?) = getDbDateStr(date ?? new Date(Date.now() - startOfNextDayDiffMs))
```
(`date.service.ts:69-74`); `getDbDateStr` = **local** `YYYY-MM-DD`
(`util/get-db-date-str.ts:9-15`). So `todayStr` is the local calendar date of "now
minus offset". With `04:00`, 01:00 local on the 6th → `todayStr = '2026-…-05'`.

`getLogicalTodayDate() = new Date(Date.now() - offset)` — its local y/m/d is the logical
day (`date.service.ts:41-43`); `getLogicalTomorrowMs()` advances with `setDate(+1)` so
DST days stay correct (`:50-54`).

Propagation: `todayStr` lives in `AppState` and is only ever written by
`setTodayString` — on load (`global-config.effects.ts:203-222`), when the
start-of-next-day config changes (`:159-201`, which also rewrites every active task
whose `dueDay == oldTodayStr` to the new day), after a bulk/replay apply (`:227-250`),
and on the daily tick (`app-state.effects.ts:22-34`, `skip(1)`, `distinctUntilChanged`,
sync-window guarded).

### 7.3 `isToday`

```
DateService.isToday(ts) = getDbDateStr(new Date(ts - offset)) == todayStr
```
(`date.service.ts:76-79`). Pure form used by selectors/reducers:
`isTodayWithOffset(ts, todayStr, offset)` — same formula, throws on `ts <= 0`
(`util/is-today.util.ts:3-13`).

### 7.4 Effective predicates

| Predicate | Formula |
|---|---|
| Today membership | `dueWithTime != null ? isTodayWithOffset(dueWithTime) : dueDay == todayStr` (§5.2) |
| Overdue | `(validDB(dueDay) && dueDay < todayStr) \|\| (dueWithTime && dueWithTime < logicalStartOfToday)` where `logicalStartOfToday = startOfLocalDay(todayStr) + offset` (`is-task-overdue.ts:10-18,31-43`) |
| End of logical today | `startOfLocalDay(todayStr) @ 23:59:59.999 + offset` (`later-today-window.ts:8-15`) |
| Done-today | `dueDay == todayStr \|\| isTodayWithOffset(dueWithTime) \|\| isTodayWithOffset(doneOn)` (`work-context.util.ts:30-37`) |
| Yesterday | same `todayStr` formula with `getDate() - 1` (`date.service.ts:81-88`) |

`dateStrToUtcDate` (`util/date-str-to-utc-date.ts:5-38`) is the only date-string→Date
parser: it builds a **local** date from the `YYYY-MM-DD` prefix (accepts `1`–`2` digit
month/day), returns `Invalid Date` on a calendar-invalid value, and empty input yields
`new Date()`.

---

## 8. **NEW in v20** (vs v19.2.0)

Diffed against `.tooling/upstream-v19.2.0`.

### 8.1 Model / wire

1. `DropListModelSource` gains `'VIEW' | 'VIEW_DONE'` (`task.model.ts:23-29`).
2. `packages/plugin-api/src/types.ts`: `PluginHooks.DATA_CHANGED` and
   `PluginHooks.DAY_CHANGE` (`:59-65`), `DayChangePayload`/`PluginDayContext`
   (`:352-365`), `PluginAPI.getDayContext?/startTracking?/stopTracking?`
   (`:683-694`), `PluginUpdateTaskOptions` (`:982-985`) and
   `PluginCreateTaskData.isIgnoreShortSyntax` (`:974-979`), `PluginManifest.author`
   (`:207-208`) and `dataSharing`/`PluginDataDestination` (`:172-197,232-239`),
   `triggerSync()`/`listSyncedDataKeys()` (`:857-874`), `ActionPayload.action`
   changed from `string` to an object with `.type` (`:293-296`). The `Task`,
   `Project` and `Tag` shapes are **unchanged**.

### 8.2 Selectors

3. Today's overdue panel also admits unplanned tasks whose deadline passed (#9589),
   and sorts those by their deadline: `selectOverdueTaskIdsForToday` +
   `isTaskDeadlineMissedUnplanned` (`task.selectors.ts:526-558,570-610`;
   `util/is-task-overdue.ts:70-80`). `selectOverdueTasksWithSubTasks` was fed by
   `selectOverdueTasks` in v19.2.
4. `selectMainTasksWithoutProject` added (`task.selectors.ts:950-956`).
5. `mapIdsToTasksWithSubTasks` extracted and `selectTasksWithSubTasksByIdsFactory`
   takes an optional caller-owned `TaskWithSubTasksCache` so a list stream keeps rows
   referentially stable across id-set changes (`task.selectors.ts:840-917`;
   `work-context.service.ts:147-152,840-850`).
6. Today's **Done** list now only shows tasks due or completed today
   (`isDoneTaskForToday`), and `doneTasksToArchive$` was split out so Finish Day /
   archive still sweep every unarchived done task
   (`work-context.service.ts:523-553`; `work-context.util.ts:16-37`).

### 8.3 Ordering / move

7. `moveUndoneTaskUpInList` / `moveUndoneTaskDownInList` replace
   `arrayMoveLeftUntil` / `arrayMoveRightUntil` for **project and tag** move-up/down,
   replaying against the op's `undoneTaskIds` snapshot so a move commutes with a
   concurrent delete of the upper/lower neighbour (#11464)
   (`work-context-meta.helper.ts:144-189`; call sites `tag.reducer.ts:261-309`,
   `project.reducer.ts:361-401`).
8. `getAnchorFromDragDrop` extracted as the named drop→anchor helper
   (`work-context-meta.helper.ts:58-67`, used at `task-list.component.ts:712,732,766,
   792,808,828,861,873,879`).
9. `addTaskToListAtAnchor` + `getPreviousRepeatInstanceId`: a new repeat instance
   takes the place of the previous instance in every list (#10812)
   (`task-shared-helpers.ts:326-364`; `task-shared-crud.reducer.ts:84-136`).
10. `TaskListComponent._move` split `LATER_TODAY`/`VIEW`/section handling and now
    suppresses reorders inside Done (`task-list.component.ts:680-884`).

### 8.4 Add-task bar

11. `viewPrefill` input + `tagsToRemove` + `isHiddenInView` + `applyViewPrefill`:
    adding from a custom view prefills project/tags/dueDay and can warn that the new
    task leaves the view (`add-task-bar.component.ts:173-237,447-464,567-570`).
12. Suggestions collapsed into one signal feed with a "no matches" row
    (`:188-198,508-528`); `projects` now reads `listInTreeOrder`.
13. Move-from-other-context now loads the task **with** its subtasks before moving and
    is fault-tolerant to a task gone since the search (`:797-828`).

### 8.5 Parsing

14. `shortSyntaxForNewWords`: a **title edit** parses only words typed since the shared
    title (both directions of issue sync), masking kept words with private-use
    characters; a title already containing such characters is not parsed at all
    (`util/short-syntax-for-new-words.ts:21-53`, wired at
    `short-syntax.effects.ts:127-144`). Used for `updateTask`, not for `addTask`.
15. `SHORT_SYNTAX_H_TIME_REG_EX` (`@18h`, `@9h30`) is checked **before** chrono,
    which would read `@09h` as "in 9 hours" (#11180) (`short-syntax.ts:352-365,
    948-974`).
16. `shortSyntax.effects.ts` was restructured to one atomic `applyShortSyntax`
    dispatch (project move + scheduling + field changes + `timeSpentOnDay` flush) and
    to fold `hasPlannedTime` into `schedulingInfo` (§3.7.1).

### 8.6 Defaults that change list behaviour

17. `reminder.notifyOnDueDate` default flipped `true → false`
    (`default-global-config.const.ts:231`). New keys `misc.isShowDueTaskBadge: false`
    (`:57`) and `keyboard.goToPlanner: 'Shift+L'` (`:162`). No other default relevant
    to task-core changed — `startOfNextDay: 0`, `startOfNextDayTime: '00:00'`,
    `tasks.defaultProjectId: 'INBOX_PROJECT'`, `shortSyntax.*` and
    `timeTracking.defaultEstimate*` are identical to v19.2.0.

---

## Appendix — implementation order for the Flutter port

1. `DateService` + `AppState{todayStr, startOfNextDayDiffMs}` + the four pure
   predicates of §7.4 (unit-test DST and a 04:00 offset).
2. `Task` model + `DEFAULT_TASK` + load-time normalization (§4.19).
3. Reducer primitives, in this order: `addTask`, `updateTask` (§4.3), `addSubTask`,
   `moveItemAfterAnchor`/`addTaskToListAtAnchor`, `deleteTask`, `planTasksForToday`,
   `scheduleTaskWithTime`/`unscheduleTask`, then the tag/project list reducers.
4. Selectors §5.2–§5.8, then §5.9.
5. Add-task factory + `shortSyntax` tokens of §3.7.1.
6. Archive/restore (§4.10–§4.11) and `deleteTag`/`deleteProject` cascades (§4.15–§4.17).

Cheapest correct test set: a table-driven reducer test per §4 operation asserting the
**whole** `{tasks, projects, tags, planner.days}` diff, plus golden cases for
`computeOrderedTaskIdsForToday`/`ForTag` (stale stored id, missing member, subtask whose
parent is a member) and for the logical-day boundaries.
