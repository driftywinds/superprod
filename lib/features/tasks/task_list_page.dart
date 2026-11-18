import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../data/db/database.dart';
import '../../data/providers.dart';
import '../tasks/add_task_sheet.dart';

/// A task list shared by Today, Inbox and project views.
class TaskListPage extends ConsumerWidget {
  const TaskListPage({
    super.key,
    required this.title,
    required this.tasks,
    required this.emptyTitle,
    required this.emptyHint,
    this.showDone = false,
    this.projectId,
  });

  final String title;
  final AsyncValue<List<Task>> tasks;
  final String emptyTitle;
  final String emptyHint;
  final bool showDone;
  final String? projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final done = showDone ? ref.watch(doneTodayProvider) : null;

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [
          IconButton(
            tooltip: 'Add task',
            icon: const Icon(Icons.add),
            onPressed: () => showAddTaskSheet(context, ref, projectId: projectId),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => showAddTaskSheet(context, ref, projectId: projectId),
        child: const Icon(Icons.add),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(todayTasksProvider),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
          children: [
            _AddBar(onTap: () => showAddTaskSheet(context, ref, projectId: projectId)),
            const SizedBox(height: 12),
            tasks.when(
              data: (items) => items.isEmpty
                  ? _Empty(title: emptyTitle, hint: emptyHint)
                  : Column(children: [for (final task in items) TaskTile(task: task)]),
              loading: () => const _Loading(),
              error: (error, _) => _Empty(title: 'Could not load tasks', hint: '$error'),
            ),
            if (done != null)
              done.when(
                data: (items) => items.isEmpty
                    ? const SizedBox.shrink()
                    : Padding(
                        padding: const EdgeInsets.only(top: 24),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Completed today (${items.length})',
                              style: const TextStyle(
                                fontSize: 12,
                                letterSpacing: 0.6,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 8),
                            for (final task in items) TaskTile(task: task, muted: true),
                          ],
                        ),
                      ),
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
              ),
          ],
        ),
      ),
    );
  }
}

class _AddBar extends StatelessWidget {
  const _AddBar({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFF232323)),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              const Icon(Icons.add, size: 18, color: Color(0xFF5C5C5C)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text('Add a task…', style: TextStyle(color: Color(0xFF9A9A9A))),
                    SizedBox(height: 2),
                    Text(
                      '#tag · +project · p1 · 1h · @tomorrow',
                      style: TextStyle(fontSize: 11, color: Color(0xFF5C5C5C)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}

/// One task row: checkbox, title, and the metadata chips that matter daily.
class TaskTile extends ConsumerWidget {
  const TaskTile({super.key, required this.task, this.muted = false});

  final Task task;
  final bool muted;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(tasksRepositoryProvider);
    final tags = task.tagIds.isEmpty ? const <String>[] : task.tagIds.split(',');

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Checkbox(
            value: task.isDone,
            onChanged: (value) => repo.setDone(value ?? false, task.id),
            shape: const CircleBorder(),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(
                    task.title,
                    style: TextStyle(
                      fontSize: 15,
                      color: muted ? const Color(0xFF9A9A9A) : const Color(0xFFF2F2F2),
                      decoration: task.isDone ? TextDecoration.lineThrough : null,
                    ),
                  ),
                ),
                if (tags.isNotEmpty || task.timeEstimate > 0 || task.dueWithTime != null || task.dueDay != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6, bottom: 4),
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        if (task.dueWithTime != null)
                          _Chip(
                            icon: Icons.schedule,
                            label: DateFormat.Hm().format(
                              DateTime.fromMillisecondsSinceEpoch(task.dueWithTime!),
                            ),
                          )
                        else if (task.dueDay != null)
                          _Chip(icon: Icons.today, label: _dayLabel(task.dueDay!)),
                        if (task.timeEstimate > 0)
                          _Chip(
                            icon: Icons.timer_outlined,
                            label: _duration(task.timeEstimate),
                          ),
                        for (final tag in tags) _Chip(icon: Icons.tag, label: tag),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _dayLabel(String day) {
    final today = DateTime.now();
    final parsed = DateTime.tryParse(day);
    if (parsed == null) return day;
    final diff = DateTime(parsed.year, parsed.month, parsed.day)
        .difference(DateTime(today.year, today.month, today.day))
        .inDays;
    return switch (diff) {
      0 => 'Today',
      1 => 'Tomorrow',
      -1 => 'Yesterday',
      _ => DateFormat.MMMd().format(parsed),
    };
  }

  static String _duration(int ms) {
    final minutes = (ms / 60000).round();
    if (minutes < 60) return '${minutes}m';
    final hours = minutes ~/ 60;
    final rest = minutes % 60;
    return rest == 0 ? '${hours}h' : '${hours}h ${rest}m';
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: const Color(0xFF141414),
          border: Border.all(color: const Color(0xFF232323)),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 11, color: const Color(0xFF5C5C5C)),
            const SizedBox(width: 4),
            Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF9A9A9A))),
          ],
        ),
      );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.title, required this.hint});

  final String title;
  final String hint;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 48),
        child: Column(
          children: [
            Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(
              hint,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: Color(0xFF9A9A9A)),
            ),
          ],
        ),
      );
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.symmetric(vertical: 48),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
}
