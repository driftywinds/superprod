# Building the Android app (widget + notifications)

```bash
pnpm install
pnpm android:setup        # build web, add android/ once, merge native code, cap sync
# then open android/ in Android Studio and Run, or:
cd android && ./gradlew assembleDebug
```

`pnpm android:native` re-merges `native/android/` into `android/` (idempotent) — run it after
`npx cap add android` on a fresh checkout. Everything native lives in `native/android/`.

## Home-screen widget
Long-press the home screen → Widgets → **superprod**.
- Shows today's tasks (overdue first); if nothing is planned today it shows the next days that have tasks, each under its own heading.
- Tap the box to complete (works with the app closed; applied to your data the next time the app opens).
- Tap a task to open it. **+** opens the app on the add-task field. **⋮** → *Refresh from app* syncs and refreshes the widget, then returns you to where you were.
- After midnight, until the app refreshes it, the widget asks you to use ⋮ → Refresh instead of showing yesterday's list.

## Notifications
- Reminders are handed to Android's alarm manager ahead of time, so they fire with the app closed (`src/services/reminder-sync.ts`).
- Each has **Done** and **Snooze** (10 min) buttons. Android opens the app to run the action, which then returns to the background by itself.
- For on-the-minute delivery allow *Alarms & reminders* for superprod in Android settings (Android 12+); otherwise Android may delay reminders by a few minutes.

Not compiled in CI here: build once in Android Studio and report any Gradle error.
