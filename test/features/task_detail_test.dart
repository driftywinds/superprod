import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:superprod/app/providers.dart';
import 'package:superprod/app/theme.dart';
import 'package:superprod/core/day.dart';
import 'package:superprod/data/local_store.dart';
import 'package:superprod/domain/app_state.dart';
import 'package:superprod/features/tasks/detail/task_detail_screen.dart';

void main() {
  late Directory dir;
  late LocalStore store;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('superprod_detail_');
    store = LocalStore(dir);
  });

  tearDown(() async {
    if (!await dir.exists()) return;
    // A pending save on Windows can still hold the file open for a moment.
    for (var attempt = 0; attempt < 5; attempt++) {
      try {
        await dir.delete(recursive: true);
        return;
      } on FileSystemException {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
    }
  });

  List<Override> overrides(AppState state) => [
    storeProvider.overrideWithValue(store),
    initialStateProvider.overrideWithValue(state),
  ];

  /// Runs [action] against a seeded controller and hands back the container's
  /// state, already persisted to [store]. Wrapped in [WidgetTester.runAsync]
  /// because the test's fake-async zone never completes real file I/O.
  Future<ProviderContainer> seeded(
    WidgetTester tester,
    Future<void> Function(AppController controller) action,
  ) async {
    final container = (await tester.runAsync<ProviderContainer>(() async {
      final now = DateTime.now();
      final empty = await store.load(
        todayStr: DayCalendar(0).todayStr(now),
        nowMs: now.millisecondsSinceEpoch,
      );
      final container = ProviderContainer(overrides: overrides(empty));
      await action(container.read(appStateProvider.notifier));
      return container;
    }))!;
    addTearDown(container.dispose);
    return container;
  }

  AppState stateOf(ProviderContainer container) =>
      container.read(appStateProvider);

  /// Opens the detail screen through a real route so archive/delete can pop.
  Future<void> openDetail(
    WidgetTester tester, {
    required String taskId,
    required AppState state,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides(state),
        child: MaterialApp(
          theme: buildTheme(Brightness.light),
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  key: const Key('open-task'),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => TaskDetailScreen(taskId: taskId),
                    ),
                  ),
                  child: const Text('Open task'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('open-task')));
    await tester.pumpAndSettle();
  }

  /// Pumps frames until [condition] holds (or ~2s pass), letting real file
  /// I/O finish between frames.
  Future<void> pumpUntil(
    WidgetTester tester,
    bool Function() condition,
  ) async {
    for (var attempt = 0; attempt < 400; attempt++) {
      if (condition()) return;
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
      await tester.pump(const Duration(milliseconds: 10));
    }
    fail('condition was never met');
  }

  /// Reads the persisted document directly, retrying while a write is in
  /// flight. [LocalStore.load] renames unreadable files, so it must not race a
  /// save; this helper tolerates a half-written/absent file instead.
  Future<AppState> reload(
    WidgetTester tester, {
    required bool Function(AppState state) until,
  }) async {
    final file = File('${dir.path}${Platform.pathSeparator}app_state.json');
    for (var attempt = 0; attempt < 400; attempt++) {
      await tester.pump(const Duration(milliseconds: 10));
      final text = await tester.runAsync(() async {
        try {
          return await file.readAsString();
        } on FileSystemException {
          return null;
        }
      });
      if (text != null) {
        try {
          final state = AppState.fromJson(
            (jsonDecode(text) as Map).cast<String, Object?>(),
          );
          if (until(state)) return state;
        } catch (_) {
          // A write is in flight; retry on the next frame.
        }
      }
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
    }
    fail('state on disk never matched');
  }

  testWidgets('title edit persists to the store', (tester) async {
    final container = await seeded(
      tester,
      (n) => n.addTask('Original title'),
    );
    final taskId = stateOf(container).tasks.keys.single;

    await openDetail(tester, taskId: taskId, state: stateOf(container));
    await tester.enterText(find.byKey(const Key('task-title')), 'Edited title');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();

    final loaded = await reload(
      tester,
      until: (state) => state.tasks[taskId]?.title == 'Edited title',
    );
    expect(loaded.tasks[taskId]!.title, 'Edited title');
  });

  testWidgets('adding a subtask shows it and survives reload', (tester) async {
    final container = await seeded(
      tester,
      (n) => n.addTask('Parent task'),
    );
    final taskId = stateOf(container).tasks.keys.single;

    await openDetail(tester, taskId: taskId, state: stateOf(container));
    await tester.ensureVisible(find.byKey(const Key('add-subtask')));
    await tester.enterText(find.byKey(const Key('add-subtask')), 'Child task');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();

    expect(find.text('Child task'), findsOneWidget);

    final loaded = await reload(
      tester,
      until: (state) =>
          state.tasks[taskId]?.subTaskIds.length == 1 &&
          state.tasks.length == 2,
    );
    final parent = loaded.tasks[taskId]!;
    expect(parent.subTaskIds, hasLength(1));
    expect(loaded.tasks[parent.subTaskIds.single]!.title, 'Child task');
  });

  testWidgets('completing a subtask persists', (tester) async {
    final container = await seeded(
      tester,
      (n) => n.addTask('Parent task'),
    );
    final taskId = stateOf(container).tasks.keys.single;
    await tester.runAsync(
      () => container
          .read(appStateProvider.notifier)
          .addSubTask(taskId, 'Child task'),
    );
    final seededState = stateOf(container);
    final childId = seededState.tasks[taskId]!.subTaskIds.single;

    await openDetail(tester, taskId: taskId, state: seededState);
    final checkbox = find.byKey(Key('subtask-checkbox-$childId'));
    await tester.ensureVisible(checkbox);
    await tester.tap(checkbox);
    await tester.pump();

    expect(tester.widget<Checkbox>(checkbox).value, isTrue);

    final loaded = await reload(
      tester,
      until: (state) => state.tasks[childId]?.isDone ?? false,
    );
    expect(loaded.tasks[childId]!.isDone, isTrue);
  });

  testWidgets('duplicate adds a second task', (tester) async {
    final container = await seeded(
      tester,
      (n) => n.addTask('Original title'),
    );
    final taskId = stateOf(container).tasks.keys.single;

    await openDetail(tester, taskId: taskId, state: stateOf(container));
    await tester.tap(find.byKey(const Key('task-actions')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Duplicate'));

    final loaded = await reload(
      tester,
      until: (state) => state.tasks.length == 2,
    );
    expect(loaded.tasks, hasLength(2));
    expect(
      loaded.tasks.values.map((task) => task.title).toSet(),
      {'Original title'},
    );
  });

  testWidgets('archive pops and keeps the task in archivedTasks', (
    tester,
  ) async {
    final container = await seeded(
      tester,
      (n) => n.addTask('Archived task'),
    );
    final taskId = stateOf(container).tasks.keys.single;

    await openDetail(tester, taskId: taskId, state: stateOf(container));
    await tester.tap(find.byKey(const Key('task-actions')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Archive'));
    await pumpUntil(
      tester,
      () => find.byKey(const Key('open-task')).evaluate().isNotEmpty,
    );
    expect(find.byKey(const Key('open-task')), findsOneWidget);

    final loaded = await reload(
      tester,
      until: (state) => state.archivedTasks.containsKey(taskId),
    );
    expect(loaded.tasks.containsKey(taskId), isFalse);
    expect(loaded.archivedTasks.containsKey(taskId), isTrue);
  });

  testWidgets('delete asks for confirmation, then pops and removes', (
    tester,
  ) async {
    final container = await seeded(
      tester,
      (n) => n.addTask('Delete me'),
    );
    final taskId = stateOf(container).tasks.keys.single;

    await openDetail(tester, taskId: taskId, state: stateOf(container));

    await tester.tap(find.byKey(const Key('task-actions')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.byType(TaskDetailScreen), findsOneWidget);

    await tester.tap(find.byKey(const Key('task-actions')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await pumpUntil(
      tester,
      () => find.byKey(const Key('open-task')).evaluate().isNotEmpty,
    );
    expect(find.byKey(const Key('open-task')), findsOneWidget);
    final loaded = await reload(
      tester,
      until: (state) => !state.tasks.containsKey(taskId),
    );
    expect(loaded.tasks.containsKey(taskId), isFalse);
  });

  testWidgets('date picker writes dueDay and clears dueWithTime', (
    tester,
  ) async {
    final container = await seeded(
      tester,
      (n) => n.addTask('Scheduled task'),
    );
    final taskId = stateOf(container).tasks.keys.single;
    await tester.runAsync(
      () => container.read(appStateProvider.notifier).updateTaskFields(
        taskId,
        {'dueWithTime': DateTime(2026, 6, 10, 9).millisecondsSinceEpoch},
      ),
    );

    await openDetail(tester, taskId: taskId, state: stateOf(container));
    final dueDate = find.byKey(const Key('due-date'));
    await tester.ensureVisible(dueDate);
    await tester.tap(dueDate);
    await tester.pumpAndSettle();

    expect(find.byType(DatePickerDialog), findsOneWidget);
    await tester.tap(find.text('5'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    final loaded = await reload(
      tester,
      until: (state) => state.tasks[taskId]?.dueDay == '2026-06-05',
    );
    expect(loaded.tasks[taskId]!.dueDay, '2026-06-05');
    expect(loaded.tasks[taskId]!.dueWithTime, isNull);
  });

  testWidgets('repeat preset applies and creates the next instance', (
    tester,
  ) async {
    final container = await seeded(
      tester,
      (n) => n.addTask('Recurring task'),
    );
    final taskId = stateOf(container).tasks.keys.single;
    final yesterday = dbDateStr(
      DateTime.now().subtract(const Duration(days: 1)),
    );
    await tester.runAsync(
      () => container.read(appStateProvider.notifier).updateTaskFields(
        taskId,
        {'dueDay': yesterday},
      ),
    );

    await openDetail(tester, taskId: taskId, state: stateOf(container));
    final repeatTile = find.byKey(const Key('task-repeat'));
    await tester.ensureVisible(repeatTile);
    await tester.tap(repeatTile);
    await tester.pumpAndSettle();

    expect(find.byType(AlertDialog), findsOneWidget);
    await tester.tap(find.byKey(const Key('repeat-preset-DAILY')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('repeat-save')));
    await tester.pumpAndSettle();
    expect(find.text('Daily'), findsOneWidget);

    final loaded = await reload(
      tester,
      until: (state) =>
          state.repeatCfgs.isNotEmpty && state.tasks.length == 2,
    );
    final cfgId = loaded.tasks[taskId]!.repeatCfgId;
    expect(cfgId, isNotNull);
    final cfg = loaded.repeatCfgs[cfgId]!;
    expect(cfg.quickSetting, 'DAILY');
    expect(cfg.repeatCycle, 'DAILY');
    expect(cfg.startDate, yesterday);
    expect(
      loaded.tasks.values.where((task) => task.repeatCfgId == cfgId),
      hasLength(2),
    );
  });

  testWidgets('reminder persists the picked timestamp', (tester) async {
    final now = DateTime.now();
    final container = await seeded(
      tester,
      (n) => n.addTask('Reminded task'),
    );
    final taskId = stateOf(container).tasks.keys.single;
    // Seed an AM time so the 12-hour picker keeps AM when the hour is typed.
    await tester.runAsync(
      () => container.read(appStateProvider.notifier).updateTaskFields(
        taskId,
        {
          'remindAt': DateTime(
            now.year,
            now.month,
            10,
            9,
          ).millisecondsSinceEpoch,
        },
      ),
    );

    await openDetail(tester, taskId: taskId, state: stateOf(container));
    final reminderTile = find.byKey(const Key('task-reminder'));
    await tester.ensureVisible(reminderTile);
    await tester.tap(reminderTile);
    await tester.pumpAndSettle();

    expect(find.byType(DatePickerDialog), findsOneWidget);
    await tester.tap(find.text('5'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    expect(find.byType(TimePickerDialog), findsOneWidget);
    final fields = find.descendant(
      of: find.byType(TimePickerDialog),
      matching: find.byType(TextField),
    );
    expect(fields, findsNWidgets(2));
    await tester.enterText(fields.at(0), '09');
    await tester.enterText(fields.at(1), '30');
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    final expected = DateTime(
      now.year,
      now.month,
      5,
      9,
      30,
    ).millisecondsSinceEpoch;
    final loaded = await reload(
      tester,
      until: (state) => state.tasks[taskId]?.remindAt == expected,
    );
    expect(loaded.tasks[taskId]!.remindAt, expected);
  });
}
