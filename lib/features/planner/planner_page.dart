import 'package:material_ui/material_ui.dart';

/// Planner. The date wheel and day agenda land in the next build; the shape is
/// fixed here so the navigation and layout are real from day one.
class PlannerPage extends StatelessWidget {
  const PlannerPage({super.key});

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final monday = now.subtract(Duration(days: now.weekday - 1));

    return Scaffold(
      appBar: AppBar(title: const Text('Planner')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          const Text(
            'This week',
            style: TextStyle(fontSize: 12, letterSpacing: 1.2, color: Color(0xFF5C5C5C)),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              for (var i = 0; i < 7; i++)
                Builder(builder: (_) {
                  final day = monday.add(Duration(days: i));
                  final isToday = day.day == now.day && day.month == now.month;
                  return Column(
                    children: [
                      Text(
                        ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i],
                        style: const TextStyle(fontSize: 10, color: Color(0xFF5C5C5C)),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        width: 34,
                        height: 34,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isToday ? const Color(0xFF3094DE) : Colors.transparent,
                        ),
                        child: Text(
                          '${day.day}',
                          style: TextStyle(
                            fontWeight: isToday ? FontWeight.w700 : FontWeight.w500,
                            color: isToday ? Colors.black : const Color(0xFFF2F2F2),
                          ),
                        ),
                      ),
                    ],
                  );
                }),
            ],
          ),
          const SizedBox(height: 32),
          const Text(
            'The planner is being rebuilt',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          const Text(
            'Next build adds the scrollable date wheel, all-day and timed items, '
            'and planning straight from any task.',
            style: TextStyle(fontSize: 13, color: Color(0xFF9A9A9A), height: 1.4),
          ),
        ],
      ),
    );
  }
}
