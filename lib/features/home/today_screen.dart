import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/providers.dart';
import '../../domain/selectors.dart';
import '../tasks/task_list_view.dart';

class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appStateProvider);
    final today = state.calendar().todayStr(DateTime.now());
    final tasks = todayTasks(state, todayStr: today);

    return Scaffold(
      appBar: AppBar(title: const Text('Today')),
      body: TaskListView(
        tasks: tasks,
        doneTasks: doneToday(state, todayStr: today),
        scheduleForToday: true,
        emptyMessage: 'Nothing planned for today.\nAdd a task to start.',
      ),
    );
  }
}

class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appStateProvider);
    final tasks = inboxTasks(state);
    final done = inboxTasks(state, includeDone: true)
        .where((task) => task.isDone)
        .toList(growable: false);

    return Scaffold(
      appBar: AppBar(title: const Text('Inbox')),
      body: TaskListView(
        tasks: tasks,
        doneTasks: done,
        emptyMessage: 'Inbox is empty.',
      ),
    );
  }
}
