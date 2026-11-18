import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:superprod/app/providers.dart';
import 'package:superprod/data/local_store.dart';
import 'package:superprod/domain/app_state.dart';
import 'package:superprod/domain/models/task.dart';
import 'package:superprod/domain/selectors.dart';
import 'package:superprod/features/tasks/task_list_view.dart';

import '../fixtures.dart';

/// Mirrors the real screens: watches app state so list changes rebuild.
class _ListHost extends ConsumerWidget {
  const _ListHost({required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appStateProvider);
    return TaskListView(
      tasks: projectId.isEmpty
          ? inboxTasks(state)
          : projectTasks(state, projectId),
      doneTasks: const [],
      projectId: projectId,
      emptyMessage: 'No tasks yet.',
    );
  }
}

void main() {
  late Directory dir;
  late LocalStore store;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('superprod_org_');
    store = LocalStore(dir);
  });

  tearDown(() async {
    if (!await dir.exists()) return;
    for (var attempt = 0; attempt < 5; attempt++) {
      try {
        await dir.delete(recursive: true);
        return;
      } on FileSystemException {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
    }
  });

  AppState seed({required List<Task> tasks, List<String> projectTaskIds = const []}) =>
      buildState(
        tasks: tasks,
        projects: [
          if (projectTaskIds.isNotEmpty)
            buildProject(id: 'p1', taskIds: projectTaskIds),
        ],
      );

  Future<ProviderContainer> pumpList(
    WidgetTester tester,
    AppState initial, {
    String projectId = 'p1',
  }) async {
    final container = ProviderContainer(
      overrides: [
        storeProvider.overrideWithValue(store),
        initialStateProvider.overrideWithValue(initial),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          home: Scaffold(body: _ListHost(projectId: projectId)),
        ),
      ),
    );
    return container;
  }

  testWidgets('search filters rows by title, ignoring case', (tester) async {
    await pumpList(
      tester,
      seed(
        tasks: [
          buildTask(id: 't1', title: 'Alpha report', projectId: 'p1'),
          buildTask(id: 't2', title: 'Beta plan', projectId: 'p1'),
        ],
        projectTaskIds: const ['t1', 't2'],
      ),
    );

    expect(find.text('Alpha report'), findsOneWidget);
    expect(find.text('Beta plan'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('task-search')), 'ALPHA');
    await tester.pump();

    expect(find.text('Alpha report'), findsOneWidget);
    expect(find.text('Beta plan'), findsNothing);
  });

  testWidgets('search with no match shows a one-line empty state', (
    tester,
  ) async {
    await pumpList(
      tester,
      seed(
        tasks: [buildTask(id: 't1', title: 'Alpha report', projectId: 'p1')],
        projectTaskIds: const ['t1'],
      ),
    );

    await tester.enterText(find.byKey(const Key('task-search')), 'zzz');
    await tester.pump();

    expect(find.text('No tasks match your search.'), findsOneWidget);
    expect(find.text('Alpha report'), findsNothing);
  });

  testWidgets('sorting by priority reorders the view but not stored order', (
    tester,
  ) async {
    final container = await pumpList(
      tester,
      seed(
        tasks: [
          buildTask(id: 't1', title: 'Low task', projectId: 'p1')
              .merged({'priority': 1}),
          buildTask(id: 't2', title: 'High task', projectId: 'p1')
              .merged({'priority': 3}),
          buildTask(id: 't3', title: 'Unset task', projectId: 'p1'),
        ],
        projectTaskIds: const ['t1', 't2', 't3'],
      ),
    );

    await tester.tap(find.byKey(const Key('task-sort')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(InkWell, 'Priority').last);
    await tester.pumpAndSettle();

    final highY = tester.getTopLeft(find.text('High task')).dy;
    final lowY = tester.getTopLeft(find.text('Low task')).dy;
    final unsetY = tester.getTopLeft(find.text('Unset task')).dy;
    expect(highY, lessThan(lowY));
    expect(lowY, lessThan(unsetY));

    // Sorting is a view concern: the project's stored order is untouched.
    expect(
      container.read(appStateProvider).projects['p1']!.taskIds,
      ['t1', 't2', 't3'],
    );
  });

  testWidgets('long-press selection + batch complete marks every pick done', (
    tester,
  ) async {
    final container = await pumpList(
      tester,
      seed(
        tasks: [
          buildTask(id: 't1', title: 'Alpha report', projectId: 'p1'),
          buildTask(id: 't2', title: 'Beta plan', projectId: 'p1'),
        ],
        projectTaskIds: const ['t1', 't2'],
      ),
    );

    await tester.longPress(find.text('Alpha report'));
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);

    await tester.tap(find.text('Beta plan'));
    await tester.pump();
    expect(find.text('2 selected'), findsOneWidget);

    await tester.tap(find.byTooltip('Complete'));
    await tester.pump();

    final state = container.read(appStateProvider);
    expect(state.tasks['t1']!.isDone, isTrue);
    expect(state.tasks['t2']!.isDone, isTrue);
  });

  testWidgets('batch delete removes the selected tasks after confirmation', (
    tester,
  ) async {
    final container = await pumpList(
      tester,
      seed(
        tasks: [
          buildTask(id: 't1', title: 'Alpha report', projectId: 'p1'),
          buildTask(id: 't2', title: 'Beta plan', projectId: 'p1'),
        ],
        projectTaskIds: const ['t1', 't2'],
      ),
    );

    await tester.longPress(find.text('Alpha report'));
    await tester.pump();
    expect(find.text('1 selected'), findsOneWidget);
    await tester.tap(find.text('Beta plan'));
    await tester.pump();
    expect(find.text('2 selected'), findsOneWidget);

    await tester.tap(find.byTooltip('Delete'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();

    expect(container.read(appStateProvider).tasks, isEmpty);
    expect(container.read(appStateProvider).projects['p1']!.taskIds, isEmpty);
  });

  test('reorder through the controller persists the project order', () async {
    final container = ProviderContainer(
      overrides: [
        storeProvider.overrideWithValue(store),
        initialStateProvider.overrideWithValue(
          seed(
            tasks: [
              buildTask(id: 't1', title: 'One', projectId: 'p1'),
              buildTask(id: 't2', title: 'Two', projectId: 'p1'),
              buildTask(id: 't3', title: 'Three', projectId: 'p1'),
            ],
            projectTaskIds: const ['t1', 't2', 't3'],
          ),
        ),
      ],
    );
    addTearDown(container.dispose);

    // Simulating a real drag is brittle, so the drop handler's output (the new
    // index for the dragged id) goes straight to the controller.
    await container
        .read(appStateProvider.notifier)
        .reorder('t3', 0, projectId: 'p1');

    expect(container.read(appStateProvider).projects['p1']!.taskIds, [
      't3',
      't1',
      't2',
    ]);
    final reloaded = await store.load(todayStr: testToday, nowMs: 0);
    expect(reloaded.projects['p1']!.taskIds, ['t3', 't1', 't2']);
  });
}
