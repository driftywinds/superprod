import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/providers.dart';
import '../../domain/models/task.dart';

class TaskRow extends ConsumerWidget {
  const TaskRow({super.key, required this.task, this.showProject = true});

  final Task task;

  /// Show the project name on rows outside a project view.
  final bool showProject;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final project = showProject && task.projectId.isNotEmpty
        ? ref.watch(appStateProvider).project(task.projectId)
        : null;

    return ListTile(
      dense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 8),
      leading: Checkbox(
        value: task.isDone,
        shape: const CircleBorder(),
        onChanged: (_) => ref.read(appStateProvider.notifier).toggleDone(task),
      ),
      title: Text(
        task.title,
        style: task.isDone
            ? theme.textTheme.bodyLarge?.copyWith(
                decoration: TextDecoration.lineThrough,
                color: theme.colorScheme.onSurfaceVariant,
              )
            : theme.textTheme.bodyLarge,
      ),
      subtitle: project == null
          ? null
          : Text(
              project.title,
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.primary,
              ),
            ),
      trailing: PopupMenuButton<String>(
        tooltip: 'Task actions',
        onSelected: (value) {
          if (value == 'delete') {
            ref.read(appStateProvider.notifier).deleteTask(task.id);
          }
        },
        itemBuilder: (context) => const [
          PopupMenuItem(value: 'delete', child: Text('Delete')),
        ],
      ),
    );
  }
}
