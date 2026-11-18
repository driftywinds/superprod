import 'package:flutter_test/flutter_test.dart';
import 'package:superprod/domain/models/project.dart';
import 'package:superprod/domain/models/tag.dart';
import 'package:superprod/domain/models/task.dart';

void main() {
  group('Task JSON', () {
    test('round-trips known fields', () {
      final task = Task(
        id: 't1',
        title: 'Write',
        notes: 'notes',
        timeEstimate: 3600000,
        timeSpent: 60000,
        projectId: 'p1',
        tagIds: const ['a'],
        created: 1000,
        subTaskIds: const ['s1'],
        timeSpentOnDay: const {'2026-11-18': 60000},
        dueDay: '2026-11-18',
        priority: 2,
      );
      final copy = Task.fromJson(task.toJson());
      expect(copy.id, 't1');
      expect(copy.title, 'Write');
      expect(copy.notes, 'notes');
      expect(copy.timeEstimate, 3600000);
      expect(copy.timeSpentOnDay, {'2026-11-18': 60000});
      expect(copy.dueDay, '2026-11-18');
      expect(copy.priorityRank, 2);
      expect(copy.subTaskIds, ['s1']);
    });

    test('preserves unknown fields so synced data is not dropped', () {
      final copy = Task.fromJson({
        'id': 't1',
        'title': 'Write',
        'created': 1,
        'issueId': 'ISSUE-7',
        'pluginField': {'nested': true},
        'tagIds': <String>[],
      });
      final json = copy.toJson();
      expect(json['issueId'], 'ISSUE-7');
      expect(json['pluginField'], {'nested': true});
    });

    test('strips the virtual TODAY tag on read', () {
      final copy = Task.fromJson({
        'id': 't1',
        'title': 'Write',
        'created': 1,
        'tagIds': ['TODAY', 'a'],
      });
      expect(copy.tagIds, ['a']);
    });

    test('dueWithTime wins over dueDay', () {
      final withTime = Task.fromJson({
        'id': 't1',
        'title': 'Write',
        'created': 1,
        'dueDay': '2020-01-01',
        'dueWithTime': DateTime(2026, 11, 18, 9).millisecondsSinceEpoch,
      });
      expect(withTime.scheduledDay, '2026-11-18');
      expect(withTime.isScheduledForDay('2020-01-01'), isFalse);
    });

    test('legacy priority strings map to ranks', () {
      Task withPriority(Object? value) =>
          Task.fromJson({'id': 't', 'title': 'x', 'created': 1, 'priority': value});
      expect(withPriority('high').priorityRank, 3);
      expect(withPriority('medium').priorityRank, 2);
      expect(withPriority('low').priorityRank, 1);
      expect(withPriority(3).priorityRank, 3);
      expect(withPriority(null).priorityRank, isNull);
      expect(withPriority('nonsense').priorityRank, isNull);
    });

    test('merged clears a field when given null', () {
      final task = Task.fromJson({
        'id': 't1',
        'title': 'Write',
        'created': 1,
        'dueDay': '2026-11-18',
      });
      expect(task.merged({'dueDay': null}).dueDay, isNull);
    });

    test('wontDo only counts while doneOn matches', () {
      final task = Task.fromJson({
        'id': 't',
        'title': 'x',
        'created': 1,
        'isDone': true,
        'doneOn': 5,
        'wontDoOn': 5,
      });
      expect(task.isWontDo, isTrue);
      expect(task.merged({'doneOn': 6}).isWontDo, isFalse);
    });
  });

  group('Project JSON', () {
    test('round-trips and keeps unknown fields', () {
      final project = Project.fromJson({
        'id': 'p1',
        'title': 'Work',
        'taskIds': ['a'],
        'theme': {'primary': '#fff'},
        'someFutureField': 42,
      });
      final json = project.toJson();
      expect(json['someFutureField'], 42);
      expect(project.taskIds, ['a']);
      expect(project.isArchived, isFalse);
    });
  });

  group('Tag JSON', () {
    test('round-trips ordering ids', () {
      final tag = Tag.fromJson({
        'id': 'tag1',
        'title': 'Deep work',
        'taskIds': ['a', 'b'],
        'created': 2,
      });
      expect(Tag.fromJson(tag.toJson()).taskIds, ['a', 'b']);
    });
  });
}
