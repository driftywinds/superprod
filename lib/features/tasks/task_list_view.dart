import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/providers.dart';
import '../../domain/models/task.dart';
import 'add_task_bar.dart';
import 'organisation/selection_action_bar.dart';
import 'organisation/task_ordering.dart';
import 'task_row.dart';

/// Shared list + capture layout for Today, Inbox and project views.
///
/// Search, sort and multi-select are view state only: the stored order is
/// written solely by an explicit drag, and sorts never touch it.
class TaskListView extends ConsumerStatefulWidget {
  const TaskListView({
    super.key,
    required this.tasks,
    required this.doneTasks,
    this.projectId = '',
    this.scheduleForToday = false,
    this.isToday = false,
    this.emptyMessage = 'Nothing here yet.',
  });

  final List<Task> tasks;
  final List<Task> doneTasks;
  final String projectId;
  final bool scheduleForToday;

  /// Marks this as the Today list for reordering. [scheduleForToday] also
  /// implies it, so existing callers keep working.
  final bool isToday;
  final String emptyMessage;

  @override
  ConsumerState<TaskListView> createState() => _TaskListViewState();
}

class _TaskListViewState extends ConsumerState<TaskListView> {
  final _searchController = TextEditingController();
  final Set<String> _selectedIds = {};
  String _query = '';
  TaskSort _sort = TaskSort.manual;

  bool get _selectionMode => _selectedIds.isNotEmpty;

  bool get _isToday => widget.isToday || widget.scheduleForToday;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _startSelection(String taskId) {
    setState(() => _selectedIds.add(taskId));
  }

  void _toggleSelection(String taskId) {
    setState(() {
      if (!_selectedIds.remove(taskId)) _selectedIds.add(taskId);
    });
  }

  void _clearSelection() {
    if (!mounted) return;
    setState(_selectedIds.clear);
  }

  void _clearSearch() {
    _searchController.clear();
    setState(() => _query = '');
  }

  /// `onReorderItem` already adjusts [newIndex] for the removed item, which is
  /// the insertion index [AppController.reorder] expects.
  void _reorder(List<Task> visible, int oldIndex, int newIndex) {
    ref
        .read(appStateProvider.notifier)
        .reorder(
          visible[oldIndex].id,
          newIndex,
          projectId: widget.projectId.isEmpty ? null : widget.projectId,
          isToday: _isToday,
        );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final visible = visibleTasks(widget.tasks, query: _query, sort: _sort);
    final canReorder =
        _sort == TaskSort.manual &&
        _query.trim().isEmpty &&
        (widget.projectId.isNotEmpty || _isToday);
    final showToolbar =
        !_selectionMode &&
        (widget.tasks.isNotEmpty ||
            widget.doneTasks.isNotEmpty ||
            _query.isNotEmpty);

    return Column(
      children: [
        if (_selectionMode)
          TaskSelectionBar(
            selectedIds: _selectedIds.toList(growable: false),
            onClose: _clearSelection,
          )
        else if (showToolbar)
          _buildToolbar(theme),
        Expanded(child: _buildList(theme, visible, canReorder)),
        AddTaskBar(
          projectId: widget.projectId,
          scheduleForToday: widget.scheduleForToday,
        ),
      ],
    );
  }

  Widget _buildToolbar(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 0),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              key: const Key('task-search'),
              controller: _searchController,
              onChanged: (value) => setState(() => _query = value),
              decoration: InputDecoration(
                isDense: true,
                hintText: 'Search tasks',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        icon: const Icon(Icons.close, size: 18),
                        onPressed: _clearSearch,
                      ),
                filled: true,
                fillColor: theme.colorScheme.surfaceContainerHighest,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
              ),
            ),
          ),
          PopupMenuButton<TaskSort>(
            key: const Key('task-sort'),
            tooltip: 'Sort',
            icon: const Icon(Icons.sort),
            initialValue: _sort,
            onSelected: (value) => setState(() => _sort = value),
            itemBuilder: (context) => [
              for (final sort in TaskSort.values)
                CheckedPopupMenuItem(
                  value: sort,
                  checked: sort == _sort,
                  child: Text(sort.label),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildList(ThemeData theme, List<Task> visible, bool canReorder) {
    final searching = _query.trim().isNotEmpty;
    if (widget.tasks.isEmpty && widget.doneTasks.isEmpty) {
      return _emptyState(
        theme,
        searching ? 'No tasks match your search.' : widget.emptyMessage,
      );
    }

    return ReorderableListView.builder(
      padding: const EdgeInsets.only(bottom: 8),
      buildDefaultDragHandles: false,
      itemCount: visible.length,
      onReorderItem: canReorder
          ? (oldIndex, newIndex) => _reorder(visible, oldIndex, newIndex)
          : (_, _) {},
      header: searching && visible.isEmpty
          ? Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'No tasks match your search.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            )
          : null,
      footer: widget.doneTasks.isEmpty
          ? null
          : _DoneSection(tasks: widget.doneTasks),
      itemBuilder: (context, index) {
        final task = visible[index];
        return TaskRow(
          key: ValueKey(task.id),
          task: task,
          showProject: widget.projectId.isEmpty,
          selected: _selectedIds.contains(task.id),
          selectionMode: _selectionMode,
          onLongPress: () => _startSelection(task.id),
          onTap: _selectionMode ? () => _toggleSelection(task.id) : null,
          dragHandle: canReorder
              ? ReorderableDragStartListener(
                  index: index,
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 4),
                    child: Icon(Icons.drag_handle),
                  ),
                )
              : null,
        );
      },
    );
  }

  Widget _emptyState(ThemeData theme, String message) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: theme.textTheme.bodyMedium?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
    ),
  );
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
