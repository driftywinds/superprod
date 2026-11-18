import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../data/local_store.dart';
import '../domain/app_state.dart';
import '../domain/models/project.dart';
import '../domain/models/tag.dart';
import '../domain/models/task.dart';
import '../domain/reducers.dart' as reducers;
import '../domain/selectors.dart';
import '../domain/short_syntax.dart';

/// Overridden in `main` with a store bound to the app support directory.
final storeProvider = Provider<LocalStore>(
  (ref) => throw UnimplementedError('storeProvider must be overridden'),
);

/// Overridden in `main` with the state loaded from disk.
final initialStateProvider = Provider<AppState>(
  (ref) => throw UnimplementedError('initialStateProvider must be overridden'),
);

final appStateProvider = NotifierProvider<AppController, AppState>(
  AppController.new,
);

class AppController extends Notifier<AppState> {
  static const _uuid = Uuid();

  @override
  AppState build() => ref.watch(initialStateProvider);

  LocalStore get _store => ref.read(storeProvider);

  /// Persists [next]. The UI can ignore the returned future; tests await it.
  Future<void> _commit(AppState next) {
    state = next;
    return _store.save(next);
  }

  String get todayStr => state.calendar().todayStr(DateTime.now());

  /// Parses [rawTitle] with the upstream short-syntax grammar and adds the task.
  ///
  /// `scheduleForToday` is true when adding from the Today view: an input
  /// without an explicit date is then scheduled for the logical today.
  Future<void> addTask(
    String rawTitle, {
    String projectId = '',
    bool scheduleForToday = false,
  }) {
    final now = DateTime.now();
    final today = todayStr;
    final parsed = parseShortSyntax(
      rawTitle,
      config: const ShortSyntaxConfig(),
      now: now,
      startOfNextDayDiffMs: state.calendar().startOfNextDayDiffMs,
      knownProjectTitles: [
        for (final project in state.projects.values) project.title,
      ],
      knownTagTitles: [
        for (final tag in state.tags.values)
          if (tag.id != todayTagId) tag.title,
      ],
    );

    final title = parsed.title.trim();
    if (title.isEmpty) return Future.value();

    var next = state;
    final tagIds = <String>[];

    // Existing tags are matched by title; unknown titles create new tags, which
    // is what upstream does when a task is submitted with `#newtag`.
    for (final tagTitle in parsed.tagTitles) {
      final existing = next.tags.values
          .where((tag) => tag.id != todayTagId)
          .cast<Tag?>()
          .firstWhere(
            (tag) => tag!.title.toLowerCase() == tagTitle.toLowerCase(),
            orElse: () => null,
          );
      if (existing != null) {
        tagIds.add(existing.id);
        continue;
      }
      final tag = Tag(
        id: _uuid.v4(),
        title: tagTitle,
        created: now.millisecondsSinceEpoch,
      );
      next = next.copyWith(tags: {...next.tags, tag.id: tag});
      tagIds.add(tag.id);
    }

    // Upstream only resolves an existing project from the typed title; an
    // unknown title does not create one.
    final typedProjectTitle = parsed.projectTitle;
    var targetProjectId = projectId;
    if (typedProjectTitle != null) {
      for (final project in next.projects.values) {
        if (project.title.toLowerCase() == typedProjectTitle.toLowerCase()) {
          targetProjectId = project.id;
          break;
        }
      }
    }

    final hasParsedSchedule =
        parsed.dueWithTimeMs != null || parsed.dueDay != null;
    final dueWithTime = parsed.dueWithTimeMs;
    final dueDay = dueWithTime != null
        ? null
        : (parsed.dueDay ?? (scheduleForToday ? today : null));

    final task = Task(
      id: _uuid.v4(),
      title: title,
      created: now.millisecondsSinceEpoch,
      projectId: targetProjectId,
      tagIds: tagIds,
      dueDay: dueDay,
      dueWithTime: dueWithTime,
      deadlineDay: parsed.deadlineDay,
      deadlineWithTime: parsed.deadlineWithTimeMs,
      timeEstimate: parsed.timeEstimateMs ?? 0,
      priority: parsed.priority,
      timeSpentOnDay: parsed.timeSpentMs == null
          ? const {}
          : {today: parsed.timeSpentMs!},
      attachments: [
        for (final attachment in parsed.attachments)
          {
            'id': _uuid.v4(),
            'type': attachment.type.name,
            'path': attachment.path,
            'title': attachment.title,
          },
      ],
    );
    assert(
      !hasParsedSchedule || task.scheduledDay != null,
      'parsed schedule must produce a scheduled task',
    );
    return _commit(reducers.addTask(next, task, todayStr: today));
  }

  Future<void> toggleDone(Task task) => _commit(
    reducers.setTaskDone(
      state,
      task.id,
      isDone: !task.isDone,
      todayStr: todayStr,
      nowMs: DateTime.now().millisecondsSinceEpoch,
    ),
  );

  Future<void> deleteTask(String taskId) =>
      _commit(reducers.deleteTask(state, taskId));

  Future<void> createProject(String title) {
    final name = title.trim();
    if (name.isEmpty) return Future.value();
    final now = DateTime.now().millisecondsSinceEpoch;
    final project = Project(
      id: _uuid.v4(),
      title: name,
      created: now,
    );
    return _commit(
      state.copyWith(projects: {...state.projects, project.id: project}),
    );
  }

  List<Task> tasksForProject(String projectId) =>
      projectTasks(state, projectId);
}
