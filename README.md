# superprod

> A modern, cross-platform task management and productivity app built for self-hosted sync from the ground up.

---

**Everything in this repository was produced entirely by AI.** No human contributor, maintainer, or author is claimed for any part of the code, documentation, or design. There is no AI credit, attribution, or retaliation of any kind — this statement exists solely so nobody is mistakenly credited or held responsible for work done by a machine.

---

## What is superprod?

**superprod** is a ground-up rewrite of the task management and personal productivity platform previously known as Super Productivity. It keeps every capability of the original — tasks, subtasks, projects, tags, scheduling, calendar sync, time tracking, Pomodoro/focus mode, reminders, issue integrations, plugins, metrics, habits, worklog, archiving, import/export, and self-hosted sync — and rebuilds them on a clean, modern UI with a cross-platform codebase.

The original app's Android client is a straightforward rebase of the web UI with notifications and widget support layered on top, and the result feels clunky on mobile. superprod is the answer to that: a purpose-built client with a polished, touch-friendly UI that still supports absolutely everything the original does.

## Project identity

| Field | Value |
|---|---|
| App name | `superprod` (all lowercase) |
| Package ID | `com.dwprod.superprod` |
| Platform target | Android + Web (TBD by framework selection) |
| Sync model | Self-hosted first — compatible with any SuperSync-compatible server |
| Feature goal | 100% parity with Super Productivity's native feature set |

## Architecture principles

- **Self-hosted by default.** The app is designed to connect to a user's own SuperSync server (or any compatible backend) from day one. No mandatory cloud account, no vendor lock-in.
- **Feature parity, not feature subset.** Every capability of the original Super Productivity is in scope. Nothing is cut to make the UI simpler.
- **Clean separation of concerns.** Sync, data model, platform integration, and UI are kept as decoupled as the framework allows so the same core can run on multiple platforms.
- **Offline-first where possible.** Local data lives on the device; sync is a transport concern, not a runtime requirement.

## Repository structure

```
.
├── README.md              # This file
├── AGENTS.md              # Agent/contributor guidance + sync invariants
├── FEATURES.md            # Exhaustive feature inventory (40 sections)
├── PARITY.md              # Live per-feature parity tracker (378 rows)
├── FRAMEWORK_OPTIONS.md   # Stack options + the decision + scaffold status
├── src/
│   ├── core/              # entity types, operations, vector clocks, op log
│   └── sync/              # SuperSync client, sync engine, auth
├── tests/                 # unit tests for the engine
├── capacitor.config.ts    # com.dwprod.superprod
└── original source code/  # Upstream reference snapshot — gitignored, read-only
```

`original source code/` is the upstream Super Productivity tree, kept locally as read-only
reference for behavior, data models, the sync protocol and the server API. It is
**gitignored** — the repo itself stays free of it. Do not edit it; do not port its UI.

### Development

```bash
pnpm install
pnpm test        # unit tests
pnpm typecheck   # tsc --noEmit
pnpm dev         # engine shell (needs process spawning; not available under the DSH sandbox)
```

**Status:** stack chosen (TypeScript + Capacitor), UI layer deferred. The engine —
op log, vector clocks, SuperSync HTTP client and sync cycle — is scaffolded and
tested; the renderer comes next. See `FRAMEWORK_OPTIONS.md` § Status and
`PARITY.md` § Implemented so far.

## How this gets built

1. **Understand the source.** We read the original code, models, services, sync protocol, server API, plugin API, and documentation.
2. **Enumerate every feature.** `FEATURES.md` is written to be absolutely exhaustive — no feature left out.
3. **Track parity as we go.** `PARITY.md` is updated after every implemented feature with specifics on what was built and how it maps to the original.
4. **Pick a framework.** Based on the full feature picture, we choose a cross-platform stack together.
5. **Build, feature by feature, to parity.**

## Sync compatibility

superprod targets compatibility with self-hosted **SuperSync** servers. The sync protocol is operation-based (event sourcing) with:

- Per-user, strictly increasing `server_seq` for ordering
- Vector clocks for causality tracking
- Upload of atomic operations: Create, Update, Delete, Move, Batch
- Download of operations since a known sequence number
- Full-state snapshot upload/download for initial sync and recovery
- End-to-end encryption of payloads (Argon2id + AES-256-GCM)
- JWT bearer authentication (passkey or magic-link login on the server side)

The wire format is defined in `original source code/packages/shared-schema/src/supersync-http-contract.ts` and the encryption primitives in `original source code/packages/sync-core/`.

Alternative sync backends supported by the original (WebDAV, file-based, cloud drive providers) are in scope as optional backends where feasible.

## License

MIT — same as the original Super Productivity. See the original repository for the full license text.
