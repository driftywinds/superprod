import '../core/day.dart';
import 'models/project.dart';
import 'models/tag.dart';
import 'models/task.dart';
import 'models/task_repeat_cfg.dart';

/// The whole persisted application state.
///
/// Shape follows upstream: entities live in maps keyed by id, and list
/// membership lives on the parent (`Project.taskIds`, `Tag.taskIds`) — the task
/// itself only stores `projectId`, never "which lists I am in".
class AppState {
  const AppState({
    this.tasks = const {},
    this.projects = const {},
    this.tags = const {},
    this.repeatCfgs = const {},
    this.archivedTasks = const {},
    this.config = const {},
    this.currentTaskId,
  });

  final Map<String, Task> tasks;
  final Map<String, Project> projects;
  final Map<String, Tag> tags;
  final Map<String, TaskRepeatCfg> repeatCfgs;

  /// Archived tasks, keyed by id. Archived tasks are out of every live list.
  final Map<String, Task> archivedTasks;

  /// Global config, raw. Only keys this client understands are read today;
  /// unknown keys are preserved for parity with synced data.
  final Map<String, Object?> config;

  final String? currentTaskId;

  factory AppState.initial({required String todayStr, required int nowMs}) {
    final today = Tag(
      id: todayTagId,
      title: 'Today',
      created: nowMs,
      icon: 'wb_sunny',
      theme: const {'primary': '#6495ED'},
    );
    return AppState(
      tags: {today.id: today},
      config: const {
        'startOfNextDay': 0,
        'startOfNextDayTime': '00:00',
      },
    );
  }

  Task? task(String id) => tasks[id];
  Project? project(String id) => projects[id];
  Tag? tag(String id) => tags[id];

  Tag? get todayTag => tags[todayTagId];

  /// Logical-day helper for the configured start of the next day.
  DayCalendar calendar() => DayCalendar(
    startOfNextDayDiffMs(
      time: switch (config['startOfNextDayTime']) {
        final String value => value,
        _ => null,
      },
      legacyHour: switch (config['startOfNextDay']) {
        final int value => value,
        _ => null,
      },
    ),
  );

  AppState copyWith({
    Map<String, Task>? tasks,
    Map<String, Project>? projects,
    Map<String, Tag>? tags,
    Map<String, TaskRepeatCfg>? repeatCfgs,
    Map<String, Task>? archivedTasks,
    Map<String, Object?>? config,
    String? currentTaskId,
    bool clearCurrentTask = false,
  }) => AppState(
    tasks: tasks ?? this.tasks,
    projects: projects ?? this.projects,
    tags: tags ?? this.tags,
    repeatCfgs: repeatCfgs ?? this.repeatCfgs,
    archivedTasks: archivedTasks ?? this.archivedTasks,
    config: config ?? this.config,
    currentTaskId: clearCurrentTask ? null : (currentTaskId ?? this.currentTaskId),
  );

  Map<String, Object?> toJson() => {
    'schemaVersion': schemaVersion,
    'tasks': {for (final entry in tasks.entries) entry.key: entry.value.toJson()},
    'projects': {
      for (final entry in projects.entries) entry.key: entry.value.toJson(),
    },
    'tags': {for (final entry in tags.entries) entry.key: entry.value.toJson()},
    'repeatCfgs': {
      for (final entry in repeatCfgs.entries) entry.key: entry.value.toJson(),
    },
    'archivedTasks': {
      for (final entry in archivedTasks.entries)
        entry.key: entry.value.toJson(),
    },
    'config': config,
    if (currentTaskId != null) 'currentTaskId': currentTaskId,
  };

  factory AppState.fromJson(Map<String, Object?> json) => AppState(
    tasks: {
      for (final entry in (json['tasks'] as Map? ?? const {}).entries)
        '${entry.key}': Task.fromJson((entry.value as Map).cast<String, Object?>()),
    },
    projects: {
      for (final entry in (json['projects'] as Map? ?? const {}).entries)
        '${entry.key}':
            Project.fromJson((entry.value as Map).cast<String, Object?>()),
    },
    tags: {
      for (final entry in (json['tags'] as Map? ?? const {}).entries)
        '${entry.key}': Tag.fromJson((entry.value as Map).cast<String, Object?>()),
    },
    repeatCfgs: {
      for (final entry in (json['repeatCfgs'] as Map? ?? const {}).entries)
        '${entry.key}':
            TaskRepeatCfg.fromJson((entry.value as Map).cast<String, Object?>()),
    },
    archivedTasks: {
      for (final entry in (json['archivedTasks'] as Map? ?? const {}).entries)
        '${entry.key}': Task.fromJson((entry.value as Map).cast<String, Object?>()),
    },
    config: (json['config'] as Map? ?? const {}).cast<String, Object?>(),
    currentTaskId: json['currentTaskId'] as String?,
  );

  /// Upstream's current operation-log schema version.
  static const schemaVersion = 4;
}
