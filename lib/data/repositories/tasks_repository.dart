import 'package:drift/drift.dart';

import '../db/database.dart';

/// Read/write access to tasks. The database is the single source of truth; the
/// UI observes streams, so nothing keeps a second copy that can drift.
class TasksRepository {
  TasksRepository(this._db);

  final AppDatabase _db;

  /// Open tasks for a day, using the upstream rule that `dueWithTime` wins over
  /// `dueDay` and that a task belongs to a day if either matches.
  Stream<List<Task>> watchForDay(String day) {
    final start = _dayStart(day);
    final end = start.add(const Duration(days: 1));

    return (_db.select(_db.tasks)
          ..where((t) => t.isDone.equals(false))
          ..where(
            (t) =>
                t.dueWithTime.isBiggerOrEqualValue(start.millisecondsSinceEpoch) &
                    t.dueWithTime.isSmallerThanValue(end.millisecondsSinceEpoch) |
                (t.dueWithTime.isNull() & t.dueDay.equals(day)),
          )
          ..orderBy([
            (t) => OrderingTerm(expression: t.dueWithTime, mode: OrderingMode.asc),
            (t) => OrderingTerm(expression: t.created, mode: OrderingMode.asc),
          ]))
        .watch();
  }

  Stream<List<Task>> watchInbox() =>
      (_db.select(_db.tasks)
            ..where((t) => t.isDone.equals(false))
            ..where((t) => t.projectId.equals('INBOX'))
            ..orderBy([(t) => OrderingTerm(expression: t.created, mode: OrderingMode.asc)]))
          .watch();

  Stream<List<Task>> watchDoneForDay(String day) {
    final start = _dayStart(day);
    final end = start.add(const Duration(days: 1));

    return (_db.select(_db.tasks)
          ..where((t) => t.isDone.equals(true))
          ..where(
            (t) =>
                t.doneOn.isBiggerOrEqualValue(start.millisecondsSinceEpoch) &
                t.doneOn.isSmallerThanValue(end.millisecondsSinceEpoch),
          )
          ..orderBy([(t) => OrderingTerm(expression: t.doneOn, mode: OrderingMode.desc)]))
        .watch();
  }

  Stream<List<Project>> watchProjects() =>
      (_db.select(_db.projects)
            ..where((p) => p.isArchived.equals(false))
            ..orderBy([(p) => OrderingTerm(expression: p.title)]))
          .watch();

  Future<void> add({
    required String title,
    String projectId = 'INBOX',
    String? notes,
    List<String> tagIds = const [],
    int? dueWithTime,
    String? dueDay,
    int? priority,
    int? timeEstimate,
    String? id,
  }) async {
    await _db.into(_db.tasks).insert(
          TasksCompanion.insert(
            id: id ?? _newId(),
            title: title,
            projectId: projectId,
            created: DateTime.now().millisecondsSinceEpoch,
            notes: Value(notes),
            tagIds: Value(tagIds.join(',')),
            dueWithTime: Value(dueWithTime),
            dueDay: Value(dueDay),
            priority: Value(priority),
            timeEstimate: Value(timeEstimate ?? 0),
          ),
        );
  }

  Future<void> setDone(bool done, String taskId) async {
    await (_db.update(_db.tasks)..where((t) => t.id.equals(taskId))).write(
      TasksCompanion(
        isDone: Value(done),
        doneOn: Value(done ? DateTime.now().millisecondsSinceEpoch : null),
      ),
    );
  }

  Future<void> delete(String taskId) async {
    await (_db.delete(_db.tasks)..where((t) => t.id.equals(taskId))).go();
  }

  Future<void> rename(String taskId, String title) async {
    await (_db.update(_db.tasks)..where((t) => t.id.equals(taskId)))
        .write(TasksCompanion(title: Value(title)));
  }

  Future<void> ensureProject(String title, {String? id, String? color}) async {
    final existing = await (_db.select(_db.projects)
          ..where((p) => p.title.equals(title))
          ..limit(1))
        .getSingleOrNull();
    if (existing != null) return;

    await _db.into(_db.projects).insert(
          ProjectsCompanion.insert(
            id: id ?? _newId(),
            title: title,
            color: Value(color),
            created: DateTime.now().millisecondsSinceEpoch,
          ),
        );
  }

  static DateTime _dayStart(String day) {
    final parts = day.split('-').map(int.parse).toList();
    return DateTime(parts[0], parts[1], parts[2]);
  }

  /// Upstream ids are 22-character url-safe strings; this keeps the same shape
  /// so generated data looks native to the server.
  static String _newId() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
    final random = DateTime.now().microsecondsSinceEpoch;
    final buffer = StringBuffer();
    var value = random;
    for (var i = 0; i < 22; i++) {
      buffer.write(alphabet[value % alphabet.length]);
      value = value ~/ 3 + (i * 7919);
    }
    return buffer.toString();
  }
}
