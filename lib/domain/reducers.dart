/// Task reducers: one user intent, one state transition.
///
/// These mirror upstream's meta-reducers (see
/// `task-shared-meta-reducers/task-shared-crud.reducer.ts`): membership lists on
/// projects and tags are kept in step with the task, and the virtual Today tag
/// only ever stores ordering, never task membership in `tagIds`.
library;

import 'app_state.dart';
import 'models/project.dart';
import 'models/tag.dart';
import 'models/task.dart';

int _totalTimeSpent(Map<String, int> timeSpentOnDay) =>
    timeSpentOnDay.values.fold(0, (sum, value) => sum + value);

/// Upstream `addTaskToListAtAnchor`: insert after the anchor when it exists,
/// otherwise at the bottom (or top) of the list.
List<String> addTaskToListAtAnchor(
  List<String> ids,
  String taskId, {
  String? anchorId,
  bool isAddToBottom = true,
}) {
  final without = [
    for (final id in ids)
      if (id != taskId) id,
  ];
  if (anchorId != null) {
    final index = without.indexOf(anchorId);
    if (index >= 0) {
      return [...without]..insert(index + 1, taskId);
    }
  }
  return isAddToBottom ? [...without, taskId] : [taskId, ...without];
}

List<String> removeTaskFromList(List<String> ids, String taskId) => [
  for (final id in ids)
    if (id != taskId) id,
];

AppState addTask(
  AppState state,
  Task task, {
  required String todayStr,
  bool isAddToBottom = true,
  bool isAddToBacklog = false,
}) {
  // TODAY_TAG must never be written into task.tagIds (Decision #2).
  final tagIds = [
    for (final id in task.tagIds)
      if (id != todayTagId) id,
  ];
  final normalized = task.merged({
    'tagIds': tagIds,
    'timeSpent': _totalTimeSpent(task.timeSpentOnDay),
  });

  var tasks = {...state.tasks, normalized.id: normalized};
  var projects = state.projects;

  // Only top-level tasks are members of a project list; subtasks inherit the
  // parent's project (upstream keeps them out of `project.taskIds`).
  final project = state.projects[normalized.projectId];
  if (project != null && !normalized.isSubTask) {
    final toBacklog = isAddToBacklog && project.isEnableBacklog;
    projects = {
      ...projects,
      project.id: project.merged(
        toBacklog
            ? {
                'backlogTaskIds': addTaskToListAtAnchor(
                  project.backlogTaskIds,
                  normalized.id,
                  isAddToBottom: isAddToBottom,
                ),
              }
            : {
                'taskIds': addTaskToListAtAnchor(
                  project.taskIds,
                  normalized.id,
                  isAddToBottom: isAddToBottom,
                ),
              },
      ),
    };
  }

  // Tag membership, plus Today ordering when the task is scheduled for today.
  final tagIdsToUpdate = [
    ...tagIds,
    if (normalized.scheduledDay == todayStr) todayTagId,
  ];
  var tags = state.tags;
  for (final tagId in tagIdsToUpdate) {
    final tag = tags[tagId];
    if (tag == null) continue;
    tags = {
      ...tags,
      tagId: tag.merged({
        'taskIds': addTaskToListAtAnchor(
          tag.taskIds,
          normalized.id,
          isAddToBottom: isAddToBottom,
        ),
      }),
    };
  }

  return state.copyWith(tasks: tasks, projects: projects, tags: tags);
}

/// Applies a partial task update and all derived side effects.
///
/// [changes] uses upstream's update envelope: presence of a key means "change
/// it", `null` means "clear it".
AppState updateTask(
  AppState state,
  String taskId,
  Map<String, Object?> changes, {
  required String todayStr,
  required int nowMs,
}) {
  final current = state.tasks[taskId];
  if (current == null) return state;

  final cleaned = Map<String, Object?>.of(changes);

  var tags = state.tags;
  if (cleaned.containsKey('tagIds')) {
    tags = _updateTagMembership(
      state,
      taskId,
      current.tagIds,
      [
        for (final id in (cleaned['tagIds'] as List? ?? const []))
          if (id is String && id != todayTagId) id,
      ],
    );
  }

  var projects = state.projects;
  final movedProjectId = cleaned['projectId'] as String? ?? '';
  if (cleaned.containsKey('projectId') && !current.isSubTask) {
    projects = _moveTaskToProject(state.projects, taskId, current, movedProjectId);
  }

  // Completion bookkeeping. Upstream stamps `doneOn` on completion and clears
  // it on reopen; `wontDoOn` only counts while it equals `doneOn`.
  final isDone = cleaned['isDone'];
  if (isDone == true && !cleaned.containsKey('doneOn')) {
    cleaned['doneOn'] = nowMs;
  } else if (isDone == false) {
    cleaned['doneOn'] = null;
    cleaned['wontDoOn'] = null;
  }

  if (cleaned.containsKey('timeSpentOnDay')) {
    cleaned['timeSpent'] = _totalTimeSpent(
      {
        for (final entry
            in (cleaned['timeSpentOnDay'] as Map? ?? const {}).entries)
          if (entry.value is int) '${entry.key}': entry.value as int,
      },
    );
  }
  cleaned['modified'] = nowMs;

  final updated = current.merged(cleaned);
  final tasks = {...state.tasks, taskId: updated};

  // Subtasks inherit the parent's project; they are never list members.
  if (cleaned.containsKey('projectId') && !current.isSubTask) {
    for (final subId in current.subTaskIds) {
      final sub = tasks[subId];
      if (sub != null) {
        tasks[subId] = sub.merged({'projectId': movedProjectId});
      }
    }
  }

  // Keep Today ordering in step with the schedule. Membership is derived from
  // the due date, `TODAY_TAG.taskIds` only stores order.
  final todayTag = tags[todayTagId];
  if (todayTag != null && cleaned.containsKey('dueDay')) {
    final scheduledToday = updated.scheduledDay == todayStr;
    final list = todayTag.taskIds;
    if (scheduledToday && !list.contains(taskId)) {
      tags = {
        ...tags,
        todayTagId: todayTag.merged({
          'taskIds': [...list, taskId],
        }),
      };
    } else if (!scheduledToday && list.contains(taskId)) {
      tags = {
        ...tags,
        todayTagId: todayTag.merged({
          'taskIds': removeTaskFromList(list, taskId),
        }),
      };
    }
  }

  return state.copyWith(tasks: tasks, projects: projects, tags: tags);
}

Tag? _tag(AppState state, String id) => state.tags[id];

Map<String, Tag> _updateTagMembership(
  AppState state,
  String taskId,
  List<String> oldTagIds,
  List<String> newTagIds,
) {
  final oldSet = oldTagIds.toSet();
  final newSet = newTagIds.toSet();
  var tags = state.tags;

  for (final tagId in oldSet.difference(newSet)) {
    final tag = _tag(state, tagId);
    if (tag == null || tagId == todayTagId) continue;
    tags = {
      ...tags,
      tagId: tag.merged({'taskIds': removeTaskFromList(tag.taskIds, taskId)}),
    };
  }
  for (final tagId in newSet.difference(oldSet)) {
    final tag = _tag(state, tagId);
    if (tag == null || tagId == todayTagId) continue;
    tags = {
      ...tags,
      tagId: tag.merged({'taskIds': [taskId, ...tag.taskIds]}),
    };
  }
  return tags;
}

/// Upstream moves a task (and its subtasks) between project lists, removing all
/// previous memberships first. Backlog placement is preserved only when the
/// project stays the same; a move to another project lands in its main list.
Map<String, Project> _moveTaskToProject(
  Map<String, Project> projects,
  String taskId,
  Task current,
  String targetProjectId,
) {
  final movedIds = {taskId, ...current.subTaskIds};
  var next = projects;

  if (current.projectId.isNotEmpty) {
    final source = projects[current.projectId];
    if (source != null) {
      next = {
        ...next,
        source.id: source.merged({
          'taskIds': [
            for (final id in source.taskIds)
              if (!movedIds.contains(id)) id,
          ],
          'backlogTaskIds': [
            for (final id in source.backlogTaskIds)
              if (!movedIds.contains(id)) id,
          ],
        }),
      };
    }
  }

  final target = next[targetProjectId];
  if (target != null) {
    next = {
      ...next,
      target.id: target.merged({
        'taskIds': [taskId, ...target.taskIds],
      }),
    };
  }

  return next;
}

/// Deletes a task together with its subtasks, cleaning every membership list.
AppState deleteTask(AppState state, String taskId) {
  final task = state.tasks[taskId];
  if (task == null) return state;

  final removedIds = {taskId, ...task.subTaskIds};
  final tasks = {
    for (final entry in state.tasks.entries)
      if (!removedIds.contains(entry.key)) entry.key: entry.value,
  };

  // A surviving parent must not keep a dangling reference.
  final parentId = task.parentId;
  if (parentId != null) {
    final parent = tasks[parentId];
    if (parent != null) {
      tasks[parentId] = parent.merged({
        'subTaskIds': removeTaskFromList(parent.subTaskIds, taskId),
      });
    }
  }

  final projects = {
    for (final entry in state.projects.entries)
      entry.key: entry.value.merged({
        'taskIds': [
          for (final id in entry.value.taskIds)
            if (!removedIds.contains(id)) id,
        ],
        'backlogTaskIds': [
          for (final id in entry.value.backlogTaskIds)
            if (!removedIds.contains(id)) id,
        ],
      }),
  };

  final tags = {
    for (final entry in state.tags.entries)
      entry.key: entry.value.merged({
        'taskIds': [
          for (final id in entry.value.taskIds)
            if (!removedIds.contains(id)) id,
        ],
      }),
  };

  return state.copyWith(
    tasks: tasks,
    projects: projects,
    tags: tags,
    clearCurrentTask: removedIds.contains(state.currentTaskId),
  );
}

/// Completion helper: one intent, one update.
AppState setTaskDone(
  AppState state,
  String taskId, {
  required bool isDone,
  required String todayStr,
  required int nowMs,
}) => updateTask(
  state,
  taskId,
  {'isDone': isDone},
  todayStr: todayStr,
  nowMs: nowMs,
);
