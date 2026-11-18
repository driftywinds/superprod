# SuperSync client ⇄ server contract (upstream v19.2.0)

Research target: `W:\repos\superprod\original source code` (upstream Super Productivity
v19.2.0, read-only). Everything below was read out of that tree; line numbers are from that
snapshot (researched 2026-11-18). **Code is authoritative over docs**; the upstream prose
docs are cited only where they explain *why*.

The upstream HTTP layer is **not** in `src/app/**` — it lives in the `@sp` workspace
packages:

| Concern | Owner |
| --- | --- |
| Wire schemas (zod) shared by client + server | `packages/shared-schema/src/supersync-http-contract.ts` |
| HTTP client, headers, gzip, retries, timeouts | `packages/sync-providers/src/super-sync/super-sync.ts` |
| `requestId` derivation | `packages/sync-providers/src/super-sync/request-id.ts` |
| E2EE (Argon2id + AES-GCM) | `packages/sync-core/src/encryption.ts`, `packages/sync-core/src/encryption/*` |
| Vector clocks (shared algorithm) | `packages/sync-core/src/vector-clock.ts` |
| Op envelope types | `packages/sync-core/src/operation.types.ts` |
| Upload/download orchestration (ops semantics) | `src/app/op-log/sync/operation-log-upload.service.ts`, `operation-log-download.service.ts`, `operation-log-sync.service.ts` |
| Remote-apply pipeline | `src/app/op-log/sync/remote-ops-processing.service.ts`, `src/app/op-log/apply/operation-applier.service.ts` |
| Server routes | `packages/super-sync-server/src/sync/sync.routes.ts`, `sync.routes.ops-handler.ts`, `sync.routes.snapshot-handler.ts` |
| Server services | `packages/super-sync-server/src/sync/sync.service.ts`, `sync/conflict.ts`, `sync/services/*` |
| Server auth | `packages/super-sync-server/src/api.ts`, `auth.ts`, `middleware.ts` |

Two different "clients" are in play. The server is an **opaque op relay with causal
conflict detection**: it never interprets `actionType`/`payload`. Byte-exact interop with
the *server* needs the envelope, ids, clocks and encryption below. Byte-exact interop with
**existing SP clients on the same account** additionally needs SP's action vocabulary and
reducer semantics (§4, §9), because payloads are replayed through the receiving client's
reducers.

---

## 1. Auth

### 1.1 What the upstream client does

The SP client has **no login flow and no token-refresh flow**. The JWT is obtained out of
band and pasted by the user into the sync config dialog; the server's own web UI (passkey
or magic-link login, `packages/super-sync-server/src/api.ts:388-651`, `public/app.js`) is
where a human copies it from. The only auth endpoint the client itself calls is
`POST /api/replace-token`.

- Config shape: `SuperSyncPrivateCfg { accessToken, baseUrl?, refreshToken?, expiresAt?, encryptKey?, isEncryptionEnabled? }`
  (`packages/sync-providers/src/super-sync/super-sync.model.ts:19-50`). `refreshToken` /
  `expiresAt` exist but **no code path refreshes a SuperSync token**.
- Header on every request: `Authorization: Bearer <accessToken>`
  (`packages/sync-providers/src/super-sync/super-sync.ts:1048`, native path `:1251-1254`).
  Server requires exactly `Bearer ` + token (`packages/super-sync-server/src/middleware.ts:34-38`).
- Token sanitisation: non-ASCII/control chars are stripped before sending (pasted-token UX)
  — `super-sync.ts:923-925`.
- `appVersion` (bare semver, e.g. `19.2.0`) is appended as a **query parameter** to every
  request and the WS handshake — `super-sync.ts:791-799`, `super-sync-websocket.service.ts:171-178`.
  It is a query param, not a header, so older servers just ignore it.

### 1.2 JWT

Server-signed HS256 JWT, claims `{ userId, email, tokenVersion }`, `expiresIn: '365d'`
(`packages/super-sync-server/src/auth.ts:19`, `:179-181`). There is **no refresh
endpoint**; expiry or a `tokenVersion` bump means the user re-authenticates and pastes a
new token.

`verifyToken` failure reasons (sent as `{ error: <reason> }` with HTTP 401):
`Missing or invalid Authorization header`, `Invalid token`,
`Token expired. Please log in again to get a new token.`,
`Token was revoked. Please log in again to get a new token.`, `Account unavailable`
(`middleware.ts:34-43`, `auth.ts:188-267`).

### 1.3 Client reaction to auth failures

- 401/403 → `AuthFailSPError` (reason slug from body, capped at 80 chars).
- `errorCode === CLIENT_UPDATE_REQUIRED` is checked **first, on any status**, and is
  terminal but must **not** count as an auth failure
  (`super-sync.ts:842-853`; contract note `supersync-http-contract.ts:85-91`).
- Each 401 first drops the provider's cached credentials and re-reads them from the shared
  store (another tab's `replace-token` rotation must not strike this tab out).
- Three consecutive `AuthFailSPError`s for SuperSync then clear the stored token so the
  re-auth UI opens; any successful download or non-auth error resets the counter
  (`src/app/imex/sync/sync-wrapper.service.ts:225-231`, `:636-639`, `:917-989`).

### 1.4 Device / clientId registration

There is **no registration endpoint**. Identity is local:

- `clientId` = `${platformCode}_${6 base62}`, e.g. `B_a7Kx9Z` (`src/app/core/util/generate-client-id.ts:118-120`);
  accepted charset `^[a-zA-Z0-9_-]+$`, ≤255 chars (`supersync-http-contract.ts:3-4,112-119`).
  Server-side it is self-declared and unauthenticated.
- The device row is created/updated by the server as a side effect of sync activity:
  first accepted upload upserts `sync_devices` (`sync.service.ts:625-651`), downloads
  `touchDevice(...)` throttled to 2 min (`sync.routes.ts:139-145`, `sync.types.ts:535-545`),
  WS heartbeat also touches it (`websocket-connection.service.ts:589`).
- `GET /api/sync/devices` lists `{ clientId, lastSeenAt }`; the client shows it as-is
  and has no rename/devicename field (`super-sync.model.ts:52-63`). Per-device UI names
  live only in local config.

### 1.5 Every auth-related endpoint the client uses

| Method/path | Purpose | Body | Response |
| --- | --- | --- | --- |
| `POST /api/replace-token` | "Sign out all other devices"; bumps `tokenVersion`, closes all the account's WS sockets, returns a fresh JWT | `{}` (Fastify rejects a body-less JSON POST) | `200 { token, user:{ id, email } }`; client validates only `token` (`supersync-http-contract.ts:315-326`, `super-sync.ts:518-551`) |

Not called by the SP client (available on the server for a new client that wants in-app
login): `POST /api/register/magic-link`, `POST /api/login/magic-link`,
`POST /api/login/magic-link/verify` → `{ token, user }`; passkey equivalents
`/api/login/passkey/options|verify`, `/api/register/passkey/options|verify`,
`/api/recover/passkey*`; `GET /verify-email`; `DELETE /api/account`
(`packages/super-sync-server/src/api.ts`). No endpoint ever returns a refresh token.

---

## 2. Transport

### 2.1 Base URL

`baseUrl` from provider config, falling back to the host constant
`https://sync.super-productivity.com` (injected as `defaultBaseUrl`, kept out of the
package) — `super-sync.ts:782-784`, `super-sync.model.ts:9`. A single trailing `/` is
stripped. Paths are appended verbatim (`/api/sync/...`). No version prefix, no
`basePath` concept.

### 2.2 Headers

| Request | Header |
| --- | --- |
| all | `Authorization: Bearer <token>` |
| JSON body | `Content-Type: application/json` |
| gzip body (web) | `Content-Encoding: gzip` |
| gzip body (native, base64) | `Content-Encoding: gzip`, `Content-Transfer-Encoding: base64` |

Client code: `super-sync.ts:1046-1049` (`_fetchApi`), `:1069-1072` (`_fetchApiCompressed`),
`:1102-1104` (native base64). No `Accept`, `User-Agent`, or `Accept-Encoding` is set by
the client; no custom headers, no cookies.

### 2.3 gzip

- `POST /api/sync/ops` and `POST /api/sync/snapshot` bodies are gzipped by the client
  (`super-sync.ts:286-300`, `:409-446`). Native platforms base64-encode the gzip bytes
  because Android WebView corrupts binary `fetch` bodies (`:1087-1110`).
- Server accepts exactly one of: identity JSON, `Content-Encoding: gzip` (raw gzip
  buffer), or `Content-Encoding: gzip` + `Content-Transfer-Encoding: base64`. Layered /
  other encodings → `415` (`sync.routes.ts:32-69`).
- Request limits enforced server-side (`sync.routes.payload.ts:95-121`):
  gzip ≤10 MiB / decompressed ≤30 MiB for `/ops`; gzip ≤30 MiB / decompressed ≤60 MiB for
  `/snapshot`; raw HTTP `bodyLimit` = base64 envelope of the gzip limit (≈13.3 MiB / 40 MiB).
  Exceeding → `413` (`PAYLOAD_TOO_LARGE` for the ops-count case).
- **Responses are never gzipped by the server**: there is no `@fastify/compress`
  registration (`packages/super-sync-server/src/server.ts:416-521`), so responses are
  plain `application/json`. A reverse proxy in front may compress; a normal HTTP stack
  decompresses transparently. Do not implement custom response-gzip handling.

### 2.4 Timeouts

| Path | Value | Source |
| --- | --- | --- |
| Web fetch abort (covers body read + JSON parse) | **75 s** | `super-sync.ts:49-50`, `:1128-1131` |
| Native connect / read | 10 s / 75 s | `super-sync.ts:1264-1265` |
| Server request timeout (Fastify) / DB statement | 80 s / 60 s | `server.ts:383`, `sync.service.ts:501`, `operation-download.service.ts:38` |
| Client "wait for in-flight sync" | 90 s | `src/app/imex/sync/sync.const.ts:36` |

A slow response (>30 s) is logged but not failed (`super-sync.ts:1166-1172`).

### 2.5 Retry / backoff

Web (`super-sync.ts:1124-1233`):
- 2 retries (`SUPERSYNC_WEB_MAX_RETRIES = 2`), delay `1000 * (attempt+1)` ms → 1 s, 2 s.
- Retried only for transient **network** errors (`isRetryableUploadError`); never for
  `AbortError` (timeout), 401/403, `CLIENT_UPDATE_REQUIRED`, or any non-2xx status.
- Timeout does **not** retry; it throws `SuperSync request timeout after 75s`.

Native (`packages/sync-providers/src/http/native-http-retry.ts:17-18`, `:82-123`):
- 2 retries, 1.5 s then 3 s, only for transient network codes/messages.
- `noRetry` (0 retries) for non-idempotent endpoints: `/api/replace-token`,
  `/api/capture/tokens`, `/api/capture/connect-code`.

Higher-level retries the new client should copy:
- Snapshot upload after a destructive `DELETE /api/sync/data` retries 429 up to 2 times,
  honouring `retry in N minute(s)/second(s)` parsed from the body, capped at 10 min
  (`src/app/imex/sync/snapshot-upload.service.ts:316-386`).
- Sync cycle re-uploads LWW local-win / transiently rejected ops up to
  `MAX_LWW_REUPLOAD_RETRIES = 3` (`src/app/op-log/core/operation-log.const.ts:266`,
  `sync-wrapper.service.ts:750-803`).
- WS-triggered download retries 3 times with 1 s/2 s/4 s, then reports ERROR
  (`ws-triggered-download.service.ts:24-27`).

### 2.6 Request deduplication (`requestId`)

`requestId` is a client-generated, deterministic, URL-safe id (`^[A-Za-z0-9_-]{1,64}$`,
`supersync-http-contract.ts:106-108`). The server caches the response in-process for
**5 minutes**, keyed `(userId, namespace, requestId)` with a body fingerprint check
(`request-deduplication.service.ts:24`, `:75-123`). On a hit it returns `deduplicated: true`
(and re-computes piggybacked `newOps` from the retry's `lastKnownServerSeq`).

Client derivation (`request-id.ts`):

```
ops:      ops-v1-<count>-<firstOpId[:8]>-<lastOpId[:8]>-<hash(clientId|stableJson(ops, encrypted payloads replaced by "[encrypted-payload]")>
snapshot: snapshot-v1-<clientId[:8]>-<opId[:8]>-<hash(clientId|opId)>
```

Non-alphanumerics are stripped from the id fragments (`.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,8)`),
the hash is 32-bit FNV-1a ×2 rendered base36. Encrypted payload bytes are deliberately
excluded (fresh IVs make retries differ). A new client can use any deterministic scheme
satisfying the charset/length; matching upstream's exact string is not required for
correctness, only for byte-identical traffic.

### 2.7 Rate limiting

Server-side, both route-level (per IP, `@fastify/rate-limit`) and one per-user upload
limit (`sync.types.ts:547-552`, `rate-limit.service.ts:30-49`):

| Route | Limit |
| --- | --- |
| `POST /api/sync/ops` | 100/min per IP **and** 100/min per user → `429 { error:'Rate limited', errorCode:'RATE_LIMITED' }` |
| `GET /api/sync/ops` | 200/min |
| `POST /api/sync/snapshot` | 10 / 15 min |
| `DELETE /api/sync/data` | 3 / 15 min |
| `GET /api/sync/restore/:seq` | 10 / 5 min |
| `GET /api/sync/restore-points`, `/devices` | 30/min, 30/min |
| `GET /api/sync/status` | 60/min |
| `POST /api/replace-token` | 5 / 15 min |
| WS upgrade | 120/min per `(ip, clientId)`, 10 000 / 15 min per IP |

429 bodies include an optional human message matching `retry in N second(s)/minute(s)`
(`super-sync.ts:894-916`); the client only uses it for the post-delete snapshot retry.
The per-user limiter is checked **before** dedup and before the E2EE gate, and is
process-local (single-instance assumption, `sync.service.ts:89-101`).

---

## 3. Endpoints

All sync routes require `Authorization` and live under `/api/sync` (`server.ts:499-504`).
The client's provider is the only caller (`packages/sync-providers/src/super-sync/super-sync.ts`).

| # | Method | Path | Used for |
| --- | --- | --- | --- |
| 1 | POST | `/api/sync/ops` | upload local ops (gzip) |
| 2 | GET | `/api/sync/ops` | download remote ops |
| 3 | POST | `/api/sync/snapshot` | upload full state (gzip) |
| 4 | DELETE | `/api/sync/data` | wipe all server data for the account |
| 5 | GET | `/api/sync/devices` | device list UI |
| 6 | GET | `/api/sync/restore-points` | restore-point UI |
| 7 | GET | `/api/sync/restore/{serverSeq}` | server-side state at seq (unusable under E2EE) |
| 8 | POST | `/api/replace-token` | rotate token / sign out other devices |
| 9 | WS | `/api/sync/ws` | push notification of new ops |
| — | GET | `/api/sync/status` | **not used** by the client (`sync.routes.ts:222`) |

Agent-capture endpoints (`/api/capture/*`) exist and are used by a separate feature; out of
scope for sync (see `super-sync.ts:562-699` if needed).

### 3.1 POST /api/sync/ops

Request (`supersync-http-contract.ts:164-169`, `sync.types.ts:324-329`):

```json
{
  "ops": [ /* 1..100 Operation objects (§4); client sends ≤25 */ ],
  "clientId": "B_a7Kx9Z",
  "lastKnownServerSeq": 124,
  "requestId": "ops-v1-25-a1b2c3d4-e5f6g7h8-1a2b3c"
}
```

`lastKnownServerSeq` is optional for the schema but the client always sends it. It drives
(a) piggybacked `newOps`, (b) the stale-cursor fence, (c) dedup-hit piggyback recompute.

Response `200` (`supersync-http-contract.ts:235-254`):

```json
{
  "results": [
    { "opId": "019ab...", "accepted": true,  "serverSeq": 125 },
    { "opId": "019ac...", "accepted": false, "error": "Concurrent modification detected for TASK:abc",
      "errorCode": "CONFLICT_CONCURRENT", "existingClock": { "B_x1": 4, "E_y2": 2 } }
  ],
  "newOps": [ { "serverSeq": 126, "op": { /* Operation */ }, "receivedAt": 1730000000000 } ],
  "latestSeq": 126,
  "hasMorePiggyback": true,
  "deduplicated": false
}
```

`newOps` only present when `lastKnownServerSeq` was sent and ops exist; `hasMorePiggyback`
only when the piggyback page hit the server's 500-op cap and more remain
(`sync.routes.ops-handler.ts:323-371`). `deduplicated` is informational (client ignores).

Per-batch / per-request failures (before any op result exists):

| Status | `errorCode` | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | body failed zod (no `details` in production) |
| 400 | `E2EE_REQUIRED` | some op is not `isPayloadEncrypted:true` or payload is not ciphertext-shaped (`sync.routes.payload.ts:47-73`) |
| 401 | – | token invalid/expired/revoked |
| 413 | `PAYLOAD_TOO_LARGE` | >100 ops, or gzip/decompressed body over limit |
| 413 | `STORAGE_QUOTA_EXCEEDED` | quota gate (possibly after auto-cleanup attempt) |
| 415 | – | unsupported `Content-Encoding` |
| 429 | `RATE_LIMITED` | see §2.7 |
| 500 | – | `{ error: 'Internal server error' }` |

Client reaction: any non-2xx throws a `SuperSyncHttpStatusError` (or auth/update error);
pending ops stay pending and are retried next cycle. No partial acknowledgement exists at
the HTTP level.

### 3.2 GET /api/sync/ops

Query (`supersync-http-contract.ts:171-183`):

| Param | Type | Notes |
| --- | --- | --- |
| `sinceSeq` | int ≥ 0, required | client's cursor |
| `limit` | 1..1000, default 500 | client always sends 500 (`DOWNLOAD_PAGE_SIZE`) |
| `excludeClient` | clientId regex | the caller's own id ("don't echo my ops") |
| `appVersion` | loose string | device diagnostic only; never fails the request |

Response `200` (`supersync-http-contract.ts:256-272`):

```json
{
  "ops": [ { "serverSeq": 125, "op": { /* ... */ }, "receivedAt": 1730000000000 } ],
  "hasMore": true,
  "latestSeq": 900,
  "gapDetected": true,
  "snapshotVectorClock": { "B_a7Kx9Z": 12, "E_olddev": 40 },
  "serverTime": 1730000000123,
  "capabilities": { "causalRepairSnapshots": true }
}
```

Semantics (`packages/super-sync-server/src/sync/services/operation-download.service.ts`):

- `excludeClient` is a hard filter; own ops are never returned (except a fenced retry, see
  below). Ordering is ascending `serverSeq`, always.
- **Fast-forward:** if a causal full-state op exists at seq `S > sinceSeq`, the server
  starts at `S-1` and returns that op, i.e. the client gets the full-state op instead of
  superseded history. It also returns `snapshotVectorClock` = aggregate clock up to `S`
  (pruned to 20, preserving requester + snapshot author), but only for the normal download
  call (`:130-349`, `:321-348`).
- `hasMore` = route fetched `limit+1` and popped one (`sync.routes.ts:155-165`).
- **`gapDetected`** = client is ahead of the server, or the requested seq was purged, or
  the first returned `serverSeq > effectiveSinceSeq + 1` (and no `excludeClient`), or the
  server is empty/reset while `sinceSeq > 0` (`:149-166`, `:259-295`).
- `serverTime` is `Date.now()` at response time; the only clock-drift signal.
- `capabilities.causalRepairSnapshots: true` is hardcoded by this server version
  (`sync.routes.ts:185`). Absent/false ⇒ the client must not upload REPAIR.

Errors: 400 on bad query, 401, 429, 500.

### 3.3 POST /api/sync/snapshot

Request (`supersync-http-contract.ts:185-208`), gzip-encoded by the client:

```json
{
  "state": "<base64 ciphertext or plain JSON object>",
  "clientId": "B_a7Kx9Z",
  "reason": "initial | recovery | migration",
  "vectorClock": { "B_a7Kx9Z": 42 },
  "schemaVersion": 4,
  "isPayloadEncrypted": true,
  "syncImportReason": "PASSWORD_CHANGED | FILE_IMPORT | BACKUP_RESTORE | FORCE_UPLOAD | SERVER_MIGRATION | REPAIR",
  "opId": "019ab...-uuid-v7",
  "isCleanSlate": false,
  "snapshotOpType": "SYNC_IMPORT | BACKUP_IMPORT | REPAIR",
  "repairBaseServerSeq": 124,
  "requestId": "snapshot-v1-B_a7Kx-019ab...-9x8y7z"
}
```

`opId` is **required** when `isCleanSlate` is true (superRefine). The server uses the
client `opId` as the created operation's id, so retries are idempotent
(`sync.routes.snapshot-handler.ts:275-321`, `:454-486`).

Response `200`:

```json
{ "accepted": true, "serverSeq": 125 }
{ "accepted": false, "error": "REPAIR snapshot does not include current server state", "errorCode": "REPAIR_STALE" }
```

**Logical rejections are HTTP 200 with `accepted:false`** — the client must inspect the
body, not the status. Exceptions: `400` (zod / missing `opId`), `409`
`{ error:'SYNC_IMPORT_EXISTS', errorCode:'SYNC_IMPORT_EXISTS' }` (an `initial` import
already exists and this is not an idempotent retry of it), `413` quota, `429`.

Server behaviour worth knowing:

- Creates one operation: `actionType = '[SP_ALL] Load(import) all data'`,
  `entityType = 'ALL'`, `opType = snapshotOpType ?? 'SYNC_IMPORT'`, `timestamp = server now`,
  `id = opId ?? uuidv7()` (`sync.routes.snapshot-handler.ts:243-261`).
- `isCleanSlate` deletes **all** ops + devices, clears caches and the storage counter, but
  keeps `lastSeq` so sequence numbers never get reused (`sync.service.ts:315-350`). It is
  **ignored for REPAIR** (`sync.routes.snapshot-handler.ts:112`).
- REPAIR requires `repairBaseServerSeq === current lastSeq`, otherwise `REPAIR_STALE`
  (`sync.service.ts:285-313`).
- Plaintext is rejected by the E2EE gate for every snapshot op type
  (`sync.routes.snapshot-handler.ts:118-130`).
- Server-side snapshot caching (for `GET /restore/:seq`) only happens for unencrypted
  payloads, i.e. never in practice (`snapshot.service.ts:167-176`).

Errors/statuses: see above; `500` on unexpected failures.

### 3.4 DELETE /api/sync/data

No body. Deletes all ops + devices, clears snapshot cache and `latestFullState*` markers,
resets storage counter; keeps the `lastSeq` allocator (`sync.service.ts:940-982`).
Response `{ success: true }`. Client then removes its persisted cursor and uploads a clean
slate snapshot (`src/app/imex/sync/snapshot-upload.service.ts:271-298`).

### 3.5 GET /api/sync/devices

`{ "devices": [ { "clientId": "B_a7Kx9Z", "lastSeenAt": 1730000000000 } ] }`
— newest activity first, no names (`sync.routes.ts:268-295`, `device.service.ts`).

### 3.6 GET /api/sync/restore-points?limit=30

`limit` 1..100 (invalid → 400). Response:
`{ "restorePoints": [ { "serverSeq": 120, "timestamp": 1729999999999, "type": "SYNC_IMPORT"|"BACKUP_IMPORT"|"REPAIR", "clientId": "...", "description": "Full sync import" } ] }`
Only causal full-state ops (SYNC_IMPORT/BACKUP_IMPORT, or REPAIR *with* a
`repairBaseServerSeq`) are listed (`snapshot.service.ts:329-357`, `sync.types.ts:27-32`).
The dialog renders unknown `type`s generically; restore works by `serverSeq`.

### 3.7 GET /api/sync/restore/{serverSeq}

`{ "state": <replayed state>, "serverSeq": 120, "generatedAt": 1730000000000 }`.
Under E2EE this is **unavailable**: if any op in the rebuilt range is encrypted the server
returns `400 { error: <static message>, errorCode: 'ENCRYPTED_OPS_NOT_SUPPORTED' }`
(`sync.routes.ts:403-413`, `sync.routes.payload.ts:22-24`). The upstream client's
restore-from-server flow therefore only survives for legacy plaintext histories; a new
E2EE client must restore locally from its own data.

### 3.8 POST /api/replace-token

See §1.5. Client also migrates its persisted cursor key from the old token to the new one
before persisting the token (`super-sync.ts:539-550`).

### 3.9 WebSocket

See §10.

---

## 4. Operation model

### 4.1 Wire object

`packages/shared-schema/src/supersync-http-contract.ts:121-142`; client type
`packages/sync-providers/src/provider-types.ts:95-110`; lib type
`packages/sync-core/src/operation.types.ts:37-111`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string 1..255 | yes | UUID v7 (time-ordered); unique per user; reused only for an exact retry |
| `clientId` | `^[A-Za-z0-9_-]+$`, ≤255 | yes | must equal the request's `clientId` |
| `actionType` | string 1..255 | yes | opaque to the server; SP semantics (§4.4) |
| `opType` | enum `CRT`,`UPD`,`DEL`,`MOV`,`BATCH`,`SYNC_IMPORT`,`BACKUP_IMPORT`,`REPAIR` | yes | |
| `entityType` | string 1..255 | yes | server whitelist = 21 values (§4.3) |
| `entityId` | string ≤255 | see below | required for non-full-state ops unless `entityType` ∈ {`ALL`,`RECOVERY`}; non-empty, not whitespace |
| `entityIds` | string[] ≤1000 | no | multi-entity ops; merged with `entityId` for server conflict probing |
| `payload` | unknown | yes | **JSON string (base64 ciphertext) when encrypted**; object otherwise |
| `vectorClock` | `{ [clientId]: int }` | yes | §7 |
| `timestamp` | number | yes | epoch ms from the originating device; must be a safe integer |
| `schemaVersion` | int 1..100 | yes | emit `4` (§4.5) |
| `isPayloadEncrypted` | boolean | optional on the wire | in practice always `true` (§12) |
| `syncImportReason` | enum | optional | `PASSWORD_CHANGED`,`FILE_IMPORT`,`BACKUP_RESTORE`,`FORCE_UPLOAD`,`SERVER_MIGRATION`,`REPAIR` |
| `repairBaseServerSeq` | int ≥0 | optional | server cursor a causal REPAIR snapshot was built on |

Server-side normalisation: future `timestamp` is **clamped** to `now + 60 s`
(`maxClockDriftMs`, `sync.types.ts:547-552`, `operation-upload.service.ts:106-127`);
`entityIds` is stored as `[]` when the touched set is just `[entityId]`, otherwise the full
deduped set (`conflict.ts:695-706`). Client clocks are stored pruned to 20 (§7).

### 4.2 Payload shapes

**Regular op, before encryption** (this is what the ciphertext decrypts to;
`operation-capture.meta-reducer` / `operation-log.effects.ts:302-341`):

```json
{
  "actionPayload": { /* the original action's properties minus `type` and `meta` */ },
  "entityChanges": [
    { "entityType": "TASK", "entityId": "abc", "opType": "UPD", "changes": { "title": "x" } }
  ]
}
```

`entityChanges` is `[]` for almost everything; it is populated only for TIME_TRACKING /
task-time sync. `actionPayload` is what receivers replay (§9).

**Synthetic LWW update** (`packages/sync-core/src/operation.types.ts:224-263`,
`src/app/op-log/sync/lww-update-op.util.ts:39-130`):

```json
{
  "actionPayload": { "id": "<entityId>", /* full entity snapshot for replace, changed keys for patch */ },
  "entityChanges": [],
  "lwwUpdateMode": "replace" | "patch",
  "projectMoveFootprint": ["rootTaskId", "subtaskId"],
  "clearedFields": ["dueWithTime"],
  "recreatesEntityAfterDelete": true
}
```

Semantics: `replace` = complete winning snapshot (omitted keys are cleared); `patch` =
field-level delta where omitted keys must stay untouched; `clearedFields` lists keys whose
value is an explicit clear (JSON drops `undefined`, so this is the only way to transmit a
clear, #9776). `projectMoveFootprint` is the authenticated copy of the plaintext
`op.entityIds`; receivers must trust only this inside the payload
(GHSA-8pxh-mgc7-gp3g). Unknown extra envelope keys are tolerated by older clients.

**Full-state op payload** = the complete app state (what SP's `loadAllData` reducer takes):
keys such as `task`, `project`, `tag`, `note`, `globalConfig`, `planner`, `boards`,
`menuTree`, `timeTracking`, `taskArchive`, `reminder`, `section`, `metric`,
`simpleCounter`, `taskRepeatCfg`, `issueProvider`, `archiveYoung`, `archiveOld`.
Legacy payloads may wrap it as `{ appDataComplete: {...} }`; both must be accepted
(`operation.types.ts:158-190`). REPAIR additionally carries
`{ appDataComplete, repairSummary, repairBaseServerSeq? }` (`:147-156`).

At rest/on the wire under E2EE, all of the above is replaced by one base64 string; only
the envelope fields stay plaintext.

### 4.3 Entity types (closed set, 21)

`packages/shared-schema/src/entity-types.ts:15-37`; server rejects anything else
(`validation.service.ts:25,111-117`).

| Entity type | Storage pattern | Payload key | Notes |
| --- | --- | --- | --- |
| `TASK` | adapter | `task` | |
| `PROJECT` | adapter | `project` | |
| `TAG` | adapter | `tag` | `TODAY` is a virtual tag, never in `task.tagIds` |
| `NOTE` | adapter | `note` | |
| `SIMPLE_COUNTER` | adapter | `simpleCounter` | |
| `TASK_REPEAT_CFG` | adapter | `taskRepeatCfg` | |
| `METRIC` | adapter | `metric` | |
| `ISSUE_PROVIDER` | adapter | `issueProvider` | |
| `SECTION` | adapter | `section` | `{ id, contextId, contextType, taskIds, ... }` |
| `GLOBAL_CONFIG` | singleton | `globalConfig` | addressed by section key, e.g. `misc`, `sync`, `tasks` |
| `TIME_TRACKING` | singleton | `timeTracking` | ops addressed by composite `TYPE:id:date` |
| `MENU_TREE` | singleton | `menuTree` | addressed by `projectTree` / `tagTree` / folderId |
| `WORK_CONTEXT` | singleton | `workContext` | |
| `PLANNER` | map (`days`) | `planner` | **entityId is the day OR a task id** — §9 |
| `BOARD` | array (`boardCfgs`) | `board` | |
| `REMINDER` | array (state is array) | `reminder` | |
| `PLUGIN_USER_DATA` | array | `pluginUserData` | ids `pluginId:key` |
| `PLUGIN_METADATA` | array | `pluginMetadata` | |
| `MIGRATION` | — | — | genesis op, local only, never uploaded by API providers |
| `RECOVERY` | — | — | genesis op, local only |
| `ALL` | — | — | full-state ops (`SYNC_IMPORT`/`BACKUP_IMPORT`) |

Registry: `src/app/op-log/core/entity-registry.ts:165-348`. `MIGRATION`/`RECOVERY` ops are
skipped on upload and acknowledged locally (`operation-log-upload.service.ts:278-286`,
`:411-423`).

### 4.4 Action types

`actionType` is an unbounded string on the wire. The SP vocabulary is the
`ActionType` enum — `src/app/op-log/core/action-types.enum.ts:15-207`, ~150 exact strings
such as `[Task Shared] updateTask`, `[Task Shared] addTask`, `[Project] Update Project`,
`[Global Config] Update Global Config Section`, `[TimeTracking] Sync time spent`,
`[SP_ALL] Load(import) all data`, `[Repair] Auto Repair`. Plus one synthetic family:
`[<ENTITY_TYPE>] LWW Update` for every entity type (`packages/sync-core/src/lww-update-action-types.ts:8,28-45`).
Aliases for renamed actions live in `ACTION_TYPE_ALIASES`
(`src/app/op-log/apply/operation-converter.util.ts:65-67`).

A new client that only talks to the server may invent its own action types (the server
never validates them). A new client that shares an account with SP clients **must** reuse
these strings and the payload shapes, because receivers replay them through reducers and
meta-reducers, and block on unknown `opType`/`syncImportReason` if a newer client widens
the enum (`remote-op-block.util.ts:25-90`).

### 4.5 Op types (closed set, 8)

`CRT`, `UPD`, `DEL`, `MOV` (reorder), `BATCH` (bulk), `SYNC_IMPORT`, `BACKUP_IMPORT`,
`REPAIR` (`packages/sync-core/src/operation.types.ts:5-35`,
`supersync-http-contract.ts:14-23`). The last three are **full-state** ops: they replace
whole state, are uploaded through the snapshot endpoint, and skip server conflict
detection (`conflict.ts:71-78`).

`schemaVersion`: current = **4**, minimum supported = 1
(`packages/shared-schema/src/schema-version.ts:36-43`). Emit 4. Receivers must:
- migrate 1→2 (`GLOBAL_CONFIG:misc` → `tasks` field renames/splits),
- accept 2→3 (no op transform; state backfill `idle.isSuppressIdleDuringFocusMode=false`),
- accept 3→4 (no op transform; delete-wins project marker),
- **block** any op with `schemaVersion > 4` or unknown `opType`/`syncImportReason`, and keep
  the cursor behind it (`remote-ops-processing.service.ts:166-253`,
  `remote-op-block.util.ts:62-90`).

### 4.6 Duplicate detection (server)

An op id that already exists is accepted as a duplicate only if the whole identity matches:
`userId, clientId, actionType, opType, entityType, entityId, entityIds, payload (encrypted
payloads compare as "both encrypted"), vectorClock (pruned with the stored key set),
schemaVersion, timestamp (or a prior future-clamp of that same original timestamp),
isPayloadEncrypted, syncImportReason, repairBaseServerSeq`
(`conflict.ts:503-565`). Otherwise `INVALID_OP_ID` ("already belongs to a different
operation"). Exact retry → `DUPLICATE_OPERATION`, which the client treats as success
(§5.5).

---

## 5. Upload flow

### 5.1 Client algorithm (`src/app/op-log/sync/operation-log-upload.service.ts`)

1. Take the `UPLOAD` lock; flush pending op writes; run the optional migration pre-upload
   callback (server-migration check) under that lock (`:154-195`).
2. Fresh-client guard: a client with no history never uploads (`operation-log-sync.service.ts:285-295`).
3. Rejected-full-state barrier: if the newest full-state op was rejected and no newer one
   exists, upload is blocked (`:198-213`).
4. Read `pendingOps = getUnsynced()` and `lastKnownServerSeq = getLastServerSeq()`.
5. Mandatory-encryption guard: SuperSync (`isEncryptionMandatory = true`) **refuses to
   upload at all** without a usable key (`:244-256`; `super-sync.ts:164`). Downloads still
   run.
6. Split off full-state ops → uploaded to `/api/sync/snapshot` (one request each, §5.3).
7. Regular ops → converted to `SyncOperation` (dropping local-only fields, §5.2) → chunked
   **25 per request** (`MAX_OPS_PER_UPLOAD_REQUEST`, `operation-log.const.ts:238`).
8. For each chunk: encrypt payloads (`encryptOperations`), `uploadOps(chunk, clientId, lastKnownServerSeq)`,
   then:
   - accepted results → `markSynced` (deferred until after piggyback processing),
   - rejected results → collected, **not** marked rejected yet,
   - `newOps` (piggyback) → decrypted/asserted, returned to the caller for conflict
     detection **before** rejections are resolved (`:601-662`; `operation-log-sync.service.ts:313-332`).
9. `lastKnownServerSeq` update from each response (`planUploadLastServerSeqUpdate`,
   `packages/sync-core/src/upload-planning.ts:88-121`):
   - `hasMorePiggyback` + piggybacked ops → keep only the highest piggybacked seq (so the
     follow-up download still sees the rest),
   - `hasMorePiggyback` but no ops → keep the old value (never advance),
   - otherwise → `max(current, latestSeq)`.
   The cursor is persisted only **after** the piggybacked ops were applied (crash safety);
   the upload service returns `lastServerSeqToPersist` for that (`:679-691`; consumer
   `operation-log-sync.service.ts:477-500`).
10. Full-state op accepted → regular ops appended **before** it are marked synced without
    upload (they are inside the snapshot), using local `seq` order, not UUID order
    (`upload-planning.ts:34-59`; `operation-log-upload.service.ts:430-457`).

Chunk loop stops on the first thrown HTTP error; already accepted chunks stay synced.

### 5.2 Local-only / sanitised ops

- `[Task Shared] deleteTasks` uploads a copy of the multi-entity payload with
  `actionPayload.tasks` removed (`:781-792`).
- `GLOBAL_CONFIG` LWW ops have local-only sync-schedule settings stripped; if nothing
  remains the op is acknowledged locally without upload (`:794-851`).
- `MIGRATION`/`RECOVERY` genesis ops are not uploaded by API providers.

### 5.3 Full-state (snapshot) upload

`_uploadFullStateOpAsSnapshot` (`:863-954`):

- Payload → `extractFullStateFromPayload` (accepts wrapped/unwrapped) →
  strip local-only settings → validate it has at least one of `task/project/tag/globalConfig`.
- Encrypt whole state if a key exists (`isPayloadEncrypted = !!encryptKey`).
- `reason` mapping: `SYNC_IMPORT → 'initial'`, `BACKUP_IMPORT → 'recovery'`,
  `REPAIR → 'recovery'`.
- `isCleanSlate`: `BACKUP_IMPORT` always true; `SYNC_IMPORT` only when
  `syncImportReason === 'FORCE_UPLOAD'` or the caller explicitly asked; `REPAIR` never
  (`:317-333`).
- REPAIR is refused client-side unless the server advertised
  `capabilities.causalRepairSnapshots`; the synthetic failure code is
  `REPAIR_CAUSALITY_UNSUPPORTED`, which the rejection handler turns into a hard error
  telling the user to upgrade the server (`:888-898`, `rejected-ops-handler.service.ts:191-195`).
- `syncImportReason` and `repairBaseServerSeq` are only included when defined (JSON omits
  them otherwise).

`SYNC_IMPORT_EXISTS` (409 or `accepted:false`): the client deletes its local SYNC_IMPORT and
lets the normal download bring the remote state (`:354-369`).

### 5.4 Rejection handling (the recovery contract)

`RejectedOpsHandlerService.handleRejectedOps` (`src/app/op-log/sync/rejected-ops-handler.service.ts:139-345`):

| `errorCode` | Client action |
| --- | --- |
| `CONFLICT_CONCURRENT`, `CONFLICT_SUPERSEDED`, `CONFLICT_STALE` (legacy) | resolve as concurrent (below) |
| `REPAIR_STALE` (on a REPAIR op) | download the concurrent suffix, then rebase the REPAIR with the new `repairBaseServerSeq` (`:296-323`) |
| `DUPLICATE_OPERATION` | mark the op synced (server already has it) (`:201-210`) |
| `INTERNAL_ERROR` | keep pending, retry next cycle (`:182-189`) |
| `STORAGE_QUOTA_EXCEEDED` | keep pending + strong alert (`:170-180`) |
| `REPAIR_CAUSALITY_UNSUPPORTED` | throw (server too old) |
| anything else | **permanently rejected** (`markRejected`), snack "X ops rejected" |

Concurrent recovery (`:350-640`):
1. Count attempts per `entityType:entityId`; > 3 → permanently reject (`MAX_CONCURRENT_RESOLUTION_ATTEMPTS`).
2. Download once (normal). If it yields ops, conflict detection already ran; any op still
   pending is resolved locally with merged clocks.
3. If the download yields 0 ops but ops are still pending, force a **seq-0 download**
   (`forceFromSeq0: true, isReDeliveryRetry: true`) to collect every clock on the server,
   including `snapshotVectorClock` and `allOpClocks`.
4. Merge the pending op's clock + downloaded clocks + `existingClock` from the rejection,
   increment own counter, and either
   - re-emit an LWW update carrying current entity state (LWW local win), or
   - resolve as superseded (delete → recreate; archive → archive-wins op; §9).
5. If no clocks can be obtained, the ops are permanently rejected (unrecoverable).
6. A transient download failure must **not** mark ops rejected (they retry next cycle).
7. Ops exceeding 3 attempts are permanently rejected to break livelock.

### 5.5 The stale-cursor fence ("state replacement required")

If the upload's `lastKnownServerSeq` is below the newest accepted SYNC_IMPORT/BACKUP_IMPORT
`serverSeq`, the server rejects **all** ops in the batch with
`errorCode: 'INTERNAL_ERROR'` and
`error: 'Download the latest full-state replacement before retrying'`
(`sync.service.ts:271-283`, `sync.types.ts:344-354`). The client intentionally treats
`INTERNAL_ERROR` as transient: ops stay pending, and the next download fetches the full-state
op, after which the retried upload succeeds. A new client must reproduce that ordering
(download before retry) rather than treating `INTERNAL_ERROR` as terminal.

---

## 6. Download flow

### 6.1 Client algorithm (`src/app/op-log/sync/operation-log-download.service.ts`)

Under the `DOWNLOAD` lock:

1. `sinceSeq = forceFromSeq0 ? 0 : getLastServerSeq()`;
   `excludeClient = local clientId` (unless doing a raw rebuild, which passes none so it
   also receives its own ops).
2. Loop `downloadOps(sinceSeq, excludeClient, 500)` while `hasMore`:
   - Capture `snapshotVectorClock` from the first response that carries it.
   - **Gap** (`gapDetected`): allowed **once** per run. Reset `sinceSeq = 0`, discard
     accumulated ops/clocks/snapshot metadata, disable the re-delivery filter, drop the
     resume checkpoint, re-fetch the encryption key (a gap usually means the server was
     wiped), `continue` (`:468-515`; `planDownloadGapReset`).
   - Empty page with `hasMore` → hard failure (never accept a partial download).
   - `serverTime` → clock-drift check (§6.3).
   - Filter out ops whose id is in the local applied-id set. For a rejected-ops retry
     (`isReDeliveryRetry`) also drop ops `<= deliveredUpToSeq` that the local vector clock
     already covers (`:48-62`, `:558-570`).
   - Assert inbound encryption when SuperSync config expects encryption; decrypt if any op
     is encrypted; no key → `DecryptNoPasswordError` (drives the password dialog).
   - Append to the result list; advance `sinceSeq = last serverSeq of page`; refuse a
     non-progressing cursor with `hasMore`.
   - Bounds: stop at `MAX_DOWNLOAD_OPS_IN_MEMORY = 50 000` ops or
     `MAX_DOWNLOAD_ITERATIONS = 1000` pages, returning the applied prefix with a
     checkpoint cursor (`latestServerSeq = sinceSeq`); a forced full-history download
     instead fails (`:710-731`, `operation-log.const.ts:178-185`).
3. Return `{ newOps, latestServerSeq, needsFullStateUpload, snapshotVectorClock?, allOpClocks?, serverHasOnlyUnencryptedData?, providerMode }`.
4. The caller stores/applies the ops and persists `lastServerSeq` **only afterwards**
   (`operation-log-sync.service.ts:1315-1336`).

### 6.2 Applying downloaded ops (`RemoteOpsProcessingService.processRemoteOps`)

`src/app/op-log/sync/remote-ops-processing.service.ts:109-545`:

1. **Schema gate per op**, in order: below min version → block; newer than local → block;
   unknown `opType`/`syncImportReason` → block; migration throw → block. A block stops the
   batch at that op; the prefix is processed, the suffix is neither stored nor applied, and
   the cursor must NOT advance past it (re-downloaded after an app update). Migrated-to-null
   ops are intentionally dropped and do not block.
2. **SYNC_IMPORT filter:** ops invalidated by the newest full-state op are discarded
   (§7.4 table). Filtering import can be local-unsynced (`isLocalUnsyncedImport`) which
   triggers the import-conflict dialog path.
3. **Full-state op present?** → no conflict detection; take `UPLOAD` then `OPERATION_LOG`
   locks; capture a local recovery point (`backupService.captureRecoveryPointIfMeaningful('REMOTE_IMPORT')`);
   apply all ops (full-state replaces state; later ops in the same batch apply on top);
   validate state (`:291-407`).
4. Otherwise: flush writes, take `OPERATION_LOG` lock, build the per-entity frontier from
   retained ops after the local snapshot, and detect conflicts per remote op.
5. Conflicts → `autoResolveConflictsLWW` (with non-conflicting ops piggybacked so
   dependency ordering holds); no conflicts → apply directly; then Checkpoint D validation
   (repair on failure, may mint a REPAIR op).

### 6.3 Clock drift

`serverTime` vs local `Date.now()`, threshold **5 min** (`CLOCK_DRIFT_THRESHOLD_MS`). If
exceeded, retry once after 1 s (device may have just woken and re-synced its clock); if
still off, warn in the log and show a one-per-session snack (`:909-954`). Nothing else
depends on `serverTime`; do not correct clocks with it.

### 6.4 Fresh-client bootstrap (checkpoint/snapshot sequence)

There is **no server-side state handoff on `/ops`**. Bootstrapping a new device is:

1. First download from `sinceSeq = 0`, `excludeClient` absent or own id.
2. The server fast-forwards to the newest causal full-state op and returns it as a normal
   op whose payload is the entire state (`operation-download.service.ts:188-203`), plus
   `snapshotVectorClock`.
3. The client applies that full-state op (`[SP_ALL] Load(import) all data` →
   `loadAllData` reducer), then the remaining ops in `serverSeq` order.
4. A brand-new client with no history shows a confirmation before accepting remote data
   (`operation-log-sync.service.ts:935-982`); if it has meaningful local data it raises the
   local-vs-remote conflict dialog instead (`LocalDataConflictError`).

`restore-points` / `restore/:seq` are a separate, E2EE-unusable path (§3.6–3.7). File-based
providers (Dropbox/WebDAV) have a real `snapshotState` channel; SuperSync does not
(`provider-types.ts:147-149` — `snapshotState?: never`).

Gap-on-empty-server (server migration): `gapDetected` + empty result + `latestSeq === 0`
⇒ `needsFullStateUpload`, and the client mints a `SYNC_IMPORT` (`reason: 'migration'`,
`syncImportReason: 'SERVER_MIGRATION'`) via the snapshot endpoint
(`download-planning.ts:52-100`, `operation-log-sync.service.ts:672-713`,
`server-migration.service.ts`). Same for an empty server when the client `hasSyncedOps()`.

---

## 7. Vector clocks

### 7.1 Shape and size

`{ [clientId]: counter }`, counters are non-negative integers. `MAX_VECTOR_CLOCK_SIZE = 20`
(`packages/sync-core/src/vector-clock.ts:41-48`). Server ingress also rejects a clock with
> 50 entries (2.5×20) and strips entries with empty/>255-char keys or non-integer / negative
/ >100 000 000 counters (`sync.types.ts:176-233`).

### 7.2 Increment rules (per user intent)

| Event | Clock |
| --- | --- |
| Local user intent captured as one op | `increment(currentGlobalClock, ownClientId)` — exactly +1 for own entry, all other entries unchanged (`operation-log.effects.ts:313-318`, `core/util/vector-clock.ts:150-197`). One user intent = one op = one increment. |
| Applying downloaded ops | `globalClock = merge(globalClock, op.vectorClock)` per op (pointwise max) (`operation-log-store.service.ts:130-171`) |
| Full-state op applied | clock **collapses** to `{ [importAuthor]: counterAtImport }` plus own counter (max of pre-import own counter and the import's own-client counter if present). This deliberately discards knowledge of pre-import work (`operation-log-store.service.ts:134-157`). |
| LWW local-win op | `increment(merge(all conflicting clocks + entity clocks + snapshotVectorClock + existingClock), ownClientId)` (`lww-update-op.util.ts:141-150`, `rejected-ops-handler.service.ts:535-565`) |
| REPAIR op | `increment(currentClock, ownClientId)` (`src/app/op-log/validation/repair-operation.service.ts:210`) |

Overflow guard: at `MAX_SAFE_INTEGER - 1000` the client throws and demands a SYNC_IMPORT
reset (`core/util/vector-clock.ts:179-192`). Never reset a counter silently.

Local op creation does **not** prune (explicit comment: client ops carry full clocks;
pruning happens on persist/merge and on the server; `operation-log.effects.ts:313-318`).

### 7.3 Comparison and merge (shared algorithm — must be byte-identical)

`packages/sync-core/src/vector-clock.ts:68-105`:

```
compare(a,b): for each key in union, missing = 0
  aGreater if a[k] > b[k]; bGreater if b[k] > a[k]
  both → CONCURRENT; only a → GREATER_THAN; only b → LESS_THAN; neither → EQUAL
merge(a,b): pointwise max
```

Conflict rules on the server for one entity (`sync/conflict.ts:217-291`):

| Comparison (incoming vs stored) | Result |
| --- | --- |
| `GREATER_THAN` | accept |
| `EQUAL` and same `clientId` | accept (retry) |
| `EQUAL`, different client | conflict `CONFLICT_CONCURRENT` (`equal_different_client`) |
| `CONCURRENT` | conflict `CONFLICT_CONCURRENT` |
| `LESS_THAN` | conflict `CONFLICT_SUPERSEDED` |
| `CONCURRENT` **and both ops are** `[TimeTracking] Sync time spent` | accept (additive deltas commute) |

`existingClock` = the stored latest op's clock for that entity, pruned-to-store. It is
returned in the rejection so the client can build a dominating clock.

### 7.4 Pruning

`limitVectorClockSize(clock, preserveClientIds)` (`vector-clock.ts:115-153`):
- no-op at ≤20 entries;
- sort by counter desc, ties by clientId lexicographic;
- keep preserved ids first (capped at 20), then fill with the highest counters.

Pruning happens:
- **server**, after conflict comparison and before storage: preserve `op.clientId` plus the
  latest causal full-state author when the clock is oversized
  (`operation-upload.service.ts:451-472`, `:277-287`);
- **client**, when persisting a merged clock (preserve own clientId + latest import author)
  (`operation-log-store.service.ts:130-171`, `core/util/vector-clock.ts:306-338`);
- server download `snapshotVectorClock` aggregate: preserve requester + snapshot author
  (`operation-download.service.ts:321-348`).

Never prune before comparing. Full-state ops skip server comparison entirely, which is why
pruning there cannot cause a rejection loop (comment at `operation-upload.service.ts:451-457`).

### 7.5 Full-state ops and clocks

- `SYNC_IMPORT` / `BACKUP_IMPORT` / `REPAIR` skip server conflict detection
  (`conflict.ts:71-78`).
- A `BACKUP_IMPORT` deliberately uses a **fresh** clock `{ clientId: 1 }`
  (`operation-log-architecture.md:1120-1125`, `operation-upload.service.ts:560-571`); the
  server therefore persists `latestFullStateVectorClock` = aggregate of *prior history ∪
  op clock*, unpruned, so downloaders that reset to the bare op clock don't immediately go
  CONCURRENT against surviving pre-import rows.
- Receivers filter concurrent/older ops against the import (`classifyOpAgainstSyncImport`,
  `packages/sync-core/src/sync-import-filter.ts:31-67`):
  keep if op clock `GREATER_THAN` import, or `EQUAL`, or (CONCURRENT and same author with
  a higher own counter than the import), or (CONCURRENT, different author, but op knows the
  import author's counter ≥ import counter). Everything else is discarded (`concurrent` /
  `less-than`).
- `repairBaseServerSeq` on a REPAIR is the server cursor the repaired state includes; the
  server accepts it only when it equals the current `lastSeq` (`REPAIR_STALE` otherwise).
  `CAUSAL_FULL_STATE_OPERATION_WHERE` treats `REPAIR` without that field as a
  non-authoritative compatibility record (`sync.types.ts:27-32`).

---

## 8. Snapshots & checkpoints

### 8.1 When the client generates a full-state snapshot

| Trigger | Op type / reason | Clean slate |
| --- | --- | --- |
| First sync against an empty/new server while client has state | `SYNC_IMPORT`, reason `migration`, `syncImportReason: SERVER_MIGRATION` | no |
| Explicit "force upload local state" / password change / backup restore | `SYNC_IMPORT`/`BACKUP_IMPORT`, `FORCE_UPLOAD` etc. | yes for BACKUP_IMPORT; SYNC_IMPORT only with `FORCE_UPLOAD`/explicit flag |
| Post-sync validation failure | `REPAIR` + `repairSummary` + `repairBaseServerSeq` | never |
| Enabling/changing encryption | `DELETE /api/sync/data` then snapshot with `reason:'recovery'`, clean slate, encrypted (`snapshot-upload.service.ts:213-310`) | yes |

Compaction is **local only**: it writes the local state cache and prunes local ops; it does
not upload anything (`operation-log-architecture.md` A.4). The server never asks a client
to checkpoint.

### 8.2 Snapshot payload shape

`state` is the whole app state object (not the multi-entity envelope), encrypted as a
single AES-GCM string when E2EE is on. The server stores it as the payload of one
`ALL`-entity full-state op and (only if plaintext) also as the cached restore blob.

To **bootstrap** a fresh client the server returns that op through `GET /ops` (§6.4); the
client's states are therefore always built by replaying ops, never by a side channel.

### 8.3 `capabilities.causalRepairSnapshots`

- Server v19.2.0 always sends `true` (`sync.routes.ts:185`).
- Client records it per download response and exposes
  `supportsCausalRepairSnapshots()` (`super-sync.ts:332-339`).
- If not `true`, a REPAIR snapshot is **not uploaded**: the upload path returns
  `accepted:false, errorCode:'REPAIR_CAUSALITY_UNSUPPORTED'`, and the rejection handler
  throws ("configured sync server must be upgraded") rather than dropping the repair
  (`operation-log-upload.service.ts:888-898`, `rejected-ops-handler.service.ts:191-195`).

### 8.4 Checkpoints (client side)

The client's checkpoint is its local **state cache**: `{ state, lastAppliedOpSeq,
vectorClock, compactedAt, schemaVersion, snapshotEntityKeys }`
(`operation-log-store.service.ts:186-198`). Invariants a new client must copy:

- The op **cursor** (`lastServerSeq`) advances only after the ops are durably stored and
  applied. On a blocked op, on a kept decrypt prefix, or on a failed apply, the cursor stays
  behind so the batch is re-downloaded.
- `snapshotEntityKeys` distinguishes "entity existed at checkpoint time" from "new entity"
  when choosing the baseline clock for conflict detection (`vector-clock.service.ts:132-152`).
- A state cache whose `vectorClock` looks like a last-synced baseline is **not** exact:
  it can include unsynced local ops (documented approximation,
  `vector-clock.service.ts:111-130`).

---

## 9. Replay determinism

### 9.1 Ordering guarantees

- Server assigns `serverSeq` monotonically per user at insert time (single `lastSeq`
  allocator; concurrent transactions serialize on that row, `operation-upload.service.ts:433-449`,
  `sync.service.ts:218-283`).
- Downloads are strictly ascending `serverSeq`; the client applies in received order and
  never re-sorts by timestamp.
- Upload order within one intent batch is local capture order; a child never precedes its
  parent because reducers produce parents first.
- Within a batch, a full-state op replaces state and **later ops in the same batch apply on
  top of it** (`remote-ops-processing.service.ts:297-407`).
- Crash safety: ops are appended with `pendingApply`, dispatched in one bulk action, then
  marked applied; failures are marked failed and state is validated/REPAIRed
  (`remote-ops-processing.service.ts:608-740`, `packages/sync-core/src/replay-coordinator.ts`).

### 9.2 How an op becomes a reducer call

`convertOpToAction` (`src/app/op-log/apply/operation-converter.util.ts:289-431`):

- `SYNC_IMPORT`/`BACKUP_IMPORT`/`REPAIR` → synthetic action type `[SP_ALL] Load(import) all data`
  with `{ appDataComplete: payload }`.
- otherwise: `actionType` (after alias map) + `actionPayload`, plus
  `meta: { isPersistent: true, isRemote: true, entityType, entityId, entityIds, opType,
  lwwUpdateMode?, projectMoveFootprint?, lwwShadowedFields? }`.
- `isRemote: true` is what stops effects from re-firing (replayed/remote ops must not
  re-trigger effects).
- LWW adapter/array ops force `actionPayload.id = op.entityId` (canonical id wins over a
  mismatched payload id); singleton LWW strips `id`; `clearedFields` are re-applied as
  `undefined` keys (`:344-395`).
- Legacy replay fixes are part of determinism: missing `today`/`doneOn` are derived from
  the op timestamp (`:88-197`); malformed `parentTagIds` is stripped (`:211-231`);
  malformed task-time payloads throw (`:239-265`).

### 9.3 Which reducers/entities are touched

Exactly one logical entity (or the declared multi-entity set) per op, addressed by
`entityType`/`entityId` and the registry's storage pattern (§4.3). LWW behaviour by
pattern (`operation-log-architecture.md:1244-1256`):

| Pattern | Entities | LWW application |
| --- | --- | --- |
| adapter | TASK, PROJECT, TAG, NOTE, SIMPLE_COUNTER, TASK_REPEAT_CFG, METRIC, ISSUE_PROVIDER, SECTION | `updateOne` / `addOne` on that entity, plus relationship repair (`project.taskIds`, `tag.taskIds`, `TODAY_TAG.taskIds`, `parent.subTaskIds`) |
| array | BOARD, REMINDER, PLUGIN_USER_DATA, PLUGIN_METADATA | items are found by `payload.id` in the feature array and `updateOne`/`addOne`'d (this path was fixed for arrays in #9526); a `patch` for an absent item is ignored, a `replace` recreates it |
| singleton | GLOBAL_CONFIG, TIME_TRACKING, MENU_TREE, WORK_CONTEXT | replace the whole feature slice from `actionPayload`; a `patch` is a shallow merge |
| map | PLANNER | **unsupported**: the reducer logs/asserts "Unsupported storage pattern" and returns state unchanged, because a PLANNER LWW payload would be a spread `string[]` day (numeric keys, no real `id` addressing) — a producer-side payload redesign is pending upstream (`lww-update.meta-reducer.ts:752-757`). Planner intents must replay as their original actions, never as synthetic LWW snapshots |

### 9.4 LWW conflict rules

1. **Archive wins** regardless of timestamps: if either side contains
   `[Task Shared] moveToArchive`, the archive side wins and a merged-clock archive op is
   emitted (`operation-log-architecture.md:1177-1231`).
2. **Timestamp LWW**: compare the max `timestamp` per side; newer wins. Tie → deterministic
   order of the clientIds of the max-timestamp ops (`:1092-1098`).
3. **Local wins** → reject both sides' conflicting ops, emit one `[<ENTITY>] LWW Update`
   (`replace` by default) carrying current state, merged clocks + own increment, and the
   **preserved max local timestamp** (not `Date.now()`) (`:1105-1118`).
4. **Field-level patches** for overlapping TASK/PROJECT/TAG/SIMPLE_COUNTER updates whose
   payloads are `{ id, changes }`: per-field winner by `(timestamp, clientId)`; a patch
   omits untouched fields and lists clears in `clearedFields`
   (`docs/sync-and-op-log/lww-field-level-resolution.md:405-463`,
   `src/app/op-log/sync/conflict-field-patch.util.ts`).
5. **Time deltas** (`[TimeTracking] Sync time spent`) are additive: they commute, are never
   folded into a replace snapshot, and are rebased/recovered rather than replayed twice
   (`lww-field-level-resolution.md:311-383`, `operation-log-architecture.md:1135-1175`).
6. **Rejected-op replay** (superseded local ops): readable single-entity edits re-emit as a
   `patch` of the fields they wrote; deletes re-create; archives re-emit archive ops;
   SECTION/reorder intents are replayed rather than snapshot-replaced (§9.5).

### 9.5 Subtle upstream behaviour a new client must not "simplify"

- **`TODAY` tag is virtual.** `'TODAY'` is never written into `task.tagIds`; Today
  membership is derived from `dueDay`/`dueWithTime`, and `TODAY_TAG.taskIds` is only the
  manual order. Any client that persists Today membership into `tagIds` diverges.
- **`dueDay` and `dueWithTime` are mutually exclusive** (same for
  `deadlineDay`/`deadlineWithTime`). Readers check the `*WithTime` form first; setting one
  clears the other. LWW patches and replay fixes must preserve that invariant.
- **`PLANNER` `entityId` is not a row key.** `Upsert Planner Day` / `Move In List` use the
  **day** (`YYYY-MM-DD`) as entityId, while `Transfer Task` / `Move Before Task` /
  `Plan Task for Day` use a **task id** (`src/app/features/planner/store/planner.actions.ts:12-84`).
  `PLANNER` is a map entity keyed by day, so conflict detection on `PLANNER:<taskId>` does
  not correspond to a stored object. Preserve action semantics; do not rewrite planner ops
  as generic entity snapshots.
- **SECTION membership is ordered state, not a field set.** `Section { contextId,
  contextType, taskIds }` (`src/app/features/section/section.model.ts:4-10`). A
  move/remove/reorder is a write to `section.taskIds` plus the work-context list; replacing
  it with a generic entity snapshot can put a task in two containers or lose ordering.
  Upstream replays the original SECTION intent instead of an LWW snapshot
  (`docs/sync-and-op-log/section-conflict-replay.md:22-63`).
- **Content reorder lists** (`note.todayOrder`, `project.noteIds`, `simpleCounter.ids`,
  `boardCfgs`, `issueProvider.ids`) have the same property; two competing orders are
  resolved by "the order that reached the server first wins", not by timestamps
  (`section-conflict-replay.md:110-120`).
- **Archive resurrection** has two defences (archive-wins LWW, plus a bulk pre-scan that
  skips LWW updates targeting entities archived earlier in the same batch). Reimplementing
  only one of them resurrects archived tasks in 3-client scenarios
  (`operation-log-architecture.md:1192-1216`).
- **Task-time crossing** (`syncTimeSpent` vs an edit) intentionally does **not** force the
  REBASE dialog: the applied remote row is the causal proof and pending deltas are rebased
  in place (`operation-log-architecture.md:1135-1157`).
- **REBASE/by-timestamp subtleties are deliberately unresolved in places** — the upstream
  docs list open residuals ("a newer concurrent remote edit arriving in a LATER sync beats
  the restore update by whole-op LWW", `operation-log-architecture.md:1190`; fuzz-visible
  merge residuals in `lww-field-level-resolution.md`). Treat these as known upstream
  divergences, not as behaviour to copy.

---

## 10. WebSocket notifications

### 10.1 Connection

- URL: `ws(s)://<baseUrl with http(s)→ws(s)>/api/sync/ws?token=<urlencoded JWT>&clientId=<urlencoded clientId>[&appVersion=<semver>]`
  (`src/app/op-log/sync/super-sync-websocket.service.ts:171-178`).
- The JWT goes in the **query string**, not a header. Server validates it at upgrade
  (`packages/super-sync-server/src/sync/websocket.routes.ts:90-151`).
- Server close codes: `4001` missing token / invalid clientId, `4003` invalid or revoked
  token, `4008` too many connections (10 per user) or reconnect cooldown, `4009` replaced by
  a newer socket with the same clientId, `1011` internal error.
- Max frame size 8 KiB (`server.ts:461-462`).

### 10.2 Messages

Server → client (`websocket-connection.service.ts:260-278`, `:394-422`, `:601-611`):

```json
{ "type": "connected", "userId": 12, "timestamp": 1730000000000 }
{ "type": "new_ops", "latestSeq": 431, "timestamp": 1730000000000 }
{ "type": "ping" }
{ "type": "presence_state", "payload": "<opaque>", "ordinal": 7, "producerConnected": true }
{ "type": "presence_cmd", "payload": "<opaque>" }
```

Client → server: `{ "type": "pong" }`, and optional presence frames. Nothing else.

### 10.3 Client behaviour on `new_ops`

(`src/app/op-log/sync/ws-triggered-download.service.ts`)

1. Take the max `latestSeq` across notifications, debounce 500 ms.
2. Skip if a sync is in progress / an encryption operation is running / another cycle owns
   the guard; retry the drain every 250 ms instead (never drop the notification).
3. If local cursor ≥ `latestSeq`, do nothing.
4. Otherwise run the normal `downloadRemoteOps` path (not a special WS path), with
   `keepDecryptedPrefix: true`; if LWW local-win ops were created, immediately re-upload.
5. Retry download up to 3 times (1 s, 2 s, 4 s), then set sync status ERROR.
6. Auth failure / `CLIENT_UPDATE_REQUIRED` stops the WS client instead of retrying.

### 10.4 Reconnect / heartbeat

- Client heartbeat: any frame resets a 45 s timer (must exceed the server's 30 s ping);
  timeout closes with `4000` (`super-sync-websocket.service.ts:41-42`, `:362-385`).
- Server pings every 30 s and closes after 10 s without pong; a socket that answers pings
  also refreshes its device row (`websocket-connection.service.ts:90-93`, `:576-611`).
- Reconnect: exponential backoff `min(1000 * 2^(n-1), 60 000)` ms with ±10 % jitter, max 50
  attempts (`:315-353`). No reconnect after an intentional disconnect, `4003`, `4008`, or
  `4009` (another tab owns the clientId; the next sync trigger reconnects).
- The WS is started after a successful SuperSync sync cycle (`sync-wrapper.service.ts:462-498`).
- **Correctness must not depend on the WS.** Polling/interval sync is the source of truth;
  a missed notification is caught by the next scheduled sync (default `syncInterval` = 60 s,
  `src/app/features/config/default-global-config.const.ts:249-250`; `isManualSyncOnly`
  disables automatic cycles).

---

## 11. Persistence (client-side)

### 11.1 What is stored

IndexedDB database `SUP_OPS` (`src/app/op-log/persistence/op-log-db-schema.ts:55-82`):

| Store | Key | Contents |
| --- | --- | --- |
| `ops` | auto-increment `seq` | `{ seq, op, appliedAt, source:'local'|'remote', syncedAt?, rejectedAt?, reducerRejectedAt?, applicationStatus?, retryCount? }`; indexes on `op.id` (unique), `syncedAt`, `(source, applicationStatus)` |
| `state_cache` | `id` | last applied state + `lastAppliedOpSeq` + `vectorClock` + `compactedAt` + `snapshotEntityKeys` (the local checkpoint) |
| `vector_clock` | singleton | authoritative current global clock |
| `client_id` | singleton | this device's clientId |
| `import_backup` | `id` | undo/recovery ring for destructive replacements |
| `archive_young` / `archive_old` | `id` | archived tasks |
| `meta` | key | e.g. latest full-state op refs |

Plus, outside IndexedDB:

- **Server cursor**: `localStorage['super_sync_last_server_seq_<hash>']` where `hash` is a
  32-bit djb2-ish hash of `` `${baseUrl}|${accessToken}` `` (`super-sync.ts:47`, `:824-831`).
  Keying per token means a token rotation migrates the cursor; a new client only needs some
  per-account/per-server cursor slot, but must preserve it across token rotation (§1.5).
- **Sync provider private config** (accessToken, baseUrl, encryptKey, isEncryptionEnabled,
  refreshToken/expiresAt, deviceName, presence opt-in): the credential store, never part of
  synced state (`SuperSyncPrivateCfg`, §1.1).

### 11.2 What is *not* stored remotely

No state, no key, no device name. `globalConfig.sync.*` may travel inside payloads, but
`isEncryptionEnabled` in synced state is non-authoritative — hydration re-applies the
device's local value (`docs/sync-and-op-log/supersync-encryption-architecture.md:233-248`).

### 11.3 At-rest encryption status — is E2EE actually used by default?

Yes, in this version pair it is effectively **mandatory end-to-end**:

- SuperSync declares `isEncryptionMandatory = true` (`super-sync.ts:162-164`).
- The client refuses to upload ops (or a snapshot) while SuperSync is configured but has no
  key, and refuses to upload a plaintext snapshot (`operation-log-upload.service.ts:237-256`,
  `snapshot-upload.service.ts:250-262`).
- The server rejects any op/snapshot whose `isPayloadEncrypted !== true` or whose payload
  is not ciphertext-shaped: `400 E2EE_REQUIRED`
  (`packages/super-sync-server/src/sync/sync.routes.payload.ts:47-73`,
  `sync.routes.ops-handler.ts:125-135`, `sync.routes.snapshot-handler.ts:118-130`).
- Encryption must be enabled once per account through the app's setup flow (enable →
  `DELETE /api/sync/data` → upload encrypted snapshot); until then auto-sync reports
  "not in sync" and downloads still work (`sync-wrapper.service.ts:696-748`).
- The key is a **user password**, not a generated key: Argon2id(password, salt) → AES-256-GCM.
  Losing it means the server data is unrecoverable (server cannot decrypt; server-side
  restore is disabled).
- "At rest" locally: payloads sit decrypted in the local state cache/IndexedDB; the
  password/key lives in the credential store. There is no local DB encryption requirement in
  upstream beyond that.

**Crypto wire format (must be reproduced exactly to read existing data):**

```
ciphertext bytes = [salt(16)][iv(12)][AES-256-GCM ciphertext || tag(16)]   (Argon2id format)
transport        = canonical standard base64 of the above, no whitespace
legacy format    = [iv(12)][ciphertext||tag]  (PBKDF2 key, accepted on read only)
```

- Argon2id params: `parallelism=1, iterations=3, memorySize=65536 KiB (64 MiB), hashLength=32`
  (`packages/sync-core/src/encryption/argon2.ts:9-13`).
- IV random 12 bytes per encryption; salt random 16 bytes per session/key and embedded in
  every ciphertext (`packages/sync-core/src/encryption.ts:13-43`, `:102-113`).
- Decrypt: read salt, derive key, AES-GCM verify; on auth failure fall back to legacy
  PBKDF2 (`:156-184`). Minimum valid ciphertext 28 bytes (`transport-shape.ts:24-38`).
- The encrypted value replaces `payload` **only**; every other op field stays plaintext.
- After decrypt, the client verifies the authenticated payload against the plaintext
  envelope (entity id / opType / move footprint) and fails closed on mismatch
  (`src/app/op-log/sync/verify-decrypted-op-integrity.ts`, GHSA-8pxh-mgc7-gp3g).

---

## 12. Implementation checklist for a new client

Minimum for wire compatibility with the server:

1. Emit `schemaVersion: 4`; block ops > 4 or unknown vocab and keep the cursor behind them.
2. UUIDv7 op ids; `clientId` matching `^[A-Za-z0-9_-]{1,255}$`, stable per install.
3. One op per user intent, clock = merge + own increment; merge remote clocks on apply;
   never prune before comparing; cap 20 with the documented preserve set.
4. Send `Authorization: Bearer`, `Content-Type`, optional `Content-Encoding: gzip`;
   append `appVersion` as a query param.
5. Encrypt payloads (Argon2id+AES-GCM, base64, salt|iv|ct) and set
   `isPayloadEncrypted: true` — the server rejects plaintext.
6. `POST /ops` in ≤25-op batches with `lastKnownServerSeq` + deterministic `requestId`;
   process `newOps` before resolving rejections; persist the cursor only after applying.
7. `GET /ops?sinceSeq&limit=500&excludeClient=...`; loop on `hasMore`; handle
   `gapDetected` (one reset to 0), `snapshotVectorClock`, `serverTime` drift warning.
8. Recover `accepted:false` by downloading/merging clocks and re-emitting a dominating op;
   treat `INTERNAL_ERROR`/`STORAGE_QUOTA_EXCEEDED` as retryable, `REPAIR_STALE` as
   "download then rebase", `DUPLICATE_OPERATION` as success, everything else as terminal.
9. Upload full state via `/snapshot` with `opId`, `snapshotOpType`, `repairBaseServerSeq`
   (REPAIR only when `capabilities.causalRepairSnapshots`), `isCleanSlate` only where
   upstream does.
10. Optional WS for low latency; never required for correctness.

To coexist on an account with SP clients, additionally reproduce SP's action vocabulary,
payload shapes and reducer semantics (§4.4, §9). That is the larger half of the work; the
server will not catch semantic mistakes.

---

## Source index (authoritative files)

- Wire contract: `packages/shared-schema/src/supersync-http-contract.ts`
- Op types/SDK types: `packages/sync-core/src/operation.types.ts`,
  `packages/sync-providers/src/provider-types.ts`
- HTTP client: `packages/sync-providers/src/super-sync/super-sync.ts`,
  `request-id.ts`, `packages/sync-providers/src/http/native-http-retry.ts`
- Clocks: `packages/sync-core/src/vector-clock.ts`, `src/app/core/util/vector-clock.ts`,
  `src/app/op-log/sync/vector-clock.service.ts`
- E2EE: `packages/sync-core/src/encryption.ts`, `encryption/argon2.ts`,
  `encryption/transport-shape.ts`, `src/app/op-log/sync/operation-encryption.service.ts`
- Client sync pipeline: `src/app/op-log/sync/operation-log-{upload,download,sync}.service.ts`,
  `remote-ops-processing.service.ts`, `rejected-ops-handler.service.ts`,
  `lww-update-op.util.ts`
- Replay: `src/app/op-log/apply/operation-applier.service.ts`,
  `operation-converter.util.ts`, `packages/sync-core/src/replay-coordinator.ts`
- Server routes: `packages/super-sync-server/src/sync/sync.routes.ts`,
  `sync.routes.ops-handler.ts`, `sync.routes.snapshot-handler.ts`
- Server logic: `sync/sync.service.ts`, `sync/conflict.ts`,
  `sync/services/operation-{upload,download}.service.ts`,
  `sync/services/request-deduplication.service.ts`, `sync/services/rate-limit.service.ts`,
  `sync/websocket.routes.ts`, `sync/services/websocket-connection.service.ts`
- Server auth: `packages/super-sync-server/src/{api,auth,middleware}.ts`
