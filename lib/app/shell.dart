import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../data/providers.dart';
import '../features/planner/planner_page.dart';
import '../features/settings/settings_page.dart';
import '../features/tasks/task_list_page.dart';
import '../features/metrics/metrics_page.dart';

/// App shell: five destinations, a drawer for projects, and a back gesture that
/// unwinds tabs instead of closing the app.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  int _index = 0;

  static const _titles = ['Today', 'Inbox', 'Planner', 'Metrics', 'Settings'];

  @override
  Widget build(BuildContext context) {
    final today = ref.watch(todayTasksProvider);
    final inbox = ref.watch(inboxTasksProvider);

    return PopScope(
      // Back from any other tab returns to Today; only Today leaves the app.
      canPop: _index == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _index != 0) setState(() => _index = 0);
      },
      child: Scaffold(
        appBar: _index == 4
            ? null
            : AppBar(
                title: Text(_titles[_index]),
                actions: [
                  IconButton(
                    tooltip: 'Settings',
                    icon: const Icon(Icons.settings_outlined),
                    onPressed: () => setState(() => _index = 4),
                  ),
                ],
              ),
        drawer: _ProjectDrawer(onOpenToday: () => setState(() => _index = 0)),
        body: IndexedStack(
          index: _index,
          children: [
            TaskListPage(
              title: 'Today',
              tasks: today,
              showDone: true,
              emptyTitle: 'Nothing planned for today',
              emptyHint: 'Add a task, or schedule one with @today.',
            ),
            TaskListPage(
              title: 'Inbox',
              tasks: inbox,
              projectId: 'INBOX',
              emptyTitle: 'Inbox is clear',
              emptyHint: 'Capture anything here; schedule it later.',
            ),
            const PlannerPage(),
            const MetricsPage(),
            const SettingsPage(),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: (value) => setState(() => _index = value),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.check), label: 'Today'),
            NavigationDestination(icon: Icon(Icons.inbox_outlined), label: 'Inbox'),
            NavigationDestination(icon: Icon(Icons.calendar_today_outlined), label: 'Planner'),
            NavigationDestination(icon: Icon(Icons.insights_outlined), label: 'Metrics'),
            NavigationDestination(icon: Icon(Icons.settings_outlined), label: 'Settings'),
          ],
        ),
      ),
    );
  }
}

class _ProjectDrawer extends ConsumerWidget {
  const _ProjectDrawer({required this.onOpenToday});

  final VoidCallback onOpenToday;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = ref.watch(projectsProvider);

    return Drawer(
      backgroundColor: const Color(0xFF000000),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
              child: Row(
                children: [
                  SvgPicture.asset('assets/brand/logo-transparent.svg', width: 20, height: 20),
                  const SizedBox(width: 10),
                  const Text(
                    'superprod',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18, letterSpacing: -0.3),
                  ),
                ],
              ),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.check),
              title: const Text('Today'),
              onTap: () {
                Navigator.of(context).pop();
                onOpenToday();
              },
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 18, 16, 6),
              child: Text(
                'PROJECTS',
                style: TextStyle(
                  fontSize: 11,
                  letterSpacing: 1.2,
                  color: Color(0xFF5C5C5C),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Expanded(
              child: projects.when(
                data: (items) => ListView(
                  children: [
                    for (final project in items)
                      ListTile(
                        leading: Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: project.color == null
                                ? const Color(0xFF9A9A9A)
                                : Color(int.parse(project.color!.replaceFirst('#', 'FF'), radix: 16)),
                            shape: BoxShape.circle,
                          ),
                        ),
                        title: Text(project.title),
                      ),
                  ],
                ),
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
