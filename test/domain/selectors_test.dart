import 'package:flutter_test/flutter_test.dart';
import 'package:superprod/domain/selectors.dart';

import '../fixtures.dart';

void main() {
  const today = testToday;

  group('todayTasks', () {
    test('includes tasks scheduled today by day or time, excludes the rest', () {
      final timedToday = DateTime(2026, 11, 18, 9).millisecondsSinceEpoch;
      final state = buildState(
        tasks: [
          buildTask(id: 'day', title: 'Day task', dueDay: today),
          buildTask(id: 'timed', title: 'Timed task', dueWithTime: timedToday),
          buildTask(id: 'other', title: 'Other', dueDay: '2026-12-01'),
          buildTask(id: 'none', title: 'Unscheduled'),
          buildTask(id: 'done', title: 'Done', dueDay: today, isDone: true),
        ],
      );
      expect(
        todayTasks(state, todayStr: today).map((task) => task.id),
        ['day', 'timed'],
      );
    });

    test('orders by the Today tag list, then by creation', () {
      final state = buildState(
        tasks: [
          buildTask(id: 'a', dueDay: today, created: 1),
          buildTask(id: 'b', dueDay: today, created: 2),
          buildTask(id: 'c', dueDay: today, created: 3),
        ],
        tags: [buildTag(id: 'TODAY', taskIds: ['c', 'a'])],
      );
      expect(
        todayTasks(state, todayStr: today).map((task) => task.id),
        ['c', 'a', 'b'],
      );
    });

    test('excludes subtasks by default', () {
      final state = buildState(
        tasks: [
          buildTask(id: 'sub', dueDay: today, parentId: 'parent'),
        ],
      );
      expect(todayTasks(state, todayStr: today), isEmpty);
    });
  });

  test('doneToday lists tasks with doneOn on the logical day', () {
    final doneMs = DateTime(2026, 11, 18, 15).millisecondsSinceEpoch;
    final state = buildState(
      tasks: [
        buildTask(id: 'a', isDone: true, doneOn: doneMs),
        buildTask(id: 'b', isDone: true,
            doneOn: DateTime(2026, 11, 17, 15).millisecondsSinceEpoch),
        buildTask(id: 'c'),
      ],
    );
    expect(doneToday(state, todayStr: today).map((task) => task.id), ['a']);
  });

  test('inbox holds undone top-level tasks without a project', () {
    final state = buildState(
      tasks: [
        buildTask(id: 'a'),
        buildTask(id: 'project-task', projectId: 'p1'),
        buildTask(id: 'sub', parentId: 'a'),
        buildTask(id: 'done', isDone: true),
      ],
    );
    expect(inboxTasks(state).map((task) => task.id), ['a']);
  });

  test('projectTasks keeps stored order and can include done', () {
    final state = buildState(
      tasks: [
        buildTask(id: 'a', projectId: 'p1'),
        buildTask(id: 'b', projectId: 'p1', isDone: true),
      ],
      projects: [buildProject(id: 'p1', taskIds: ['b', 'a'])],
    );
    expect(projectTasks(state, 'p1').map((task) => task.id), ['a']);
    expect(
      projectTasks(state, 'p1', includeDone: true).map((task) => task.id),
      ['b', 'a'],
    );
  });

  test('overdue is scheduled before today and not done', () {
    final state = buildState(
      tasks: [
        buildTask(id: 'overdue', dueDay: '2026-11-16'),
        buildTask(id: 'today', dueDay: today),
        buildTask(id: 'future', dueDay: '2026-11-20'),
        buildTask(id: 'done', dueDay: '2026-11-16', isDone: true),
        buildTask(id: 'unscheduled'),
      ],
    );
    expect(
      overdueTasks(state, todayStr: today).map((task) => task.id),
      ['overdue'],
    );
  });

  test('visibleProjects hides archived, done and hidden projects', () {
    final state = buildState(
      projects: [
        buildProject(id: 'a', title: 'Beta'),
        buildProject(id: 'b', title: 'Alpha'),
        buildProject(id: 'archived', isArchived: true),
        buildProject(id: 'done', isDone: true),
      ],
    );
    expect(
      visibleProjects(state).map((project) => project.title),
      ['Alpha', 'Beta'],
    );
  });
}
