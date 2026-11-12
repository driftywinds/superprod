# superprod — changes in this drop

## Bugs fixed
- createTask shared one subTaskIds/tagIds array between ALL tasks (adding a subtask leaked everywhere).
- deleteTask never synced (recorded after deletion), orphaned subtasks, left planner entries.
- addSubTask never synced; toggleDone sent a malformed op.
- Snapshot import dropped repeat fields (monthly anchors, repeatUntilDay, ...).
- Completed list on Today showed every task ever finished; reload reopened the detail panel.
- "Today" ignored the start-of-next-day setting.

## Features
- Recurrence rewritten to match upstream: daily/weekly/monthly (date, last day, nth weekday)/yearly, intervals, end date, deleted instances, repeat-from-completion, wait-for-completion, timed vs all-day.
- Repeat editor with next-5 preview; instances auto-created for today, created on tap elsewhere.
- Subtasks: rename, reorder, promote, delete, parent/child completion cascade, nested rows.
- Markdown checklists in notes with progress.
- When: day + time + all-day in task detail; Today gets an Overdue section.
- Planner/Schedule: all-day block, timed items, repeat occurrences actionable, done items shown.
- History: logical-day grouping, 7/30/all range, open task.
- UI: Interface size setting (default 115%), bigger touch targets, nicer chips/sections.
