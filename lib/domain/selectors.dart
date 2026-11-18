import '../core/day.dart';
import 'app_state.dart';
import 'models/project.dart';
import 'models/task.dart';

/// Read models over [AppState]. Pure functions: same state + same `todayStr`
/// always produce the same lists, which is what replay determinism needs.

/// Tasks scheduled for [todayStr], ordered by the virtual Today tag's id list
/// first, then by creation. Membership is derived from the schedule; the tag
/// only stores order (upstream Decision #2).
List<Task> todayTasks(
  AppState state, {
  required String todayStr,
  bool includeDone = false,
  bool includeSubTasks = false,
}) {
  final order = state.todayTag?.taskIds ?? const <String>[];
  final candidates = [
    for (final task in state.tasks.values)
      if (task.scheduledDay == todayStr &&
          (includeDone || !task.isDone) &&
          (includeSubTasks || !task.isSubTask))
        task,
  ];
  candidates.sort((a, b) {
    final indexA = order.indexOf(a.id);
    final indexB = order.indexOf(b.id);
    if (indexA >= 0 && indexB >= 0) return indexA.compareTo(indexB);
    if (indexA >= 0) return -1;
    if (indexB >= 0) return 1;
    return a.created.compareTo(b.created);
  });
  return candidates;
}

/// Tasks completed on the logical day [todayStr], for the "completed" section.
List<Task> doneToday(AppState state, {required String todayStr}) {
  final tasks = [
    for (final task in state.tasks.values)
      if (task.isDone &&
          task.doneOn != null &&
          dbDateStrFromMs(task.doneOn!) == todayStr &&
          !task.isSubTask)
        task,
  ];
  tasks.sort((a, b) => (b.doneOn ?? 0).compareTo(a.doneOn ?? 0));
  return tasks;
}

/// Inbox: top-level tasks with no project.
List<Task> inboxTasks(AppState state, {bool includeDone = false}) => [
  for (final task in state.tasks.values)
    if (task.projectId.isEmpty &&
        !task.isSubTask &&
        (includeDone || !task.isDone))
      task,
];

/// A project's main list, in stored order.
List<Task> projectTasks(
  AppState state,
  String projectId, {
  bool includeDone = false,
}) {
  final project = state.projects[projectId];
  if (project == null) return const [];
  return [
    for (final id in project.taskIds)
      if (state.tasks[id] case final Task task)
        if (includeDone || !task.isDone) task,
  ];
}

/// Tasks whose scheduled day has passed, newest first.
List<Task> overdueTasks(AppState state, {required String todayStr}) {
  final tasks = [
    for (final task in state.tasks.values)
      if (!task.isDone &&
          !task.isSubTask &&
          task.scheduledDay != null &&
          task.scheduledDay!.compareTo(todayStr) < 0)
        task,
  ];
  tasks.sort((a, b) => b.scheduledDay!.compareTo(a.scheduledDay!));
  return tasks;
}

List<Task> subTasks(AppState state, String taskId) {
  final task = state.tasks[taskId];
  if (task == null) return const [];
  return [
    for (final id in task.subTaskIds)
      if (state.tasks[id] case final Task sub) sub,
  ];
}

/// Projects shown in the navigation: not archived, done or hidden.
List<Project> visibleProjects(AppState state) {
  final projects = [
    for (final project in state.projects.values)
      if (!project.isArchived && !project.isDone && !project.isHiddenFromMenu)
        project,
  ];
  projects.sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
  return projects;
}

/// Undone task count shown on a project tile.
int undoneTaskCount(AppState state, String projectId) => projectTasks(
  state,
  projectId,
).length;
