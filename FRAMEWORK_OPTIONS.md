# Framework Options for superprod

> Options for scaffolding the new **superprod** client. Target: Android + Web, self-hosted SuperSync compatible, 100% feature parity with Super Productivity. App name: `superprod`, package ID: `com.dwprod.superprod`.

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

Given the priorities expressed — **feature parity with a large existing TypeScript codebase, self-hosted SuperSync compatibility, Android + Web, sleek mobile UI, widget + notifications + background support** — the two options worth choosing between are:

1. **React Native + Expo (Option A)** — if "sleek mobile feel" means native-like touch, gestures, and a modern mobile UI across Android and Web from one TS/React codebase, with the existing TS sync/core logic reused directly. This is the best balance of reach, feel, and reuse.

2. **SolidJS / TypeScript web app + Capacitor (Option C)** — if you want the fastest path to feature parity by reusing the most existing logic, and you're ready to invest in a genuinely new sleek UI layer (since the original UI is the part you disliked). Web is a standard PWA/browser app, Android is Capacitor-wrapped.

If Android native feel above all (especially widget/foreground-service/exact-alarm) and you're fine with a weaker web side, **KMP + Compose Multiplatform (Option D)** is the contender. If visual consistency across platforms is paramount and you're fine rewriting logic in Dart, **Flutter (Option B)** is the contender.

Pick one and I'll scaffold it, set `packageId = com.dwprod.superprod`, wire in the SuperSync-compatible sync layer, and start implementing features from the top of PARITY.md, updating PARITY.md after each.
