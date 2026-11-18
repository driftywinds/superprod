import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'database.g.dart';

/// Projects, matching the upstream `Project` entity.
class Projects extends Table {
  TextColumn get id => text()();
  TextColumn get title => text()();
  TextColumn get color => text().nullable()();
  IntColumn get created => integer()();
  BoolColumn get isArchived =>
      boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Tasks, matching the upstream `Task` entity field for field where it matters.
///
/// `dueDay` and `dueWithTime` are mutually exclusive upstream; readers check
/// `dueWithTime` first. `tagIds` is stored comma-separated because it is a flat
/// list that is always read whole.
class Tasks extends Table {
  TextColumn get id => text()();
  TextColumn get title => text()();
  TextColumn get notes => text().nullable()();
  TextColumn get projectId => text()();
  TextColumn get tagIds => text().withDefault(const Constant(''))();
  BoolColumn get isDone => boolean().withDefault(const Constant(false))();
  IntColumn get doneOn => integer().nullable()();
  IntColumn get created => integer()();
  IntColumn get timeEstimate => integer().withDefault(const Constant(0))();
  IntColumn get timeSpent => integer().withDefault(const Constant(0))();
  TextColumn get dueDay => text().nullable()();
  IntColumn get dueWithTime => integer().nullable()();
  IntColumn get remindAt => integer().nullable()();
  IntColumn get priority => integer().nullable()();
  TextColumn get parentId => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Small key/value table for sync state, the device id and cached config.
class Meta extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {key};
}

@DriftDatabase(tables: [Projects, Tasks, Meta])
class AppDatabase extends _$AppDatabase {
  AppDatabase([QueryExecutor? executor])
      : super(executor ?? driftDatabase(name: 'superprod'));

  @override
  int get schemaVersion => 1;

  /// The Inbox project is created once, on first launch.
  Future<void> ensureDefaults() async {
    final existing = await select(projects).get();
    if (existing.isNotEmpty) return;

    await into(projects).insert(
      ProjectsCompanion.insert(
        id: 'INBOX',
        title: 'Inbox',
        created: DateTime.now().millisecondsSinceEpoch,
      ),
    );
  }
}
