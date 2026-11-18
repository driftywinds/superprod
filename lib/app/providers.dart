import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../data/local_store.dart';
import '../domain/app_state.dart';
import '../domain/models/project.dart';
import '../domain/models/tag.dart';
import '../domain/models/task.dart';
import '../domain/models/task_repeat_cfg.dart';
import '../domain/recurrence_engine.dart';
import '../domain/reducers.dart' as reducers;
import '../domain/selectors.dart';
import '../domain/short_syntax.dart';
import '../services/reminders.dart';

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

  Future<void> toggleDone(Task task) async {
    final now = DateTime.now();
    final today = todayStr;
    var next = reducers.setTaskDone(
      state,
      task.id,
      isDone: !task.isDone,
      todayStr: today,
      nowMs: now.millisecondsSinceEpoch,
    );
    if (!task.isDone) {
      next = onRecurringTaskCompleted(
        next,
        task,
        todayStr: today,
        nowMs: now.millisecondsSinceEpoch,
        newId: () => _uuid.v4(),
        startOfNextDayDiffMs: state.calendar().startOfNextDayDiffMs,
      );
      await Reminders.cancel(task.id);
    }
    await _commit(next);
  }

  Future<void> deleteTask(String taskId) async {
    await Reminders.cancel(taskId);
    await _commit(reducers.deleteTask(state, taskId));
  }

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

  /// Creates a tag and returns its id, for pickers that need it immediately.
  Future<String?> createTag(String title) async {
    final name = title.trim();
    if (name.isEmpty) return null;
    final existing = state.tags.values
        .where((tag) => tag.id != todayTagId)
        .cast<Tag?>()
        .firstWhere(
          (tag) => tag!.title.toLowerCase() == name.toLowerCase(),
          orElse: () => null,
        );
    if (existing != null) return existing.id;
    final tag = Tag(
      id: _uuid.v4(),
      title: name,
      created: DateTime.now().millisecondsSinceEpoch,
    );
    await _commit(state.copyWith(tags: {...state.tags, tag.id: tag}));
    return tag.id;
  }

  List<Task> tasksForProject(String projectId) =>
      projectTasks(state, projectId);

  /// Partial update of one task. Used by the detail screen for title, notes,
  /// estimate, schedule, deadline, tags and project.
  Future<void> updateTaskFields(String taskId, Map<String, Object?> changes) =>
      _commit(
        reducers.updateTask(
          state,
          taskId,
          changes,
          todayStr: todayStr,
          nowMs: DateTime.now().millisecondsSinceEpoch,
        ),
      );

  Future<void> addSubTask(String parentId, String title) {
    final name = title.trim();
    if (name.isEmpty) return Future.value();
    final now = DateTime.now().millisecondsSinceEpoch;
    final subTask = Task(
      id: _uuid.v4(),
      title: name,
      created: now,
      parentId: parentId,
      projectId: state.tasks[parentId]?.projectId ?? '',
    );
    return _commit(reducers.addSubTask(state, parentId, subTask, nowMs: now));
  }

  Future<void> duplicateTask(String taskId) => _commit(
    reducers.duplicateTask(
      state,
      taskId,
      nowMs: DateTime.now().millisecondsSinceEpoch,
      newId: () => _uuid.v4(),
    ),
  );

  Future<void> archiveTask(String taskId) async {
    await Reminders.cancel(taskId);
    await _commit(
      reducers.archiveTask(
        state,
        taskId,
        nowMs: DateTime.now().millisecondsSinceEpoch,
      ),
    );
  }

  Future<void> reorder(
    String taskId,
    int newIndex, {
    String? projectId,
    String? tagId,
    bool isToday = false,
  }) {
    final next = projectId != null
        ? reducers.reorderInProject(state, projectId, taskId, newIndex)
        : tagId != null
        ? reducers.reorderInTag(state, tagId, taskId, newIndex)
        : isToday
        ? reducers.reorderInTag(state, todayTagId, taskId, newIndex)
        : state;
    return _commit(next);
  }

  Future<void> batchSetDone(Iterable<String> taskIds, bool isDone) {
    var next = state;
    final now = DateTime.now().millisecondsSinceEpoch;
    final today = todayStr;
    for (final id in taskIds) {
      next = reducers.updateTask(
        next,
        id,
        {'isDone': isDone},
        todayStr: today,
        nowMs: now,
      );
    }
    return _commit(next);
  }

  Future<void> batchDelete(Iterable<String> taskIds) {
    var next = state;
    for (final id in taskIds) {
      next = reducers.deleteTask(next, id);
    }
    return _commit(next);
  }

  Future<void> batchMoveToProject(Iterable<String> taskIds, String projectId) {
    var next = state;
    final now = DateTime.now().millisecondsSinceEpoch;
    for (final id in taskIds) {
      next = reducers.updateTask(
        next,
        id,
        {'projectId': projectId},
        todayStr: todayStr,
        nowMs: now,
      );
    }
    return _commit(next);
  }

  Future<void> setRemindAt(String taskId, DateTime? at) async {
    final task = state.tasks[taskId];
    await updateTaskFields(taskId, {'remindAt': at?.millisecondsSinceEpoch});
    if (task == null) return;
    if (at == null) {
      await Reminders.cancel(taskId);
    } else {
      await Reminders.schedule(taskId: taskId, taskTitle: task.title, at: at);
    }
  }

  /// Attaches a new repeat config to [taskId] and creates the next instance
  /// when the schedule calls for one.
  Future<void> addRepeatCfg(String taskId, TaskRepeatCfg cfg) async {
    final now = DateTime.now();
    final task = state.tasks[taskId];
    var next = state.copyWith(
      repeatCfgs: {...state.repeatCfgs, cfg.id: cfg},
      tasks: task == null
          ? state.tasks
          : {
              ...state.tasks,
              taskId: task.merged({
                'repeatCfgId': cfg.id,
                'modified': now.millisecondsSinceEpoch,
              }),
            },
    );
    next = sweepRecurringTasks(
      next,
      todayStr: todayStr,
      nowMs: now.millisecondsSinceEpoch,
      newId: () => _uuid.v4(),
      startOfNextDayDiffMs: state.calendar().startOfNextDayDiffMs,
    );
    await _commit(next);
  }

  Future<void> updateRepeatCfg(TaskRepeatCfg cfg) async {
    final now = DateTime.now();
    var next = state.copyWith(repeatCfgs: {...state.repeatCfgs, cfg.id: cfg});
    next = sweepRecurringTasks(
      next,
      todayStr: todayStr,
      nowMs: now.millisecondsSinceEpoch,
      newId: () => _uuid.v4(),
      startOfNextDayDiffMs: state.calendar().startOfNextDayDiffMs,
    );
    await _commit(next);
  }

  /// Detaches and deletes the repeat config of [taskId].
  Future<void> removeRepeatCfg(String taskId) {
    final task = state.tasks[taskId];
    final cfgId = task?.repeatCfgId;
    if (task == null || cfgId == null) return Future.value();
    return _commit(
      state.copyWith(
        repeatCfgs: {
          for (final entry in state.repeatCfgs.entries)
            if (entry.key != cfgId) entry.key: entry.value,
        },
        tasks: {
          ...state.tasks,
          taskId: task.merged({
            'repeatCfgId': null,
            'modified': DateTime.now().millisecondsSinceEpoch,
          }),
        },
      ),
    );
  }

  TaskRepeatCfg? repeatCfgFor(Task task) =>
      task.repeatCfgId == null ? null : state.repeatCfgs[task.repeatCfgId];
}
