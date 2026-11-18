import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import 'app/app.dart';
import 'app/providers.dart';
import 'core/day.dart';
import 'data/local_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = await LocalStore.openDefault();
  final now = DateTime.now();
  final initial = await store.load(
    todayStr: DayCalendar(0).todayStr(now),
    nowMs: now.millisecondsSinceEpoch,
  );

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
