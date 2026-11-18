import 'package:material_ui/material_ui.dart';

import '../../domain/models/task.dart';
import 'add_task_bar.dart';
import 'task_row.dart';

/// Shared list + capture layout for Today, Inbox and project views.
class TaskListView extends StatelessWidget {
  const TaskListView({
    super.key,
    required this.tasks,
    required this.doneTasks,
    this.projectId = '',
    this.scheduleForToday = false,
    this.emptyMessage = 'Nothing here yet.',
  });

  final List<Task> tasks;
  final List<Task> doneTasks;
  final String projectId;
  final bool scheduleForToday;
  final String emptyMessage;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Expanded(
          child: tasks.isEmpty && doneTasks.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Text(
                      emptyMessage,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.only(bottom: 8),
                  children: [
                    for (final task in tasks)
                      TaskRow(
                        key: ValueKey(task.id),
                        task: task,
                        showProject: projectId.isEmpty,
                      ),
                    if (doneTasks.isNotEmpty)
                      _DoneSection(tasks: doneTasks),
                  ],
                ),
        ),
        AddTaskBar(
          projectId: projectId,
          scheduleForToday: scheduleForToday,
        ),
      ],
    );
  }
}

class _DoneSection extends StatelessWidget {
  const _DoneSection({required this.tasks});

  final List<Task> tasks;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ExpansionTile(
      title: Text(
        'Completed (${tasks.length})',
        style: theme.textTheme.labelLarge?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
      tilePadding: const EdgeInsets.symmetric(horizontal: 16),
      childrenPadding: EdgeInsets.zero,
      children: [
        for (final task in tasks) TaskRow(key: ValueKey(task.id), task: task),
      ],
    );
  }
}
