import 'package:flutter_test/flutter_test.dart';
import 'package:superprod/domain/reducers.dart';

import '../fixtures.dart';

void main() {
  const today = testToday;
  const now = 1234567890;

  group('addTask', () {
    test('adds membership to project and tags', () {
      final state = buildState(
        projects: [buildProject(id: 'p1')],
        tags: [buildTag(id: 'tag1')],
      );
      final next = addTask(
        state,
        buildTask(id: 't1', projectId: 'p1', tagIds: ['tag1']),
        todayStr: today,
      );
      expect(next.projects['p1']!.taskIds, ['t1']);
      expect(next.tags['tag1']!.taskIds, ['t1']);
      expect(next.tags['TODAY']!.taskIds, isEmpty);
    });

    test('scheduled for today joins the Today ordering but never tagIds', () {
      final state = buildState(tags: [buildTag(id: 'tag1')]);
      final next = addTask(
        state,
        buildTask(id: 't1', tagIds: ['TODAY', 'tag1'], dueDay: today),
        todayStr: today,
      );
      expect(next.tasks['t1']!.tagIds, ['tag1']);
      expect(next.tags['TODAY']!.taskIds, ['t1']);
      expect(next.tags['tag1']!.taskIds, ['t1']);
    });

    test('inserts at the top when asked', () {
      final state = buildState(projects: [buildProject(id: 'p1', taskIds: ['old'])]);
      final next = addTask(
        state,
        buildTask(id: 't1', projectId: 'p1'),
        todayStr: today,
        isAddToBottom: false,
      );
      expect(next.projects['p1']!.taskIds, ['t1', 'old']);
    });

    test('subtasks stay out of project lists', () {
      final state = buildState(projects: [buildProject(id: 'p1')]);
      final next = addTask(
        state,
        buildTask(id: 's1', projectId: 'p1', parentId: 'parent'),
        todayStr: today,
      );
      expect(next.projects['p1']!.taskIds, isEmpty);
    });

    test('derives timeSpent from timeSpentOnDay', () {
      final state = buildState();
      final next = addTask(
        state,
        buildTask(id: 't1', timeSpentOnDay: {'2026-11-18': 60000}),
        todayStr: today,
      );
      expect(next.tasks['t1']!.timeSpent, 60000);
    });
  });

  group('updateTask', () {
    test('completion stamps doneOn and modified, reopening clears it', () {
      final state = buildState(tasks: [buildTask(id: 't1')]);
      final done = updateTask(
        state,
        't1',
        {'isDone': true},
        todayStr: today,
        nowMs: now,
      );
      expect(done.tasks['t1']!.isDone, isTrue);
      expect(done.tasks['t1']!.doneOn, now);
      expect(done.tasks['t1']!.modified, now);

      final reopened = updateTask(
        done,
        't1',
        {'isDone': false},
        todayStr: today,
        nowMs: now + 5,
      );
      expect(reopened.tasks['t1']!.isDone, isFalse);
      expect(reopened.tasks['t1']!.doneOn, isNull);
    });

    test('tag changes update membership on both sides', () {
      final state = buildState(
        tasks: [buildTask(id: 't1', tagIds: ['a'])],
        tags: [buildTag(id: 'a', taskIds: ['t1']), buildTag(id: 'b')],
      );
      final next = updateTask(
        state,
        't1',
        {
          'tagIds': ['b'],
        },
        todayStr: today,
        nowMs: now,
      );
      expect(next.tags['a']!.taskIds, isEmpty);
      expect(next.tags['b']!.taskIds, ['t1']);
    });

    test('moving project rewrites both lists and subtask projects', () {
      final state = buildState(
        tasks: [
          buildTask(id: 't1', projectId: 'p1', subTaskIds: ['s1']),
          buildTask(id: 's1', projectId: 'p1', parentId: 't1'),
        ],
        projects: [
          buildProject(id: 'p1', taskIds: ['t1']),
          buildProject(id: 'p2'),
        ],
      );
      final next = updateTask(
        state,
        't1',
        {'projectId': 'p2'},
        todayStr: today,
        nowMs: now,
      );
      expect(next.projects['p1']!.taskIds, isEmpty);
      expect(next.projects['p2']!.taskIds, ['t1']);
      expect(next.tasks['s1']!.projectId, 'p2');
    });

    test('scheduling for today adds Today ordering, moving away removes it', () {
      final state = buildState(tasks: [buildTask(id: 't1')]);
      final scheduled = updateTask(
        state,
        't1',
        {'dueDay': today},
        todayStr: today,
        nowMs: now,
      );
      expect(scheduled.tags['TODAY']!.taskIds, ['t1']);

      final moved = updateTask(
        scheduled,
        't1',
        {'dueDay': '2026-12-01'},
        todayStr: today,
        nowMs: now,
      );
      expect(moved.tags['TODAY']!.taskIds, isEmpty);
    });

    test('timeSpentOnDay change recomputes timeSpent', () {
      final state = buildState(tasks: [buildTask(id: 't1')]);
      final next = updateTask(
        state,
        't1',
        {
          'timeSpentOnDay': {'2026-11-18': 30000, '2026-11-17': 15000},
        },
        todayStr: today,
        nowMs: now,
      );
      expect(next.tasks['t1']!.timeSpent, 45000);
    });

    test('unknown task id is a no-op', () {
      final state = buildState();
      expect(
        identical(
          updateTask(state, 'missing', {'isDone': true},
              todayStr: today, nowMs: now),
          state,
        ),
        isTrue,
      );
    });
  });

  group('deleteTask', () {
    test('cleans task, subtasks, memberships and the current task pointer', () {
      final state = buildState(
        tasks: [
          buildTask(id: 't1', projectId: 'p1', tagIds: ['a'], subTaskIds: ['s1']),
          buildTask(id: 's1', projectId: 'p1', parentId: 't1'),
        ],
        projects: [buildProject(id: 'p1', taskIds: ['t1'])],
        tags: [
          buildTag(id: 'a', taskIds: ['t1']),
          buildTag(id: 'TODAY', taskIds: ['t1']),
        ],
        currentTaskId: 's1',
      );
      final next = deleteTask(state, 't1');
      expect(next.tasks, isEmpty);
      expect(next.projects['p1']!.taskIds, isEmpty);
      expect(next.tags['a']!.taskIds, isEmpty);
      expect(next.tags['TODAY']!.taskIds, isEmpty);
      expect(next.currentTaskId, isNull);
    });

    test('removes a subtask from a surviving parent', () {
      final state = buildState(
        tasks: [
          buildTask(id: 'parent', subTaskIds: ['s1', 's2']),
          buildTask(id: 's1', parentId: 'parent'),
          buildTask(id: 's2', parentId: 'parent'),
        ],
      );
      final next = deleteTask(state, 's1');
      expect(next.tasks['parent']!.subTaskIds, ['s2']);
      expect(next.tasks.containsKey('s1'), isFalse);
    });
  });

  group('addTaskToListAtAnchor', () {
    test('inserts after the anchor', () {
      expect(
        addTaskToListAtAnchor(['a', 'b', 'c'], 'x', anchorId: 'a'),
        ['a', 'x', 'b', 'c'],
      );
    });

    test('falls back to bottom or top without an anchor', () {
      expect(addTaskToListAtAnchor(['a'], 'x'), ['a', 'x']);
      expect(
        addTaskToListAtAnchor(['a'], 'x', isAddToBottom: false),
        ['x', 'a'],
      );
    });

    test('never duplicates an existing id', () {
      expect(addTaskToListAtAnchor(['a', 'x'], 'x'), ['a', 'x']);
    });
  });
}
