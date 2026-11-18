import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:superprod/app/app.dart';
import 'package:superprod/app/providers.dart';
import 'package:superprod/core/day.dart';
import 'package:superprod/data/local_store.dart';
import 'package:superprod/domain/app_state.dart';

void main() {
  late Directory tempDir;
  late LocalStore store;
  late AppState initial;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('superprod_test_');
    store = LocalStore(tempDir);
    final now = DateTime.now();
    initial = await store.load(
      todayStr: DayCalendar(0).todayStr(now),
      nowMs: now.millisecondsSinceEpoch,
    );
  });

  tearDown(() async {
    if (!await tempDir.exists()) return;
    // A pending save on Windows can still hold the file open for a moment.
    for (var attempt = 0; attempt < 5; attempt++) {
      try {
        await tempDir.delete(recursive: true);
        return;
      } on FileSystemException {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
    }
  });

  Widget app() => ProviderScope(
    overrides: [
      storeProvider.overrideWithValue(store),
      initialStateProvider.overrideWithValue(initial),
    ],
    child: const SuperprodApp(),
  );

  testWidgets('boots into Today', (tester) async {
    await tester.pumpWidget(app());
    expect(find.text('Today'), findsWidgets);
    expect(
      find.text('Nothing planned for today.\nAdd a task to start.'),
      findsOneWidget,
    );
  });

  testWidgets('adding a task shows it in Today', (tester) async {
    await tester.pumpWidget(app());
    await tester.enterText(find.byType(TextField), 'Write the plan');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    // The field keeps focus (cursor blink), so pump instead of pumpAndSettle.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Write the plan'), findsOneWidget);
    expect(
      find.text('Nothing planned for today.\nAdd a task to start.'),
      findsNothing,
    );
  });
}
