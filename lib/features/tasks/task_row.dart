import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/providers.dart';
import '../../domain/models/task.dart';
import 'detail/task_detail_screen.dart';

class TaskRow extends ConsumerWidget {
  const TaskRow({
    super.key,
    required this.task,
    this.showProject = true,
    this.selected = false,
    this.selectionMode = false,
    this.onTap,
    this.onLongPress,
    this.dragHandle,
  });

  final Task task;

  /// Show the project name on rows outside a project view.
  final bool showProject;

  /// Highlighted while multi-select is active and this row is picked.
  final bool selected;

  /// While true the leading checkbox reflects [selected] instead of completion.
  final bool selectionMode;

  /// Overrides the default "open details" tap. Used to toggle selection.
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  /// ReorderableList drag handle, injected by the list so only the main
  /// (undone) list is draggable.
  final Widget? dragHandle;

  void _openDetails(BuildContext context) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => TaskDetailScreen(taskId: task.id),
    ),
  );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final project = showProject && task.projectId.isNotEmpty
        ? ref.watch(appStateProvider).project(task.projectId)
        : null;

    return ListTile(
      dense: true,
      selected: selected,
      selectedTileColor: theme.colorScheme.secondaryContainer.withValues(
        alpha: 0.45,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 8),
      onTap: onTap ?? () => _openDetails(context),
      onLongPress: onLongPress,
      leading: Checkbox(
        value: selectionMode ? selected : task.isDone,
        shape: const CircleBorder(),
        onChanged: (_) {
          if (selectionMode) {
            onTap?.call();
            return;
          }
          ref.read(appStateProvider.notifier).toggleDone(task);
        },
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
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ?dragHandle,
          if (!selectionMode)
            PopupMenuButton<String>(
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
        ],
      ),
    );
  }
}
