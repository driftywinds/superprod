import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/providers.dart';
import '../../../domain/selectors.dart';

/// Top bar shown while rows are selected. Owns the batch actions; the parent
/// owns which rows are selected and clears the selection after each action.
class TaskSelectionBar extends ConsumerWidget {
  const TaskSelectionBar({
    super.key,
    required this.selectedIds,
    required this.onClose,
  });

  final List<String> selectedIds;
  final VoidCallback onClose;

  Future<void> _complete(WidgetRef ref, BuildContext context) async {
    await ref.read(appStateProvider.notifier).batchSetDone(selectedIds, true);
    if (!context.mounted) return;
    onClose();
  }

  Future<void> _delete(WidgetRef ref, BuildContext context) async {
    final count = selectedIds.length;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete tasks?'),
        content: Text(
          count == 1
              ? 'The selected task will be deleted.'
              : '$count selected tasks will be deleted.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    await ref.read(appStateProvider.notifier).batchDelete(selectedIds);
    if (!context.mounted) return;
    onClose();
  }

  Future<void> _moveToProject(
    WidgetRef ref,
    BuildContext context,
    String projectId,
  ) async {
    await ref
        .read(appStateProvider.notifier)
        .batchMoveToProject(selectedIds, projectId);
    if (!context.mounted) return;
    onClose();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final projects = visibleProjects(ref.watch(appStateProvider));
    final count = selectedIds.length;

    return Material(
      color: theme.colorScheme.secondaryContainer,
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            IconButton(
              tooltip: 'Cancel selection',
              icon: const Icon(Icons.close),
              onPressed: onClose,
            ),
            Expanded(
              child: Text(
                '$count selected',
                style: theme.textTheme.titleSmall,
              ),
            ),
            IconButton(
              tooltip: 'Complete',
              icon: const Icon(Icons.done_all),
              onPressed: () => _complete(ref, context),
            ),
            if (projects.isNotEmpty)
              PopupMenuButton<String>(
                tooltip: 'Move to project',
                icon: const Icon(Icons.drive_file_move_outline),
                onSelected: (projectId) =>
                    _moveToProject(ref, context, projectId),
                itemBuilder: (context) => [
                  for (final project in projects)
                    PopupMenuItem(value: project.id, child: Text(project.title)),
                ],
              ),
            IconButton(
              tooltip: 'Delete',
              icon: const Icon(Icons.delete_outline),
              onPressed: () => _delete(ref, context),
            ),
          ],
        ),
      ),
    );
  }
}
