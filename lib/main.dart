import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:uuid/uuid.dart';

import 'app/app.dart';
import 'app/providers.dart';
import 'core/day.dart';
import 'data/local_store.dart';
import 'domain/recurrence_engine.dart';
import 'services/reminders.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Reminders.init();
  } catch (_) {
    // Reminders are optional; the app must start without them.
  }
  final store = await LocalStore.openDefault();
  final now = DateTime.now();
  var initial = await store.load(
    todayStr: DayCalendar(0).todayStr(now),
    nowMs: now.millisecondsSinceEpoch,
  );

  // Create recurring instances that came due since the last launch.
  final swept = sweepRecurringTasks(
    initial,
    todayStr: initial.calendar().todayStr(now),
    nowMs: now.millisecondsSinceEpoch,
    newId: () => const Uuid().v4(),
    startOfNextDayDiffMs: initial.calendar().startOfNextDayDiffMs,
  );
  if (!identical(swept, initial)) {
    await store.save(swept);
    initial = swept;
  }

  runApp(
    ProviderScope(
      overrides: [
        storeProvider.overrideWithValue(store),
        initialStateProvider.overrideWithValue(initial),
      ],
      child: const SuperprodApp(),
    ),
  );
}
