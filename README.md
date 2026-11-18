# superprod

A fast, local-first Android client for **Super Productivity**, with full
**SuperSync** support. Flutter 3.50 / Dart 3.14.

Same data as the desktop app, same self-hosted sync, feature and UI parity — a
new client, not a fork.

- Package: `com.dwprod.superprod`
- Reference: upstream **v19.2.0** (`original source code/`, read-only, gitignored)
- Design notes and the sync contract: [BLUEPRINT.md](BLUEPRINT.md)
- Feature inventory: [FEATURES.md](FEATURES.md) · status per feature: [PARITY.md](PARITY.md)

## Status

The client is being rebuilt in Flutter. The previous Capacitor/SolidJS client is
preserved on the **`legacy`** branch (tag `v0.4-legacy`) and is not developed
further.

What works today:

- Local-first tasks in SQLite: add, complete, Today, Inbox, projects, drawer.
- Add-task sheet with short syntax, previewed live before the task exists:
  `#tag`, `+project`, `p1`, `1h 30m`, `@tomorrow`, `@monday`, `!deadline`.
- Back gesture unwinds screens instead of closing the app.
- Settings → SuperSync: server URL, token, encryption password, and a
  connection check that names the exact failure.

Not built yet: the sync engine (op-log, E2EE, snapshot import), repeating tasks,
planner, schedule, metrics, reminders, widget. `PARITY.md` is the honest list.

## Building

Requires Flutter 3.50+, JDK 17 and an Android SDK with platform 35+.

```bash
flutter pub get
flutter test
flutter analyze
flutter build apk --release        # build/app/outputs/flutter-apk/app-release.apk
```

Local release builds are signed with a keystore at
`.tooling/android-home/release.keystore` if it exists; CI supplies its own
through secrets. Debug builds are not used in this repo — AGP cannot create its
keystore lock inside a restricted user profile, which fails
`:app:validateSigningDebug` before compiling.

Drift generates `lib/data/db/database.g.dart`; after changing the schema run:

```bash
dart run build_runner build
```

## Releases

| Workflow | Trigger | Output |
|---|---|---|
| `ci.yml` | PR, push to `main` | analyze, tests, release APK build |
| `release.yml` | tag `v*`, or manual with a version | universal APK, GitHub release (prerelease) |
| `release-all-abis.yml` | manual | per-ABI APKs + universal, GitHub release |
| `release-bundle.yml` | manual | `.aab` for Google Play (prerelease) |

Signing comes from repository secrets:

| Secret | Meaning |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 of the release keystore (`base64 -w0 release.keystore`) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

Workflows decode the keystore to `android/app/release.keystore` and write
`android/key.properties`; both are gitignored. Without the secrets the release
build still runs, signed with the debug key, so pull requests stay green.

To cut a release: push a tag, or run **Release APK** manually with a version.

```bash
git tag v0.1.0 && git push origin v0.1.0
```

## SuperSync

The client speaks the same protocol as the official app:

- `/api/sync/ops` upload/download, `/api/sync/snapshot`, `/api/sync/status`,
  `/api/sync/devices`, `/api/sync/restore-points`, `/api/sync/data`
- Operations carry `{ actionPayload, entityChanges }` with upstream action types
- End-to-end encryption: Argon2id (64 MB, 3 iterations) → AES-256-GCM,
  `base64(salt ‖ iv ‖ ciphertext+tag)`

A self-hosted server only accepts the origins listed in its `CORS_ORIGINS` for
browser clients; the Android app is unaffected because it uses native HTTP.

## Repository layout

```
lib/
  app/          shell, theme, navigation
  core/         short-syntax parser, shared helpers
  data/         drift database, repositories, providers
  features/     one folder per screen
  sync/         SuperSync transport (engine lands next)
test/           unit tests
original source code/   upstream reference, read-only, gitignored
```

## Licence

Personal project; upstream Super Productivity is MIT licensed. Its source is
vendored here for reference only.
