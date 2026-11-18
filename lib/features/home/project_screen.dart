import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/providers.dart';
import '../../domain/selectors.dart';
import '../tasks/task_list_view.dart';

class ProjectScreen extends ConsumerWidget {
  const ProjectScreen({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appStateProvider);
    final project = state.project(projectId);
    if (project == null) {
      return const Scaffold(body: Center(child: Text('Project not found')));
    }
    final tasks = projectTasks(state, projectId);
    final done = projectTasks(state, projectId, includeDone: true)
        .where((task) => task.isDone)
        .toList(growable: false);

    return Scaffold(
      appBar: AppBar(title: Text(project.title)),
      body: TaskListView(
        tasks: tasks,
        doneTasks: done,
        projectId: projectId,
        emptyMessage: 'No tasks in this project.',
      ),
    );
  }
}
