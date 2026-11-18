import 'package:superprod/domain/app_state.dart';
import 'package:superprod/domain/models/project.dart';
import 'package:superprod/domain/models/tag.dart';
import 'package:superprod/domain/models/task.dart';
import 'package:superprod/domain/models/task_repeat_cfg.dart';

const testToday = '2026-11-18';

Task buildTask({
  String id = 't1',
  String title = 'Task',
  String projectId = '',
  List<String> tagIds = const [],
  String? dueDay,
  int? dueWithTime,
  bool isDone = false,
  int? doneOn,
  List<String> subTaskIds = const [],
  String? parentId,
  int created = 1000,
  Map<String, int> timeSpentOnDay = const {},
  int timeEstimate = 0,
  int? modified,
  String? repeatCfgId,
}) => Task(
  id: id,
  title: title,
  projectId: projectId,
  tagIds: tagIds,
  dueDay: dueDay,
  dueWithTime: dueWithTime,
  isDone: isDone,
  doneOn: doneOn,
  subTaskIds: subTaskIds,
  parentId: parentId,
  created: created,
  timeSpentOnDay: timeSpentOnDay,
  timeEstimate: timeEstimate,
  modified: modified,
  repeatCfgId: repeatCfgId,
);

Project buildProject({
  String id = 'p1',
  String title = 'Project',
  List<String> taskIds = const [],
  List<String> backlogTaskIds = const [],
  bool isArchived = false,
  bool isDone = false,
  bool isEnableBacklog = false,
}) => Project(
  id: id,
  title: title,
  taskIds: taskIds,
  backlogTaskIds: backlogTaskIds,
  isArchived: isArchived,
  isDone: isDone,
  isEnableBacklog: isEnableBacklog,
);

Tag buildTag({
  String id = 'tag1',
  String title = 'Tag',
  List<String> taskIds = const [],
}) => Tag(id: id, title: title, taskIds: taskIds, created: 1);

AppState buildState({
  List<Task> tasks = const [],
  List<Project> projects = const [],
  List<Tag> tags = const [],
  List<TaskRepeatCfg> repeatCfgs = const [],
  List<Task> archivedTasks = const [],
  String? currentTaskId,
  Map<String, Object?> config = const {},
}) => AppState(
  tasks: {for (final task in tasks) task.id: task},
  projects: {for (final project in projects) project.id: project},
  repeatCfgs: {for (final cfg in repeatCfgs) cfg.id: cfg},
  archivedTasks: {for (final task in archivedTasks) task.id: task},
  tags: {
    for (final tag in tags) tag.id: tag,
    todayTagId: Tag(
      id: todayTagId,
      title: 'Today',
      created: 0,
      taskIds: [
        for (final tag in tags)
          if (tag.id == todayTagId) ...tag.taskIds,
      ],
    ),
  },
  config: config,
  currentTaskId: currentTaskId,
);
