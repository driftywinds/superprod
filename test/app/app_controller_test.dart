import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:superprod/app/providers.dart';
import 'package:superprod/core/day.dart';
import 'package:superprod/data/local_store.dart';
import 'package:superprod/domain/app_state.dart';

void main() {
  late Directory dir;
  late LocalStore store;
  late AppState initial;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('superprod_controller_');
    store = LocalStore(dir);
    final now = DateTime.now();
    initial = await store.load(
      todayStr: DayCalendar(0).todayStr(now),
      nowMs: now.millisecondsSinceEpoch,
    );
  });

  tearDown(() async {
    if (await dir.exists()) {
      try {
        await dir.delete(recursive: true);
      } on FileSystemException {
        // Windows file lock from a previous write; the OS cleans the temp dir.
      }
    }
  });

  ProviderContainer container() {
    final container = ProviderContainer(
      overrides: [
        storeProvider.overrideWithValue(store),
        initialStateProvider.overrideWithValue(initial),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  Future<AppState> reload() async {
    final now = DateTime.now();
    return store.load(
      todayStr: DayCalendar(0).todayStr(now),
      nowMs: now.millisecondsSinceEpoch,
    );
  }

  test('addTask schedules for today and persists it', () async {
    final c = container();
    await c
        .read(appStateProvider.notifier)
        .addTask('Write the plan', scheduleForToday: true);

    final state = c.read(appStateProvider);
    final task = state.tasks.values.single;
    expect(task.title, 'Write the plan');
    expect(task.scheduledDay, DayCalendar(0).todayStr(DateTime.now()));
    expect(state.todayTag!.taskIds, [task.id]);

    final persisted = (await reload()).tasks.values.single;
    expect(persisted.title, 'Write the plan');
  });

  test('addTask outside Today leaves the task unscheduled', () async {
    final c = container();
    await c.read(appStateProvider.notifier).addTask('Inbox item');

    final task = c.read(appStateProvider).tasks.values.single;
    expect(task.dueDay, isNull);
    expect(task.dueWithTime, isNull);
  });

  test('toggleDone persists completion and reopening', () async {
    final c = container();
    await c.read(appStateProvider.notifier).addTask('Finish');
    final task = c.read(appStateProvider).tasks.values.single;

    await c.read(appStateProvider.notifier).toggleDone(task);
    expect((await reload()).tasks[task.id]!.isDone, isTrue);

    final done = c.read(appStateProvider).tasks[task.id]!;
    await c.read(appStateProvider.notifier).toggleDone(done);
    expect((await reload()).tasks[task.id]!.isDone, isFalse);
  });

  test('deleteTask removes it from disk', () async {
    final c = container();
    await c.read(appStateProvider.notifier).addTask('Temporary');
    final task = c.read(appStateProvider).tasks.values.single;

    await c.read(appStateProvider.notifier).deleteTask(task.id);
    expect(await reload(), isA<AppState>());
    expect((await reload()).tasks, isEmpty);
  });

  test('createProject persists an empty project', () async {
    final c = container();
    await c.read(appStateProvider.notifier).createProject('Work');

    final project = (await reload()).projects.values.single;
    expect(project.title, 'Work');
    expect(project.taskIds, isEmpty);
  });

  test('createTag reuses an existing tag by title', () async {
    final c = container();
    final first = await c.read(appStateProvider.notifier).createTag('deep');
    final second = await c.read(appStateProvider.notifier).createTag('Deep');

    expect(first, isNotNull);
    expect(second, first);
    expect(
      (await reload()).tags.values.where((tag) => tag.title.toLowerCase() == 'deep'),
      hasLength(1),
    );
  });

  test('a task added to a project joins its list', () async {
    final c = container();
    await c.read(appStateProvider.notifier).createProject('Work');
    final projectId = c.read(appStateProvider).projects.keys.single;

    await c
        .read(appStateProvider.notifier)
        .addTask('Ship it', projectId: projectId);

    final state = await reload();
    final project = state.projects[projectId]!;
    expect(project.taskIds, hasLength(1));
    expect(state.tasks[project.taskIds.single]!.title, 'Ship it');
  });

  group('short syntax', () {
    test('strips the estimate and creates a tag', () async {
      final c = container();
      await c.read(appStateProvider.notifier).addTask('Write proposal #deep 45m');

      final task = c.read(appStateProvider).tasks.values.single;
      expect(task.title, 'Write proposal');
      expect(task.timeEstimate, 45 * 60 * 1000);
      expect(task.tagIds, hasLength(1));

      final tag = c.read(appStateProvider).tags[task.tagIds.single]!;
      expect(tag.title, 'deep');
      expect(tag.taskIds, [task.id]);
    });

    test('reuses an existing tag instead of duplicating it', () async {
      final c = container();
      await c.read(appStateProvider.notifier).addTask('One #deep');
      await c.read(appStateProvider.notifier).addTask('Two #deep');

      final state = c.read(appStateProvider);
      final deepTags = state.tags.values.where((tag) => tag.title == 'deep');
      expect(deepTags, hasLength(1));
      expect(state.tasks.values.every((task) => task.tagIds.length == 1), isTrue);
    });

    test('routes a +project task into that project', () async {
      final c = container();
      await c.read(appStateProvider.notifier).createProject('Work');
      final projectId = c.read(appStateProvider).projects.keys.single;

      await c.read(appStateProvider.notifier).addTask('Report +Work');

      final state = c.read(appStateProvider);
      final task = state.tasks.values.single;
      expect(task.title, 'Report');
      expect(task.projectId, projectId);
      expect(state.projects[projectId]!.taskIds, [task.id]);
    });

    test('sets an explicit due date from @…', () async {
      final c = container();
      await c.read(appStateProvider.notifier).addTask('Plan @2026-12-01');

      final task = c.read(appStateProvider).tasks.values.single;
      expect(task.dueDay, '2026-12-01');
      expect(task.dueWithTime, isNull);
    });

    test('an explicit date wins over the Today context', () async {
      final c = container();
      await c
          .read(appStateProvider.notifier)
          .addTask('Plan @2026-12-01', scheduleForToday: true);

      final task = c.read(appStateProvider).tasks.values.single;
      expect(task.dueDay, '2026-12-01');
      expect(c.read(appStateProvider).todayTag!.taskIds, isEmpty);
    });
  });
}
