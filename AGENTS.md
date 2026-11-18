# AGENTS.md — superprod

A fast, local-first client for Super Productivity: Flutter 3.50, Android first,
web second. App name `superprod`, package id `com.dw.superprod`.

Everything here is a **from-scratch rewrite**. The previous Capacitor client lives
only on the `legacy` branch (do not copy its code or UI; its `assets/logo.svg` is
the only thing carried over). Any earlier Flutter prototype is deleted and must
not be resurrected.

## Source of truth

- `original source code/` — upstream Super Productivity v19.2.0, **read-only**,
  gitignored. Behavior comes from this code, never from guesses or old docs.
- `docs/research/upstream-features.md` — parity inventory (what must exist).
- `docs/research/sync-contract.md` — SuperSync wire contract (what the server expects).
- `PLAN.md` — stack, architecture, milestones. Work the current milestone.
- `docs/PARITY.md` — per-feature status. Update it when a feature lands, with the
  upstream source path it implements.

## Non-negotiables

- **100% feature parity.** A feature is not "cut for simplicity". If something
  cannot be ported (e.g. JavaScript plugins), record why in `docs/PARITY.md`.
- **Privacy and offline first.** No analytics, telemetry, or crash reporting.
  Core functionality works with no network. Sync degrades gracefully.
- **Never log user content** (titles, notes, emails). Logs are user-exportable.
- **Immutable state.** Reducers return new objects; no in-place mutation.
- **Yet-to-exist persisted fields are optional** (`?`) with a runtime default —
  on-disk and synced data from other clients will not contain them.

## Sync invariants (violating these corrupts user data)

- Entity types are a closed set: `TASK, PROJECT, TAG, NOTE, GLOBAL_CONFIG,
  SIMPLE_COUNTER, WORK_CONTEXT, TIME_TRACKING, TASK_REPEAT_CFG, ISSUE_PROVIDER,
  PLANNER, MENU_TREE, METRIC, BOARD, SECTION, REMINDER, PLUGIN_USER_DATA,
  PLUGIN_METADATA, MIGRATION, RECOVERY, ALL`.
- One user intent = one operation, replayed atomically and deterministically.
- Vector clocks track causality; max 20 entries; the server prunes after
  conflict detection.
- `dueDay` and `dueWithTime` are mutually exclusive (same for
  `deadlineDay`/`deadlineWithTime`); readers check the `*WithTime` form first.
- `TODAY` is a virtual tag (`'TODAY'`), never written into `task.tagIds`.
- `SYNC_IMPORT` / `BACKUP_IMPORT` replace state and drop concurrent ops by design.
- Do not bump `schemaVersion` to avoid thinking about compatibility.

## Commands

```powershell
. .\tool\env.ps1            # Flutter 3.50 + Android SDK + JDK 17, redirected homes
flutter analyze
flutter test
flutter build apk --debug
```

## Conventions

- Dart, null-safe, no `dynamic` where a type exists.
- State: Riverpod 3 with pure reducers; keep widgets free of persistence logic.
- One feature = one folder under `lib/features/`, one domain model under
  `lib/domain/`.
- New non-trivial logic (reducer, parser, clock math) gets a unit test.
- Don't add a dependency for something a few lines of Dart can do.
