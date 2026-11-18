import '../../../domain/models/task.dart';

/// View-only sort choices. None of them rewrite the stored list order; a sort is
/// reset to [manual] by leaving the screen.
enum TaskSort {
  manual('Manual'),
  dueDate('Due date'),
  priority('Priority'),
  created('Created');

  const TaskSort(this.label);

  final String label;
}

/// Applies the search filter and sort to [tasks] for display.
///
/// Ties keep the stored order, so sorting never makes rows jump between two
/// tasks that compare equal.
List<Task> visibleTasks(
  List<Task> tasks, {
  required String query,
  required TaskSort sort,
}) {
  final needle = query.trim().toLowerCase();
  final filtered = needle.isEmpty
      ? tasks
      : [
          for (final task in tasks)
            if (task.title.toLowerCase().contains(needle)) task,
        ];
  if (sort == TaskSort.manual || filtered.length < 2) return filtered;

  final storedIndex = {
    for (var index = 0; index < filtered.length; index++)
      filtered[index].id: index,
  };
  final sorted = [...filtered]
    ..sort((a, b) {
      final bySort = switch (sort) {
        TaskSort.manual => 0,
        TaskSort.dueDate => _compareDueDay(a, b),
        TaskSort.priority => _comparePriority(a, b),
        TaskSort.created => b.created.compareTo(a.created),
      };
      return bySort != 0
          ? bySort
          : storedIndex[a.id]!.compareTo(storedIndex[b.id]!);
    });
  return sorted;
}

int _compareDueDay(Task a, Task b) {
  final dayA = a.scheduledDay;
  final dayB = b.scheduledDay;
  if (dayA == null || dayB == null) {
    if (dayA == dayB) return 0;
    return dayA == null ? 1 : -1;
  }
  return dayA.compareTo(dayB);
}

/// High (3) first, then medium, low, and unset last.
int _comparePriority(Task a, Task b) {
  final rankA = a.priorityRank ?? 0;
  final rankB = b.priorityRank ?? 0;
  if (rankA == rankB) return 0;
  if (rankA == 0) return 1;
  if (rankB == 0) return -1;
  return rankB.compareTo(rankA);
}
