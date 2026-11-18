# superprod — Flutter rewrite blueprint

A new Android client for **Super Productivity**: same data, same SuperSync server,
feature and UI parity, built with **Flutter 3.50 / Dart 3.14**.

The previous Capacitor + SolidJS client lives on the **`legacy`** branch (tag
`v0.4-legacy`). It is reference material, not a starting point: its op-log,
encryption and UI decisions are lessons, not code to port.

- Package: `com.dwprod.superprod`
- Reference source: `original source code/` — upstream **v19.2.0**, read-only, gitignored
- Parity ledger: `FEATURES.md` (inventory) and `PARITY.md` (status, one row per feature)

## Why the rewrite

The Capacitor build put a whole-state JSON blob in `localStorage`, did its own
op bookkeeping in JS, and fought the WebView on every platform feature
(notifications, exact alarms, widget, back gesture, caching). Flutter gives a
real SQLite store, native notifications and alarms, a real widget, and a single
language across UI and sync.

## Locked contract (verified in `original source code/`, do not guess)

**Endpoints** — prefix `/api`

| Method | Path | Purpose |
|---|---|---|
| POST | `/sync/ops` | upload a batch (≤100) |
| GET | `/sync/ops?sinceSeq&limit` | download, ordered by `serverSeq` |
| POST/GET | `/sync/snapshot` | upload / fetch a full-state snapshot |
| GET | `/sync/status` | latestSeq, storage usage |
| GET | `/sync/devices` | devices on the account |
| DELETE | `/sync/data` | wipe the account |
| GET | `/sync/restore-points` | restore points |
| WS | `/sync/ws` | live updates (later) |
| POST | `/register|login/passkey/{options,verify}` | passkey auth |
| POST | `/register/magic-link`, `/login/magic-link`, `/login/magic-link/verify` | email auth |

**Operations** — `CRT, UPD, DEL, MOV, BATCH, SYNC_IMPORT, BACKUP_IMPORT, REPAIR`.
Payload is always `{ actionPayload, entityChanges }`, where `entityChanges` is
`[{ entityType, entityId, opType, changes }]` (Create = full entity, Update =
partial, Delete = tombstone). `actionType` must be a real upstream string —
`src/core/action-types.ts` on the legacy branch has the full list of 150+.

**Entities** (closed set): `TASK, PROJECT, TAG, NOTE, GLOBAL_CONFIG,
SIMPLE_COUNTER, WORK_CONTEXT, TIME_TRACKING, TASK_REPEAT_CFG, ISSUE_PROVIDER,
PLANNER, MENU_TREE, METRIC, BOARD, SECTION, REMINDER, PLUGIN_USER_DATA,
PLUGIN_METADATA, MIGRATION, RECOVERY, ALL`.

**End-to-end encryption**: Argon2id (16-byte salt, 32-byte key, parallelism 1,
iterations 3, 64 MB) → AES-256-GCM (fresh 12-byte IV) →
`base64(salt ‖ iv ‖ ciphertext+tag)`.

**Invariants**

- `dueWithTime` wins over `dueDay`; they are mutually exclusive. Same for deadlines.
- `TODAY` is a virtual tag; never written into `tagIds`.
- New persisted fields are optional with a runtime default.
- One user intent = one operation; replay must be deterministic.
- Ops are deduped by id: a build that ignores an entity never sees it again
  unless the cursor is rewound and replayed.
- Repeating tasks: upstream materialises `rpt_<cfgId>_<day>` instances; generate
  them like upstream. `DAILY` ignores weekday flags, `WEEKLY` uses them.
- Exact alarms need `USE_EXACT_ALARM`, not just `SCHEDULE_EXACT_ALARM`.
- Never log user content; logs are exportable.

## Architecture

```
lib/
  core/            result types, logging, short-syntax parser, date helpers
  data/
    db/            drift schema + DAOs (source of truth, local-first)
    models/        immutable entities with copyWith/fromJson/toJson
    repositories/  task, project, tag, repeat, planner, metric, settings
  sync/
    client/        HTTP transport, contract models
    crypto/        argon2id + aes-gcm
    engine/        op-log, cursor, upload/download, conflict, snapshot
    state/         sync status stream
  features/        one folder per screen, UI + controller
  app/             router, theme, shell
```

- **Storage**: Drift (SQLite). Every entity is a table with upstream field names;
  JSON columns only for genuinely nested data (attachments, time-spent maps).
- **State**: Riverpod. Controllers expose immutable state; the DB is observed via
  streams so the UI never holds a copy that can drift.
- **Navigation**: `go_router` with `PopScope`, so the back gesture unwinds the
  stack instead of closing the app.
- **Sync**: a background service reading/writing the op-log table; the UI only
  ever sees local data plus a status indicator.

## Phases

0. **Reset & toolchain** — `main` becomes Flutter; CI builds a signed APK on tag.
1. **Data layer** — Drift schema for all entities, repositories, migrations.
2. **SuperSync** — contract, op-log, E2EE, snapshot import, device/restore tools.
3. **Task core + UI parity** — Today/Inbox/project/tag, add sheet with full short
   syntax, detail with subtasks and scheduling, repeat editor, planner date wheel,
   schedule timeline, metrics, history, search, settings.
4. **Android integration** — notifications with Done/Snooze, exact alarms, home
   widget, deep links, boot rescheduling.
5. **Parity hardening** — golden tests against fixtures captured from a real
   account; `PARITY.md` updated per commit.

## Definition of done

A feature counts as done only when it is implemented, wired, tested, and its
`PARITY.md` row states what was built and how it maps to upstream.
