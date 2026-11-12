# Framework Options for superprod

> Options for scaffolding the new **superprod** client. Target: Android + Web, self-hosted SuperSync compatible, 100% feature parity with Super Productivity. App name: `superprod`, package ID: `com.dwprod.superprod`.

> **DECISION (made):** **Option C — TypeScript + Capacitor**, with the **UI layer deferred**. The engine is scaffolded first (op log, vector clocks, SuperSync HTTP client, magic-link auth, sync engine); the renderer is chosen once the engine is proven against a real self-hosted server. See "Status" at the bottom.

---

## Constraints discovered in the source (read this before the options)

These are facts from the upstream code, not preferences. They prune the list more than taste does.

1. **The plugin system is HTML + JS in iframes.** A plugin is `manifest.json` + `index.html` + optional `plugin.js`, talking to the host through `window.PluginAPI` (`packages/plugin-api`, `docs/plugin-development.md`; the official UI boilerplate is SolidJS). Plugin parity therefore requires a JS runtime **with DOM/iframe hosting**. Flutter or Kotlin-Compose must embed a WebView for plugins anyway — at which point they lose the "no web view" advantage and still had to rewrite everything else.
2. **The sync core and wire schema are TypeScript.** `packages/sync-core`, `packages/sync-providers`, `packages/shared-schema` (entity types, HTTP contract) are plain TS with no platform dependency. A TS stack reuses them directly; every other stack re-implements the protocol and risks silent divergence (vector clocks, conflict resolution, E2E encryption).
3. **E2E encryption depends on WebCrypto** (Argon2id + AES-256-GCM, `packages/sync-core`). In-browser and Capacitor-WebView get it natively. React Native needs a shim/native crypto module; Flutter/KMP need a port.
4. **Self-hosted servers are often plain HTTP on a LAN.** Upstream Android sets `android:usesCleartextTraffic="true"`. Any stack we pick must ship a network-security-config that allows cleartext to user-entered hosts (or the self-hosted story breaks on day one).
5. **The Android surface is specific and native-heavy:** exact alarms (`SCHEDULE_EXACT_ALARM`), two `specialUse` foreground services (`time_tracking`, `focus_timer`), a RemoteViews home-screen widget with explicit-component PendingIntents, a boot receiver, notification-action receiver, share target (`ACTION_SEND text/*`), URL-scheme actions (`create-task`, `complete-task`, `add-task`, `today`, `inbox`), launcher shortcuts, and a native WebDAV HTTP path to bypass WebView CORS.
6. **Existing Angular UI is not reusable.** Upstream styling is Angular Material + heavy custom SCSS. The sleek UI is a from-scratch effort in every option; what we reuse is the *engine*, not the view layer.

**Consequence:** option C (TS + Capacitor) and option A (React Native + Expo) are the only contenders that keep the TS engine and can host iframe plugins. B and D are only worth it if a specific native feel outweighs a full protocol re-implementation.

---

## Option A: React Native + Expo (with Web via React Native Web)

**Stack:** TypeScript, React, Expo (React Native), React Native Web for the web target.

**Why it fits:**
- Single TypeScript/React codebase for Android + Web.
- Expo handles Android build, manifest, permissions, notifications, app lifecycle, widgets (via modules), asset management, OTA updates.
- React Native Web renders the same components to the DOM for the web target — shared UI code.
- Huge ecosystem: vector icons, markdown editing, calendar views, charts (for metrics/heatmap), gestures/drag-and-drop, provider libs for OAuth (Google/Outlook calendar, issue providers).
- The original Super Productivity is already TypeScript, so the data model, sync logic, and a lot of business logic can be ported directly with minimal rewrites.
- SuperSync client is framework-agnostic TS — drop it in as-is.

**Where it's strong:**
- Touch UI, gestures (swipe to complete, long-press context menu), mobile-first feel.
- Widget support on Android via Expo modules / custom native modules when needed.
- Background tasks, exact alarms, foreground service — possible via Expo Config Plugins + native modules or EAS Build custom native code.
- Web target shares virtually all UI and business logic.

**Tradeoffs / watchouts:**
- React Native Web parity is good but not perfect — some DOM-specific features (exact keyboard shortcut registration at OS level, file dialogs, drag-and-drop nuances) need web-specific branches.
- Android widgets are not first-class in React Native; you'd write a small native module (or use a library) for the app widget.
- Foreground service / exact alarm require Android permission config and native module work (doable with Expo, just not zero-native).
- Browser global keyboard shortcuts (registering a hotkey that works when the app is not focused) need a web-specific path (no OS-level hotkey from a website — you get in-app shortcuts only, plus a PWA/installable option).
- Drag-and-drop timeline (planner/schedule) is very doable with react-native-gesture-handler + a custom layout, but needs careful engineering.

**Self-hosted sync fit:** Excellent. The SuperSync client (`@sp/sync-core`, op-log, encryption, vector clocks) is plain TS — no platform dependency. The HTTP/WebSocket layer is standard `fetch` + `WebSocket`, both available everywhere. E2E encryption uses WebCrypto (works in RN via `expo-web-apis`/shim or `@noble/ciphers` fallback which `sync-core` already has).

**UI pathway:** Build a fresh component library from scratch or use a base UI kit (e.g. React Native Paper, Tamagui, Gluestack, or your own). For a "sleek" feel you'd want custom components regardless.

**Verdict:** Strongest single-codebase option for Android + Web with native mobile feel. Most aligned with "sleek mobile client that still does everything."

---

## Option B: Flutter

**Stack:** Dart, Flutter, one codebase to Android + Web (and iOS + desktop if wanted later).

**Why it fits:**
- Truly single codebase across Android and Web (and more) with consistent rendering.
- Excellent widget system — you have full control over the "sleek" UI; no web DOM quirks.
- Strong tooling for animations, gestures, drag-and-drop, custom layouts (timeline/planner).
- Good ecosystem for charts, markdown, OAuth, calendar, notifications.
- Web target compiles to WASM/JS and renders Skia-based UI — visually consistent with Android.

**Where it's strong:**
- Pixel-consistent UI across platforms, full control over look and feel.
- Performance on mobile is great; web is decent (SEO not relevant for this app).
- Single language, strong typing, good refactorability.

**Tradeoffs / watchouts:**
- The original app's logic is TypeScript — porting to Dart is a rewrite, not a reuse. Business logic, sync, encryption all need a Dart port or you keep a TS core compiled to a shared module (extra complexity).
- Flutter Web uses its own rendering (not DOM), so integration points that expect standard web APIs (copy/paste nuance, font rendering, accessibility tree expectations) behave differently from a "normal" web app. Some users care about that for a productivity web app.
- Plugin ecosystem for Android-specific features (exact alarm, foreground service, widget, boot receiver) exists but you'll still do per-platform work for the deepest native features (widget especially).
- No direct reuse of the existing TypeScript sync/encryption/core code — you'd re-implement or compile a TS→WASM boundary.

**Self-hosted sync fit:** Good, but you re-implement the client side in Dart (or call into a TS/WASM module). Encryption: you can use `PointyCastle`/`encrypt` or call WebCrypto/WASM. The protocol is simple HTTP+WS, easily implemented in Dart.

**Verdict:** Best if visual consistency across Android + Web is the top priority and you're OK with rewriting logic in Dart. Less reuse of the existing TS codebase than Option A.

---

## Option C: SolidJS / Vanilla TypeScript Web App + Capacitor for Android

**Stack:** TypeScript, SolidJS (or Preact/Vanilla TS), Capacitor for Android wrapper.

**Why it fits:**
- The original Super Productivity is an Angular/TS web app wrapped by Capacitor for Android. This option is the same family — web-first app, native shell for Android.
- Maximum reuse: a lot of the existing TS business logic, models, sync core, encryption, op-log, even some UI patterns can be reused or lightly adapted.
- SolidJS is lighter and more granular-reactive than Angular; gives you a clean modern UI layer without the Angular weight.
- Capacitor gives you Android notifications, local notifications, filesystem, app lifecycle, platform plugins — the same surface the original Android client uses.
- Web target is a normal browser app / PWA — full DOM, standard web APIs, installable.

**Where it's strong:**
- Direct lineage to the existing codebase — lowest effort to reach feature parity.
- Web is a first-class browser app (not RN Web or Flutter Web), so web behaviors are standard.
- Capacitor plugins cover most Android native needs.
- JavaScript/TypeScript all the way down — no Dart, no RN Web parity concerns.

**Tradeoffs / watchouts:**
- The original web UI is exactly what you called "looks and feels really bad to use" on mobile. This option gives you the *structural* fit but you still must build a new sleek UI — the advantage is you can reuse logic, not that the UI is already good.
- Capacitor apps are web views — touch feel and animations can be made very good but you're not getting native UI components; you get DOM/HTML/CSS on mobile. For a "sleek" feel you need excellent CSS/animations and careful mobile UX (overscroll, touch targets, gestures).
- Android widget from a Capacitor app: possible but requires native plugin work (you have a web view; the widget is a separate native component that reads your data). Doable, non-trivial.
- Foreground service / exact alarm / boot receiver: Capacitor plugins exist; you may need custom native code for the widget and for exact-alarm-edge-cases on newer Android.
- Deep links / share target: Capacitor + Android intent filters; standard but needs config.

**Self-hosted sync fit:** Excellent — identical to Option A in terms of the TS sync core being a direct drop-in.

**Verdict:** Fastest path to feature parity because of logic reuse; UI is where the work goes. If "sleek" means a clearly better web/mobile UI on top of the same engine, this is efficient. If "sleek" means a genuinely native mobile feel, RN (Option A) has the edge on touch/gestures.

---

## Option D: Kotlin Multiplatform (KMP) + Compose Multiplatform

**Stack:** Kotlin, Compose Multiplatform for UI (Android + Web), shared business logic in Kotlin.

**Why it fits:**
- Shared Kotlin business logic across Android + Web; UI in Compose Multiplatform.
- Android side is genuinely native (not a web view) — best native feel, best widget/notification/foreground-service story on Android.
- Web target via Compose for Web — shared UI code renders to the web.

**Where it's strong:**
- Best Android native integration story: widgets, foreground service, exact alarms, notifications, boot receiver all native.
- Shared business logic is real Kotlin — clean and typed.
- Full control over UI on both platforms.

**Tradeoffs / watchouts:**
- Compose for Web is younger than the mobile side — web parity and web-native expectations (accessibility, copy/paste, keyboard, fonts, PWA) are more work than a standard web app.
- The original logic is TypeScript — porting to Kotlin is a rewrite.
- Smaller ecosystem than RN/Flutter for some integrations (OAuth libs, charts, markdown editors) — all available but more DIY.
- Sync client: re-implement in Kotlin or keep a TS module. HTTP/WS fine in Kotlin; encryption: Kotlin has crypto libs (or use Android Keystore / WebCrypto on web).

**Verdict:** Best Android-native feel + shared logic, but web is the weaker side and it's a full rewrite of the logic. Consider if Android native feel is paramount and web is secondary.

---

## Quick comparison

| Concern | A: React Native + Expo | B: Flutter | C: SolidJS/TS + Capacitor | D: KMP + Compose MP |
|---|---|---|---|---|
| Code reuse from existing TS app | High (logic + sync drop in) | Low (Dart rewrite) | Highest (TS all the way) | Low (Kotlin rewrite) |
| Android feel | Native-ish (RN views) | Native-ish (Skia) | Web view (Capacitor) | Native (real Android views) |
| Web feel | DOM via RN Web | Skia-rendered web | Standard browser/PWA | Compose for Web |
| Widget support (Android) | Needs native module | Needs plugin | Needs native plugin | Native (best) |
| Foreground service / exact alarm | Via Expo + native module | Via plugins | Via Capacitor plugins | Native (best) |
| Touch gestures / swipe feel | Excellent | Excellent | Good with care | Excellent (native) |
| Sync client reuse | Direct (TS) | Reimplement / WASM | Direct (TS) | Reimplement |
| Ecosystem for integrations | Large | Large | Large (web libs) | Moderate |
| Learning curve if team knows TS | Low | Medium (Dart) | Low | Medium–high (Kotlin + Compose) |

---

## Recommendation

Given the constraints above — **TS sync engine reuse, iframe plugins, WebCrypto, cleartext-to-self-hosted-server, and a native-heavy Android surface** — the realistic shortlist is:

1. **Option C — TypeScript app + Capacitor (recommended).** Highest reuse: the sync core, op-log, encryption, models and entity registry drop in nearly unchanged; web is a real browser app/PWA; Android is the same shell model the original already proves works (foreground services, exact alarms, widget, share target, URL scheme). You pay for a new UI either way, but you do **not** re-implement the protocol, and iframe plugins run as-is.
2. **Option A — React Native + Expo.** Best native touch feel and the strongest "sleek mobile" story. Still TS, so the engine ports; but you need a WebView specifically to host plugins, a crypto shim, and native modules for the widget and foreground services. Web via RN-Web is the weakest surface of the four.

Choose **C** if reliability and protocol fidelity matter most (they should — this is people's task data). Choose **A** if the touch-first feel is the deciding factor and you accept extra native-module work.

**B (Flutter)** and **D (KMP + Compose)** are not recommended for this project: both rewrite the sync protocol and still need a WebView for plugins, so they cost the most for the least parity. Keep them only if a genuinely native UI on Android is a hard business requirement and web can be second-class.

**Next step:** pick one. I scaffold it with `packageId = com.dwprod.superprod`, `appName = superprod`, cleartext-capable self-hosted networking, wire the SuperSync-compatible sync layer against a self-hosted server, then work down `PARITY.md`, updating it after each feature.
---

## Status

**Chosen: Option C (TypeScript + Capacitor). UI layer deferred.**

Scaffolded so far (engine only, framework-agnostic shell):

```
package.json / tsconfig.json / vite.config.ts / pnpm-workspace.yaml
capacitor.config.ts            appId com.dwprod.superprod, appName superprod
index.html, src/main.ts        minimal shell: server URL + token + status check
src/core/
  entity-types.ts              ENTITY_TYPES mirrored from shared-schema
  operation.ts                 op types, Operation model, upload validation
  vector-clock.ts              compare/merge/increment/prune/sanitize
  op-log.ts                    Memory + IndexedDB adapters, pending/cursor tracking
src/sync/
  client.ts                    SuperSync HTTP client (ops, snapshot, status,
                               devices, restore points, delete-all)
  engine.ts                    one sync cycle: upload pending, page downloads
  auth.ts                      magic-link login + credential persistence
tests/                         28 tests: vector clocks, op log, client, engine
```

Verified: `pnpm typecheck` clean, `pnpm test` 28/28 passing.

Deliberately not built yet: renderer, E2E encryption, WebSocket live sync,
conflict-resolution UI, alternative sync providers, and everything in
PARITY.md outside §10.

**Not verified in this environment:** the dev server and production build.
The DSH sandbox blocks the child-process spawn that esbuild requires
(`spawn EPERM`), so `pnpm dev` / `pnpm build` need to run outside the sandbox.
`pnpm test` and `pnpm typecheck` were run with escalation and pass.