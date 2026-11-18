import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/providers.dart';
import '../tasks/task_list_page.dart' show TaskTile;

/// Metrics. Counts and charts come next; today's real numbers are shown now so
/// the numbers are never invented.
class MetricsPage extends ConsumerWidget {
  const MetricsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final done = ref.watch(doneTodayProvider);
    final today = ref.watch(todayTasksProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Metrics')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Row(
            children: [
              Expanded(
                child: _Card(
                  label: 'completed today',
                  value: done.maybeWhen(data: (items) => '${items.length}', orElse: () => '—'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Card(
                  label: 'open today',
                  value: today.maybeWhen(data: (items) => '${items.length}', orElse: () => '—'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          const Text(
            'Charts are next',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          const Text(
            'Daily tracked time, heatmap and estimate accuracy follow once time '
            'tracking lands. No invented productivity score.',
            style: TextStyle(fontSize: 13, color: Color(0xFF9A9A9A), height: 1.4),
          ),
          const SizedBox(height: 24),
          done.maybeWhen(
            data: (items) => items.isEmpty
                ? const SizedBox.shrink()
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'DONE TODAY',
                        style: TextStyle(fontSize: 11, letterSpacing: 1.2, color: Color(0xFF5C5C5C)),
                      ),
                      for (final task in items) TaskTile(task: task, muted: true),
                    ],
                  ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF0B0B0B),
          border: Border.all(color: const Color(0xFF232323)),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w600)),
            const SizedBox(height: 2),
            Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF5C5C5C))),
          ],
        ),
      );
}
