# superprod — plan of action

A from-scratch Flutter client for Super Productivity, targeting **100% feature
parity** with upstream (**v20.0.0**, latest stable) and wire compatibility with
**SuperSync**. Android first, web second. Package `com.dw.superprod`.

**This client is task-first.** Tasks, their organization, recurrence, text
parsing and the week/planning views are the product; everything else (time
tracking, counters, metrics, integrations) comes after those are solid.

This plan replaces the previous Flutter prototype entirely. Nothing from it is
reused; the old Capacitor client survives only on the `legacy` branch, and only
its logo asset was carried over.

## 0. State at plan time

- `main` is reset to an empty Flutter 3.50.0 project (`lib/main.dart` counter demo
  only), `applicationId com.dw.superprod`, platforms `android,web`.
- Brand: `assets/branding/logo.svg` — blue (#3094de) rounded square, white check.
- Upstream source present at `original source code/` (v19.2.0, gitignored).
  Latest stable is **v20.0.0** (2026-11-06); refresh the clone to that tag before
  M1 implementation and re-check task/views deltas (Smart Lists, multi-tag
  filtering, redesigned view editor, deadlines in the add-task bar, recurrence
  fixes).
- Research in flight → `docs/research/upstream-features.md`,
  `docs/research/sync-contract.md`.
- Toolchain verified (see § 8); debug APK build runs from `tool/env.ps1`.

## 1. Target

| Area | Decision |
|---|---|
| Parity | Every user-facing feature of upstream, including settings, import/export, recurrence, reminders, issue providers |
| Out of scope | Electron/desktop-only behavior (menu bar, global shortcuts, tray, auto-update), iOS |
| Data | Local-first; state is primary on device, sync is a transport that degrades gracefully |
| Sync | SuperSync (self-hosted) only. WebDAV/Dropbox/OneDrive providers are upstream features — parity target, but last |
| Privacy | No analytics, telemetry, or crash reporting; no user content in logs |
| Offline | Every core action works offline; the app is usable forever without an account |

## 2. Stack

| Choice | Why |
|---|---|
| Flutter 3.50.0 / Dart 3.14 | User-specified target; current stable |
| `material_ui` 1.1.x | Material moved out of the Flutter SDK in 3.50; this is the supported package |
| Riverpod 3 | Immutable state, testable containers, no `BuildContext` coupling in the domain |
| `go_router` | System back gesture, deep links, one route table |
| `sqlite3` (FFI) + `sqlite3_flutter_libs` | Durable single-writer store without codegen; drift is a later option only if typed SQL earns its build step |
| `dio` | HTTP, gzip bodies, interceptors for auth and retry |
| `flutter_svg` | Brand logo and icons |
| `intl` | Date/number formatting, l10n scaffolding |
| `uuid` | Entity and operation ids |

Added at the milestone that needs it: `flutter_secure_storage` (M3, JWT),
`flutter_local_notifications` (M2, reminders), `home_widget` or platform channels
(M6, Android widget). No other dependency without a written reason.

## 3. Architecture

```
lib/
  app/        bootstrap, router, theme, l10n wiring
  core/       logical clock/day-start, ids, logging, json, errors
  domain/     entities, pure reducers, pure selectors
  data/       local store (state document + op log), repositories
  sync/       vector clock, op capture, transport, replay, snapshot, checkpoint
  features/   one folder per screen/domain UI
  design/     design tokens, shared widgets, brand icons
test/         mirrors lib/; fixtures for replay and contract tests
```

Flow for one user intent:

```
UI event → controller → Op (1 intent = 1 op) → pure reducer → new AppState
        → txn { write state doc, append op } → sync engine uploads later
```

Remote op takes the same reducer path. Reducers never trigger side effects, so a
replayed op cannot re-fire a notification or a timer.

## 4. Data and sync model

- **AppState** mirrors upstream's state shape (keys match the closed entity-type
  set) so snapshots are interchangeable with other clients.
- **Storage** — three SQLite tables:
  - `doc(key, json, updated_at)` — one row, the full state document (what upstream
    persists too), written atomically via temp file + rename or a transaction.
  - `ops(id, op_type, entity_type, entity_id, payload, vector_clock, created_at,
    synced_at)` — pending upload, replay, diagnostics.
  - `meta(key, value)` — `clientId`, `lastServerSeq`, `lastSyncAt`, checkpoint,
    schemaVersion.
- **Sync loop** — push pending ops (`POST /api/sync/ops`, gzip, 25 ops per batch) →
  pull since cursor (`GET /api/sync/ops?sinceSeq=…&excludeClient=…`, 500 per page)
  → apply in `serverSeq` order → persist cursor. A fresh client downloads from
  `sinceSeq=0`; the server fast-forwards to the newest full-state op and returns it
  as a normal op plus `snapshotVectorClock`. There is no snapshot side-channel for
  SuperSync, and `GET /restore/:seq` is dead under E2EE.
- **Auth** — the upstream client has no login flow: the user pastes a long-lived
  JWT from the server's web UI. We will support the same paste flow at M6 and add
  in-app magic-link/passkey login later if it earns its keep.
- **Conflicts** — server rejection with `existingClock` becomes an LWW update that
  dominates the server clock; full-state ops (`SYNC_IMPORT`, `BACKUP_IMPORT`)
  replace state and intentionally drop concurrent ops.
- **Clock** — vector clocks, max 20 entries, per-entity increment on each intent.
- **E2EE is mandatory**, not optional. The server rejects plaintext payloads with
  `400 E2EE_REQUIRED`. Interop needs Argon2id (`p=1, i=3, m=64 MiB`, 32-byte key)
  + AES-256-GCM over `[salt 16][iv 12][ciphertext||tag]`, base64. Budget a real
  crypto layer in M6, not a shortcut.

Exact request/response shapes, headers, auth, error codes and edge cases live in
`docs/research/sync-contract.md` — that document, not this plan, is normative.

## 5. Milestones

Every milestone ends with: `flutter analyze` clean, `flutter test` green, debug
APK installable, and the matching rows in `docs/PARITY.md` updated with the
upstream source path implemented.

| # | Scope | Exit criteria |
|---|---|---|
| **M0** | Foundation: project, toolchain, design shell, router, brand | App boots to a shell with logo + theme; analyze/test green; debug APK installs |
| **M1** | **Task core**: state document + op capture, TASK / PROJECT / TAG models, Today, Inbox, project lists, add/edit/complete/delete, manual ordering, undo, logical day-start | Tasks survive restart; full task CRUD with no network |
| **M2** | **Task detail**: subtasks, checklists, notes, attachments, estimates, schedule and deadline (`dueDay`/`dueWithTime`), tag picker, copy/duplicate, archive | Upstream task-detail parity |
| **M3** | **Organization**: short-syntax parser, tag management, filters / Smart Lists, saved-views editor, multi-select + batch actions, search, sort/group, sections, boards | Organizing hundreds of tasks stays fast and correct |
| **M4** | **Recurrence + reminders**: repeat configs, completion/skip semantics, reminder scheduling, notifications | Recurring tasks advance exactly like upstream |
| **M5** | **Week + planning**: planner / schedule / calendar with drag scheduling, week view, time estimates, backlog → day planning | Plan a week, reschedule by dragging, nothing double-counted |
| **M6** | **SuperSync**: login, device id, upload/download, vector clocks, conflicts, snapshot bootstrap, sync screen | This app + upstream client converge against the real instance — **credentials needed here** |
| **M7** | Rest of parity: time tracking, focus/pomodoro, counters, metrics, settings, themes, l10n, import/export | Parity inventory complete |
| **M8** | Issue providers, calendar integration, Android widgets, web build, plugin decision, parity audit | Release candidate |

Op capture and the durable store are built in M1 even though sync lands at M6 —
that keeps retrofit cost at zero, without letting sync dictate the task model.
`docs/research/upstream-features.md` is the parity checklist; every shipped row
moves to `Done` in `docs/PARITY.md` with its upstream source path.

## 6. Verification

- **Unit**: every reducer, vector clock merge/compare, recurrence, short-syntax
  parser, logical-day math.
- **Replay**: fixture snapshots + synthetic op logs must reduce to the same state
  twice, in any download order.
- **Contract**: an in-repo fake SuperSync server (Dart) implementing the
  documented routes, driven by adversarial tests — conflict, gap, clock drift,
  duplicate upload, reconnect.
- **Widget**: one smoke test per top-level view.
- **Real**: at M3, interop against the user's instance with the upstream web
  client as the second peer.
- **Parity**: checklist derived from `docs/research/upstream-features.md`; no row
  may be dropped without a reason recorded.

## 7. Open questions and risks

1. **Instance auth** (needed at M6): the app can accept a pasted JWT out of the
   box; tell me whether the instance also supports magic-link/passkey so we can
   decide whether in-app login is worth building.
2. **E2EE passphrase**: sync needs it before M6 testing — the server refuses
   plaintext ops. You will be asked for it together with the instance URL and
   token when we get there.
3. **Plugins**: upstream plugins are JavaScript. There is no Dart JS runtime; the
   options are an embedded webview sandbox, a JS engine dependency, or syncing
   plugin *data* without running plugin code. Decision deferred to M8.
4. **Server version**: the server has an app-version floor and checkpoint gate;
   the exact version of the user's instance determines whether `appVersion` must
   be sent on downloads.
5. **Web storage**: SQLite-wasm/OPFS vs IndexedDB. Deferred to M8; the store is
   behind an interface so this stays a swap.
6. **Android widget** parity needs a platform channel, storing a widget model and
   exact alarms — budgeted in M8, not free.

## 8. Toolchain

| Component | Location |
|---|---|
| Flutter 3.50.0 / Dart 3.14 | `W:\repos\WBD\.tmp\flutter-sdk\flutter` |
| Android SDK 36 | `W:\repos\librarium-android\.tooling\android-sdk` |
| JDK 17 | `C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot` |
| Pub cache / Gradle / temp / appdata | `.tooling/` (repo-local, gitignored) |

Every Flutter command needs the redirected environment:

```powershell
. .\tool\env.ps1
flutter analyze
```

That script sets `PUB_CACHE`, `GRADLE_USER_HOME`, `ANDROID_USER_HOME`, `TEMP`,
`APPDATA`, `LOCALAPPDATA` and `JAVA_HOME`. Without it, Gradle and Flutter write to
`C:\Users\*` where this machine's sandbox refuses writes.

## 9. Definition of done

- Feature inventory fully `Done` in `docs/PARITY.md`.
- Round-trip: create data here → sync → read in upstream client → edit → sync
  back → converge, including a deliberate conflict.
- Import an upstream backup and export one it can import.
- No analytics; works in airplane mode; no user content in any log.
