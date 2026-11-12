# AGENTS.md — superprod

Guidance for agents working in this repo. **superprod** is a new, sleek client for the
Super Productivity platform: Android + Web, 100% feature parity, self-hosted-sync first.

- App name: `superprod` (lowercase) · Package ID: `com.dwprod.superprod`
- Reference implementation: `original source code/` — **read-only**, gitignored. Never edit it, never copy its Angular UI.
- `FEATURES.md` — exhaustive feature inventory (parity target).
- `PARITY.md` — per-feature status tracker. **Update it after every implemented feature.**
- `PARITY_MET.md` — generated parity metrics (run `pnpm parity:metrics`).
- `FRAMEWORK_OPTIONS.md` — stack decision: TypeScript + Capacitor + SolidJS, UI layer built.

## Product principles (inherited from upstream)

- **Privacy & offline first.** No analytics or telemetry. Local data is primary; sync is a transport that degrades gracefully.
- **Less noise, more depth.** No streaks, vanity dashboards or dopamine loops; attention-grabbing behavior defaults off.
- **Adapt, don't impose.** One calm default; add a setting only when real workflows diverge.
- **Parity is not negotiable.** A feature is not "cut for simplicity"; if the original does it, we do it — with better UI.

## Workflow

1. Read the matching section of `FEATURES.md`, then the relevant files under `original source code/` to confirm real behavior (code over docs).
2. Implement.
3. Update the matching row in `PARITY.md` to `Done` with **particulars**: what was built, data model mapping, UI surface, and any deviation.
4. Run `pnpm parity:metrics` to regenerate `PARITY_MET.md`.
5. Commit with the `commit-messages` skill format — code and both parity files together.

## Sync invariants a new client must not break

These are the load-bearing rules from upstream; violating them corrupts users' data.

- **Entity types are a closed set** (`packages/shared-schema/src/entity-types.ts`): `TASK, PROJECT, TAG, NOTE, GLOBAL_CONFIG, SIMPLE_COUNTER, WORK_CONTEXT, TIME_TRACKING, TASK_REPEAT_CFG, ISSUE_PROVIDER, PLANNER, MENU_TREE, METRIC, BOARD, SECTION, REMINDER, PLUGIN_USER_DATA, PLUGIN_METADATA, MIGRATION, RECOVERY, ALL`. The server rejects anything else.
- **One user intent = one operation**, replayed atomically. Replay must be deterministic.
- **Vector clocks** track causality; `MAX_VECTOR_CLOCK_SIZE = 20`; the server prunes after conflict detection.
- **New persisted fields must be optional (`?`) with a runtime default** — existing on-disk and synced data lacks them.
- **`dueDay` and `dueWithTime` are mutually exclusive**; readers check `dueWithTime` first. Same for `deadlineDay`/`deadlineWithTime`.
- **`TODAY` is a virtual tag** (`'TODAY'`) — never written into `task.tagIds`; membership derives from `dueDay`/`dueWithTime` plus a logical "today" that accounts for a configurable day-start offset.
- **`SYNC_IMPORT` / `BACKUP_IMPORT`** intentionally replace state and drop concurrent ops — by design, not a bug.
- Never log user content (task titles, notes) — logs are exportable.

## Conventions

- TypeScript everywhere unless the chosen stack says otherwise; no `any`.
- State is immutable; no in-place mutation of persisted models.
- Tests: unit tests for new services and state logic; a sync-touching change needs a reproduction, not a mock.
- Don't add a dependency for a few lines. Platform APIs or a small in-repo helper win.
