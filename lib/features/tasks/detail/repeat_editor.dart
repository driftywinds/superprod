import 'package:material_ui/material_ui.dart';
import 'package:uuid/uuid.dart';

import '../../../core/day.dart';
import '../../../domain/models/task.dart';
import '../../../domain/models/task_repeat_cfg.dart';
import '../../../domain/recurrence.dart';

/// Result of the repeat editor: save [cfg], or remove the series.
class RepeatEdit {
  const RepeatEdit.save(TaskRepeatCfg this.cfg) : remove = false;
  const RepeatEdit.remove() : cfg = null, remove = true;

  final TaskRepeatCfg? cfg;
  final bool remove;
}

const _presets = <(String, String)>[
  ('DAILY', 'Daily'),
  ('WEEKLY_CURRENT_WEEKDAY', 'Weekly'),
  ('MONDAY_TO_FRIDAY', 'Weekdays'),
  ('MONTHLY_CURRENT_DATE', 'Monthly'),
  ('MONTHLY_FIRST_DAY', '1st of month'),
  ('MONTHLY_LAST_DAY', 'Last day'),
  ('MONTHLY_NTH_WEEKDAY', 'Nth weekday'),
  ('YEARLY_CURRENT_DATE', 'Yearly'),
  ('CUSTOM', 'Custom'),
];

const _weekdayKeys = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

Future<RepeatEdit?> showRepeatEditor(
  BuildContext context, {
  required Task task,
  required TaskRepeatCfg? initial,
}) => showDialog<RepeatEdit>(
  context: context,
  builder: (_) => _RepeatEditor(task: task, initial: initial),
);

class _RepeatEditor extends StatefulWidget {
  const _RepeatEditor({required this.task, required this.initial});

  final Task task;
  final TaskRepeatCfg? initial;

  @override
  State<_RepeatEditor> createState() => _RepeatEditorState();
}

class _RepeatEditorState extends State<_RepeatEditor> {
  static const _uuid = Uuid();

  late TaskRepeatCfg _cfg;
  late final TextEditingController _every;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _cfg =
        widget.initial ??
        TaskRepeatCfg(
          id: _uuid.v4(),
          projectId: widget.task.projectId.isEmpty
              ? null
              : widget.task.projectId,
          title: widget.task.title,
          notes: widget.task.notes,
          tagIds: widget.task.tagIds,
          defaultEstimate: widget.task.timeEstimate,
          priority: widget.task.priority,
          quickSetting: 'DAILY',
          repeatCycle: 'DAILY',
          startDate: widget.task.scheduledDay ?? dbDateStr(now),
        );
    _every = TextEditingController(text: '${_cfg.repeatEvery}');
  }

  @override
  void dispose() {
    _every.dispose();
    super.dispose();
  }

  void _applyPreset(String preset) {
    if (preset == 'CUSTOM') {
      setState(() => _cfg = _cfg.merged({'quickSetting': 'CUSTOM'}));
      return;
    }
    final anchor =
        DateTime.tryParse(_cfg.startDate ?? '') ?? DateTime.now();
    setState(() {
      _cfg = applyQuickSetting(
        _cfg.merged({'quickSetting': preset}),
        preset,
        now: anchor,
      );
    });
    _every.text = '${_cfg.repeatEvery}';
  }

  void _setCycle(String? cycle) {
    if (cycle == null || cycle == _cfg.repeatCycle) return;
    setState(() {
      _cfg = _cfg.merged({
        'repeatCycle': cycle,
        'quickSetting': 'CUSTOM',
      });
    });
  }

  void _setEvery(String value) {
    final every = int.tryParse(value);
    if (every == null || every < 1) return;
    setState(() {
      _cfg = _cfg.merged({
        'repeatEvery': every,
        'quickSetting': 'CUSTOM',
      });
    });
  }

  void _setWeekday(int weekday, bool selected) {
    setState(() {
      _cfg = _cfg.merged({
        _weekdayKeys[weekday - 1]: selected,
        'quickSetting': 'CUSTOM',
      });
    });
  }

  Future<void> _pickEndDate() async {
    final initial =
        DateTime.tryParse(_cfg.repeatUntilDay ?? '') ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100, 12, 31),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _cfg = _cfg.merged({'repeatUntilDay': dbDateStr(picked)});
    });
  }

  void _clearEndDate() {
    setState(() => _cfg = _cfg.merged({'repeatUntilDay': null}));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isCustom = _cfg.quickSetting == 'CUSTOM';
    return AlertDialog(
      title: const Text('Repeat'),
      content: SizedBox(
        width: 400,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final preset in _presets)
                    ChoiceChip(
                      key: Key('repeat-preset-${preset.$1}'),
                      label: Text(preset.$2),
                      selected: _cfg.quickSetting == preset.$1,
                      onSelected: (_) => _applyPreset(preset.$1),
                    ),
                ],
              ),
              if (isCustom) ...[
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  key: const Key('repeat-cycle'),
                  initialValue: _cfg.repeatCycle,
                  decoration: const InputDecoration(
                    labelText: 'Repeats every',
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'DAILY', child: Text('Day')),
                    DropdownMenuItem(value: 'WEEKLY', child: Text('Week')),
                    DropdownMenuItem(value: 'MONTHLY', child: Text('Month')),
                    DropdownMenuItem(value: 'YEARLY', child: Text('Year')),
                  ],
                  onChanged: _setCycle,
                ),
                const SizedBox(height: 8),
                TextField(
                  key: const Key('repeat-every'),
                  controller: _every,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Every',
                    suffixText: 'times',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: _setEvery,
                ),
                if (_cfg.repeatCycle == 'WEEKLY') ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 4,
                    children: [
                      for (var weekday = DateTime.monday;
                          weekday <= DateTime.sunday;
                          weekday++)
                        FilterChip(
                          key: Key('repeat-weekday-$weekday'),
                          label: Text(
                            const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                                [weekday - 1],
                          ),
                          selected: _cfg.weekdayAt(weekday),
                          onSelected: (selected) =>
                              _setWeekday(weekday, selected),
                        ),
                    ],
                  ),
                ],
              ],
              const SizedBox(height: 12),
              Text(
                describeRepeat(_cfg),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              ListTile(
                key: const Key('repeat-until'),
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: const Icon(Icons.event_busy),
                title: const Text('Ends'),
                subtitle: Text(_cfg.repeatUntilDay ?? 'Never'),
                trailing: _cfg.repeatUntilDay == null
                    ? const Icon(Icons.edit_outlined, size: 18)
                    : IconButton(
                        key: const Key('repeat-until-clear'),
                        tooltip: 'Clear end date',
                        icon: const Icon(Icons.close, size: 18),
                        onPressed: _clearEndDate,
                      ),
                onTap: _pickEndDate,
              ),
            ],
          ),
        ),
      ),
      actions: [
        if (widget.initial != null)
          TextButton(
            key: const Key('repeat-remove'),
            onPressed: () => Navigator.of(context).pop(const RepeatEdit.remove()),
            child: const Text('Remove'),
          ),
        TextButton(
          key: const Key('repeat-cancel'),
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          key: const Key('repeat-save'),
          onPressed: () => Navigator.of(context).pop(RepeatEdit.save(_cfg)),
          child: const Text('Save'),
        ),
      ],
    );
  }
}
