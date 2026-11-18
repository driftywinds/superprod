import 'package:flutter_test/flutter_test.dart';
import 'package:superprod/domain/models/task_repeat_cfg.dart';
import 'package:superprod/domain/reducers.dart';

import '../fixtures.dart';

void main() {
  const now = 5000;

  group('addSubTask', () {
    test('attaches to the parent, inherits project, stays out of project lists', () {
      final state = buildState(
        tasks: [buildTask(id: 'p', projectId: 'proj')],
        projects: [buildProject(id: 'proj', taskIds: ['p'])],
      );
      final next = addSubTask(
        state,
        'p',
        buildTask(id: 's', created: 1),
        nowMs: now,
      );
      expect(next.tasks['p']!.subTaskIds, ['s']);
      expect(next.tasks['s']!.parentId, 'p');
      expect(next.tasks['s']!.projectId, 'proj');
      expect(next.projects['proj']!.taskIds, ['p']);
    });

    test('unknown parent is a no-op', () {
      final state = buildState();
      expect(
        identical(addSubTask(state, 'missing', buildTask(), nowMs: now), state),
        isTrue,
      );
    });
  });

  group('duplicateTask', () {
    test('copies the task and its subtasks with fresh ids after the source', () {
      final state = buildState(
        tasks: [
          buildTask(id: 't', projectId: 'p', subTaskIds: ['s'], dueDay: '2026-11-18'),
          buildTask(id: 's', parentId: 't', projectId: 'p'),
        ],
        projects: [buildProject(id: 'p', taskIds: ['t'])],

        tags: [buildTag(id: 'TODAY', taskIds: ['t'])],
      );
      final next = duplicateTask(
        state,
        't',
        nowMs: now,
        newId: _sequentialIds(['copy', 'copy-sub']),
      );

      expect(next.projects['p']!.taskIds, ['t', 'copy']);
      expect(next.tags['TODAY']!.taskIds, ['t', 'copy']);
      expect(next.tasks['copy']!.title, 'Task');
      expect(next.tasks['copy']!.parentId, isNull);
      expect(next.tasks['copy']!.subTaskIds, ['copy-sub']);
      expect(next.tasks['copy-sub']!.parentId, 'copy');
      expect(next.tasks['copy-sub']!.projectId, 'p');
      expect(next.tasks['copy']!.dueDay, '2026-11-18');
    });

    test('unknown task is a no-op', () {
      final state = buildState();
      expect(
        identical(
          duplicateTask(state, 'missing', nowMs: now, newId: () => 'x'),
          state,
        ),
        isTrue,
      );
    });
  });

  group('archiveTask', () {
    test('moves the task and subtasks out of every list but keeps them', () {
      final state = buildState(
        tasks: [
          buildTask(id: 't', projectId: 'p', tagIds: ['tag'], subTaskIds: ['s']),
          buildTask(id: 's', parentId: 't', projectId: 'p'),
        ],
        projects: [buildProject(id: 'p', taskIds: ['t'])],
        tags: [buildTag(id: 'tag', taskIds: ['t']), buildTag(id: 'TODAY', taskIds: ['t'])],
        currentTaskId: 't',
      );
      final next = archiveTask(state, 't', nowMs: now);

      expect(next.tasks, isEmpty);
      expect(next.archivedTasks.keys, containsAll(['t', 's']));
      expect(next.projects['p']!.taskIds, isEmpty);
      expect(next.tags['tag']!.taskIds, isEmpty);
      expect(next.tags['TODAY']!.taskIds, isEmpty);
      expect(next.currentTaskId, isNull);
    });
  });

  group('reorder', () {
    test('moves a task inside a project list', () {
      final state = buildState(
        tasks: [
          buildTask(id: 'a'),
          buildTask(id: 'b'),
          buildTask(id: 'c'),
        ],
        projects: [buildProject(id: 'p', taskIds: ['a', 'b', 'c'])],
      );
      expect(
        reorderInProject(state, 'p', 'c', 0).projects['p']!.taskIds,
        ['c', 'a', 'b'],
      );
      expect(
        reorderInProject(state, 'p', 'a', 2).projects['p']!.taskIds,
        ['b', 'c', 'a'],
      );
    });

    test('moves a task inside the Today ordering', () {
      final state = buildState(
        tasks: [buildTask(id: 'a'), buildTask(id: 'b')],
        tags: [buildTag(id: 'TODAY', taskIds: ['a', 'b'])],
      );
      expect(
        reorderInTag(state, 'TODAY', 'b', 0).tags['TODAY']!.taskIds,
        ['b', 'a'],
      );
    });

    test('unknown list or task leaves state untouched', () {
      final state = buildState(projects: [buildProject(id: 'p', taskIds: ['a'])]);
      expect(identical(reorderInProject(state, 'p', 'x', 0), state), isTrue);
      expect(identical(reorderInProject(state, 'nope', 'a', 0), state), isTrue);
    });

    test('moveIdToIndex clamps out-of-range indexes', () {
      expect(moveIdToIndex(['a', 'b'], 'a', 99), ['b', 'a']);
      expect(moveIdToIndex(['a', 'b'], 'b', -5), ['b', 'a']);
    });
  });

  group('TaskRepeatCfg', () {
    test('round-trips v20 fields and keeps unknown keys', () {
      final cfg = TaskRepeatCfg.fromJson({
        'id': 'r1',
        'repeatCycle': 'WEEKLY',
        'repeatEvery': 2,
        'quickSetting': 'CUSTOM',
        'monday': true,
        'wednesday': true,
        'friday': true,
        'tuesday': false,
        'startDate': '2026-11-18',
        'repeatUntilDay': '2027-01-01',
        'monthlyWeekOfMonth': -1,
        'monthlyWeekday': 4,
        'skipOverdue': true,
        'deletedInstanceDates': ['2026-12-25'],
        'unknownFuture': 'keep-me',
      });
      final json = cfg.toJson();
      expect(json['unknownFuture'], 'keep-me');
      expect(cfg.weekdayAt(DateTime.wednesday), isTrue);
      expect(cfg.weekdayAt(DateTime.tuesday), isFalse);
      expect(TaskRepeatCfg.fromJson(json).repeatEvery, 2);
      expect(TaskRepeatCfg.fromJson(json).monthlyWeekOfMonth, -1);
      expect(TaskRepeatCfg.fromJson(json).deletedInstanceDates, ['2026-12-25']);
    });

    test('merged null clears an optional field', () {
      const cfg = TaskRepeatCfg(id: 'r', repeatUntilDay: '2026-12-01');
      expect(cfg.merged({'repeatUntilDay': null}).repeatUntilDay, isNull);
    });
  });
}

String Function() _sequentialIds(List<String> ids) {
  var index = 0;
  return () => ids[index++];
}
