import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/providers.dart';
import '../../../core/day.dart';
import '../../../domain/models/tag.dart';
import '../../../domain/models/task.dart';
import '../../../domain/models/task_repeat_cfg.dart';
import '../../../domain/recurrence.dart';
import '../../../domain/selectors.dart';
import 'repeat_editor.dart';

/// Full task editor: title, notes, schedule, deadline, estimate, tags, project
/// and subtasks. All persistence goes through [AppController].
class TaskDetailScreen extends ConsumerWidget {
  const TaskDetailScreen({super.key, required this.taskId});

  final String taskId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final task = ref.watch(appStateProvider).task(taskId);
    if (task == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Task not found')),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Task'),
        actions: [_TaskActionsMenu(task: task)],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _TitleField(task: task),
              _NotesField(task: task),
              const Divider(),
              _ScheduleSection(task: task),
              const Divider(),
              _EstimateField(task: task),
              _TagsSection(task: task),
              _ProjectField(task: task),
              if (!task.isSubTask) ...[
                const Divider(),
                _SubTasksSection(task: task),
              ],
              const Divider(),
              _CreatedFooter(created: task.created),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Title

class _TitleField extends ConsumerStatefulWidget {
  const _TitleField({required this.task});

  final Task task;

  @override
  ConsumerState<_TitleField> createState() => _TitleFieldState();
}

class _TitleFieldState extends ConsumerState<_TitleField> {
  late final TextEditingController _controller;
  late final FocusNode _focus;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.task.title);
    _focus = FocusNode()..addListener(_onFocusChanged);
  }

  @override
  void dispose() {
    _focus
      ..removeListener(_onFocusChanged)
      ..dispose();
    _controller.dispose();
    super.dispose();
  }

  void _onFocusChanged() {
    if (!_focus.hasFocus) _save();
  }

  void _save() {
    final title = _controller.text.trim();
    if (title.isEmpty) {
      _controller.text = widget.task.title;
      return;
    }
    if (title == widget.task.title) return;
    ref
        .read(appStateProvider.notifier)
        .updateTaskFields(widget.task.id, {'title': title});
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      key: const Key('task-title'),
      controller: _controller,
      focusNode: _focus,
      maxLines: 1,
      textInputAction: TextInputAction.done,
      style: Theme.of(context).textTheme.headlineSmall,
      decoration: const InputDecoration(
        labelText: 'Title',
        border: InputBorder.none,
      ),
      onSubmitted: (_) {
        _save();
        _focus.unfocus();
      },
      onTapOutside: (_) => _focus.unfocus(),
    );
  }
}

// ---------------------------------------------------------------------------
// Notes

class _NotesField extends ConsumerStatefulWidget {
  const _NotesField({required this.task});

  final Task task;

  @override
  ConsumerState<_NotesField> createState() => _NotesFieldState();
}

class _NotesFieldState extends ConsumerState<_NotesField> {
  late final TextEditingController _controller;
  late final FocusNode _focus;
  bool _expanded = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.task.notes ?? '');
    _focus = FocusNode()..addListener(_onFocusChanged);
  }

  @override
  void dispose() {
    _focus
      ..removeListener(_onFocusChanged)
      ..dispose();
    _controller.dispose();
    super.dispose();
  }

  void _onFocusChanged() {
    if (!_focus.hasFocus) _save();
  }

  void _save() {
    final notes = _controller.text.trim();
    if (notes == (widget.task.notes ?? '')) return;
    ref
        .read(appStateProvider.notifier)
        .updateTaskFields(widget.task.id, {'notes': notes.isEmpty ? null : notes});
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Expanded(child: _SectionHeader('Notes')),
            IconButton(
              key: const Key('toggle-notes'),
              tooltip: _expanded ? 'Collapse notes' : 'Expand notes',
              icon: Icon(_expanded ? Icons.expand_less : Icons.expand_more),
              onPressed: () => setState(() => _expanded = !_expanded),
            ),
          ],
        ),
        TextField(
          key: const Key('task-notes'),
          controller: _controller,
          focusNode: _focus,
          minLines: _expanded ? 8 : 2,
          maxLines: _expanded ? null : 5,
          keyboardType: TextInputType.multiline,
          decoration: const InputDecoration(
            hintText: 'Add notes',
            border: OutlineInputBorder(),
          ),
          onTapOutside: (_) => _focus.unfocus(),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Schedule and deadline

class _ScheduleSection extends ConsumerWidget {
  const _ScheduleSection({required this.task});

  final Task task;

  static final _minDate = DateTime(2000);
  static final _maxDate = DateTime(2100, 12, 31);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final due = task.dueWithTime;
    final dueDay = task.dueDay;
    final deadline = task.deadlineWithTime;
    final deadlineDay = task.deadlineDay;
    final repeatCfg = task.repeatCfgId == null
        ? null
        : ref.watch(appStateProvider).repeatCfgs[task.repeatCfgId];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SectionHeader('Schedule'),
        _DateTimeTile(
          key: const Key('due-date'),
          icon: Icons.event,
          label: 'Due date',
          value: due != null ? _formatDate(due) : dueDay ?? 'None',
          onTap: () => _pickDueDate(context, ref),
        ),
        _DateTimeTile(
          key: const Key('due-time'),
          icon: Icons.schedule,
          label: 'Due time',
          value: due != null ? _formatTime(due) : 'None',
          onTap: () => _pickDueTime(context, ref),
        ),
        if (due != null || dueDay != null)
          _ClearButton(
            key: const Key('due-clear'),
            label: 'Clear schedule',
            onPressed: () => _clearDue(ref),
          ),
        const SizedBox(height: 8),
        _DateTimeTile(
          key: const Key('deadline-date'),
          icon: Icons.flag_outlined,
          label: 'Deadline date',
          value: deadline != null
              ? _formatDate(deadline)
              : deadlineDay ?? 'None',
          onTap: () => _pickDeadlineDate(context, ref),
        ),
        _DateTimeTile(
          key: const Key('deadline-time'),
          icon: Icons.timer_outlined,
          label: 'Deadline time',
          value: deadline != null ? _formatTime(deadline) : 'None',
          onTap: () => _pickDeadlineTime(context, ref),
        ),
        if (deadline != null || deadlineDay != null)
          _ClearButton(
            key: const Key('deadline-clear'),
            label: 'Clear deadline',
            onPressed: () => ref.read(appStateProvider.notifier).updateTaskFields(
              task.id,
              {
                'deadlineDay': null,
                'deadlineWithTime': null,
                'deadlineRemindAt': null,
              },
            ),
          ),
        const SizedBox(height: 8),
        _DateTimeTile(
          key: const Key('task-repeat'),
          icon: Icons.repeat,
          label: 'Repeat',
          value: repeatCfg == null ? 'Never' : describeRepeat(repeatCfg),
          onTap: () => _editRepeat(context, ref, repeatCfg),
        ),
        _DateTimeTile(
          key: const Key('task-reminder'),
          icon: Icons.notifications_none,
          label: 'Reminder',
          value: task.remindAt == null
              ? 'None'
              : _formatDateTime(task.remindAt!),
          onTap: () => _pickReminder(context, ref),
        ),
        if (task.remindAt != null)
          _ClearButton(
            key: const Key('reminder-clear'),
            label: 'Clear reminder',
            onPressed: () =>
                ref.read(appStateProvider.notifier).setRemindAt(task.id, null),
          ),
      ],
    );
  }

  Future<void> _editRepeat(
    BuildContext context,
    WidgetRef ref,
    TaskRepeatCfg? current,
  ) async {
    final result = await showRepeatEditor(
      context,
      task: task,
      initial: current,
    );
    if (result == null) return;
    final notifier = ref.read(appStateProvider.notifier);
    if (result.remove) {
      await notifier.removeRepeatCfg(task.id);
      return;
    }
    final cfg = result.cfg;
    if (cfg == null) return;
    if (current == null) {
      await notifier.addRepeatCfg(task.id, cfg);
    } else {
      await notifier.updateRepeatCfg(cfg);
    }
  }

  Future<void> _pickReminder(BuildContext context, WidgetRef ref) async {
    final base = task.remindAt != null
        ? DateTime.fromMillisecondsSinceEpoch(task.remindAt!)
        : _calendarDate(task.dueDay, task.dueWithTime);
    final day = await _pickDate(context, base);
    if (day == null || !context.mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(base),
      initialEntryMode: TimePickerEntryMode.input,
    );
    if (time == null) return;
    await ref.read(appStateProvider.notifier).setRemindAt(
      task.id,
      DateTime(day.year, day.month, day.day, time.hour, time.minute),
    );
  }

  Future<void> _clearDue(WidgetRef ref) async {
    final notifier = ref.read(appStateProvider.notifier);
    await notifier.updateTaskFields(task.id, {
      'dueDay': null,
      'dueWithTime': null,
    });
    await notifier.setRemindAt(task.id, null);
  }

  Future<void> _pickDueDate(BuildContext context, WidgetRef ref) async {
    final picked = await _pickDate(
      context,
      _calendarDate(task.dueDay, task.dueWithTime),
    );
    if (picked == null) return;
    final notifier = ref.read(appStateProvider.notifier);
    await notifier.updateTaskFields(task.id, {
      'dueDay': dbDateStr(picked),
      'dueWithTime': null,
      'remindAt': null,
    });
    await notifier.setRemindAt(task.id, null);
  }

  Future<void> _pickDueTime(BuildContext context, WidgetRef ref) async {
    final base = _calendarDate(task.dueDay, task.dueWithTime);
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(base),
    );
    if (picked == null) return;
    final due = DateTime(
      base.year,
      base.month,
      base.day,
      picked.hour,
      picked.minute,
    );
    final notifier = ref.read(appStateProvider.notifier);
    await notifier.updateTaskFields(task.id, {
      'dueWithTime': due.millisecondsSinceEpoch,
      'dueDay': null,
      'remindAt': null,
    });
    await notifier.setRemindAt(task.id, null);
  }

  Future<void> _pickDeadlineDate(BuildContext context, WidgetRef ref) async {
    final picked = await _pickDate(
      context,
      _calendarDate(task.deadlineDay, task.deadlineWithTime),
    );
    if (picked == null) return;
    await ref.read(appStateProvider.notifier).updateTaskFields(task.id, {
      'deadlineDay': dbDateStr(picked),
      'deadlineWithTime': null,
    });
  }

  Future<void> _pickDeadlineTime(BuildContext context, WidgetRef ref) async {
    final base = _calendarDate(task.deadlineDay, task.deadlineWithTime);
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(base),
    );
    if (picked == null) return;
    final deadline = DateTime(
      base.year,
      base.month,
      base.day,
      picked.hour,
      picked.minute,
    );
    await ref.read(appStateProvider.notifier).updateTaskFields(task.id, {
      'deadlineWithTime': deadline.millisecondsSinceEpoch,
      'deadlineDay': null,
    });
  }

  Future<DateTime?> _pickDate(BuildContext context, DateTime initial) async {
    final clamped = initial.isBefore(_minDate)
        ? _minDate
        : (initial.isAfter(_maxDate) ? _maxDate : initial);
    return showDatePicker(
      context: context,
      initialDate: clamped,
      firstDate: _minDate,
      lastDate: _maxDate,
    );
  }

  /// A stored day wins over a timestamp; both fall back to today.
  DateTime _calendarDate(String? day, int? timestamp) {
    if (day != null) {
      final parsed = DateTime.tryParse(day);
      if (parsed != null) return parsed;
    }
    if (timestamp != null) {
      return DateTime.fromMillisecondsSinceEpoch(timestamp);
    }
    return DateTime.now();
  }
}

class _DateTimeTile extends StatelessWidget {
  const _DateTimeTile({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      dense: true,
      leading: Icon(icon),
      title: Text(label),
      subtitle: Text(value),
      trailing: const Icon(Icons.edit_outlined, size: 18),
      onTap: onTap,
    );
  }
}

class _ClearButton extends StatelessWidget {
  const _ClearButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: TextButton.icon(
        onPressed: onPressed,
        icon: const Icon(Icons.close, size: 16),
        label: Text(label),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Estimate

class _EstimateField extends ConsumerStatefulWidget {
  const _EstimateField({required this.task});

  final Task task;

  @override
  ConsumerState<_EstimateField> createState() => _EstimateFieldState();
}

class _EstimateFieldState extends ConsumerState<_EstimateField> {
  late final TextEditingController _controller;
  late final FocusNode _focus;
  String _unit = 'min';

  static const _presets = <int>[15, 30, 60, 120];

  @override
  void initState() {
    super.initState();
    final minutes = widget.task.timeEstimate ~/ 60000;
    _controller = TextEditingController(text: minutes > 0 ? '$minutes' : '');
    _focus = FocusNode()..addListener(_onFocusChanged);
  }

  @override
  void dispose() {
    _focus
      ..removeListener(_onFocusChanged)
      ..dispose();
    _controller.dispose();
    super.dispose();
  }

  void _onFocusChanged() {
    if (!_focus.hasFocus) _save();
  }

  int get _multiplier => _unit == 'h' ? 3600000 : 60000;

  void _save() {
    final raw = _controller.text.trim();
    final value = raw.isEmpty ? 0 : int.tryParse(raw);
    if (value == null || value < 0) return;
    final ms = value * _multiplier;
    if (ms == widget.task.timeEstimate) return;
    ref
        .read(appStateProvider.notifier)
        .updateTaskFields(widget.task.id, {'timeEstimate': ms});
  }

  void _applyPreset(int minutes) {
    setState(() {
      _unit = minutes % 60 == 0 ? 'h' : 'min';
    });
    _controller.text = '${minutes ~/ (_unit == 'h' ? 60 : 1)}';
    ref.read(appStateProvider.notifier).updateTaskFields(widget.task.id, {
      'timeEstimate': minutes * 60000,
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SectionHeader('Estimate'),
        TextField(
          key: const Key('task-estimate'),
          controller: _controller,
          focusNode: _focus,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: 'Time estimate',
            suffixIcon: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _unit,
                isDense: true,
                items: const [
                  DropdownMenuItem(value: 'min', child: Text('min')),
                  DropdownMenuItem(value: 'h', child: Text('h')),
                ],
                onChanged: (value) {
                  if (value == null || value == _unit) return;
                  setState(() => _unit = value);
                },
              ),
            ),
          ),
          onSubmitted: (_) {
            _save();
            _focus.unfocus();
          },
          onTapOutside: (_) => _focus.unfocus(),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            for (final minutes in _presets)
              ActionChip(
                label: Text(_presetLabel(minutes)),
                onPressed: () => _applyPreset(minutes),
              ),
          ],
        ),
      ],
    );
  }

  String _presetLabel(int minutes) =>
      minutes >= 60 ? '${minutes ~/ 60}h' : '${minutes}m';
}

// ---------------------------------------------------------------------------
// Tags

class _TagsSection extends ConsumerStatefulWidget {
  const _TagsSection({required this.task});

  final Task task;

  @override
  ConsumerState<_TagsSection> createState() => _TagsSectionState();
}

class _TagsSectionState extends ConsumerState<_TagsSection> {
  final _controller = TextEditingController();
  final _focus = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _writeTagIds(List<String> tagIds) {
    ref.read(appStateProvider.notifier).updateTaskFields(
      widget.task.id,
      {'tagIds': tagIds},
    );
  }

  void _addTag(Tag tag) {
    if (widget.task.tagIds.contains(tag.id)) return;
    _controller.clear();
    _focus.unfocus();
    _writeTagIds([...widget.task.tagIds, tag.id]);
  }

  void _removeTag(String tagId) {
    _writeTagIds([
      for (final id in widget.task.tagIds)
        if (id != tagId) id,
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appStateProvider);
    final current = <Tag>[
      for (final id in widget.task.tagIds)
        if (state.tags[id] case final Tag tag) tag,
    ];
    final options = <Tag>[
      for (final tag in state.tags.values)
        if (tag.id != todayTagId && !widget.task.tagIds.contains(tag.id)) tag,
    ]..sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SectionHeader('Tags'),
        if (current.isEmpty)
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text('No tags'),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              for (final tag in current)
                InputChip(
                  key: Key('tag-chip-${tag.id}'),
                  label: Text(tag.title),
                  onPressed: () => _removeTag(tag.id),
                  onDeleted: () => _removeTag(tag.id),
                  deleteButtonTooltipMessage: 'Remove tag',
                ),
            ],
          ),
        if (options.isEmpty)
          Text(
            'No other tags yet. Create tags with #tag when adding a task.',
            style: Theme.of(context).textTheme.bodySmall,
          )
        else
          Autocomplete<Tag>(
            textEditingController: _controller,
            focusNode: _focus,
            displayStringForOption: (tag) => tag.title,
            optionsBuilder: (value) {
              final query = value.text.trim().toLowerCase();
              return options.where(
                (tag) =>
                    query.isEmpty || tag.title.toLowerCase().contains(query),
              );
            },
            onSelected: _addTag,
            fieldViewBuilder: (context, controller, focusNode, onSubmitted) =>
                TextField(
                  key: const Key('tag-autocomplete'),
                  controller: controller,
                  focusNode: focusNode,
                  decoration: const InputDecoration(
                    labelText: 'Add tag',
                    prefixIcon: Icon(Icons.label_outline),
                  ),
                  onSubmitted: (_) => onSubmitted(),
                ),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Project

class _ProjectField extends ConsumerWidget {
  const _ProjectField({required this.task});

  final Task task;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = visibleProjects(ref.watch(appStateProvider));
    final known = projects.any((project) => project.id == task.projectId);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SectionHeader('Project'),
        DropdownButtonFormField<String>(
          key: const Key('task-project'),
          initialValue: known ? task.projectId : '',
          isExpanded: true,
          decoration: const InputDecoration(border: OutlineInputBorder()),
          items: [
            const DropdownMenuItem(value: '', child: Text('No project')),
            for (final project in projects)
              DropdownMenuItem(value: project.id, child: Text(project.title)),
          ],
          onChanged: (value) {
            if (value == null) return;
            ref.read(appStateProvider.notifier).updateTaskFields(
              task.id,
              {'projectId': value},
            );
          },
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Subtasks

class _SubTasksSection extends ConsumerStatefulWidget {
  const _SubTasksSection({required this.task});

  final Task task;

  @override
  ConsumerState<_SubTasksSection> createState() => _SubTasksSectionState();
}

class _SubTasksSectionState extends ConsumerState<_SubTasksSection> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _add(String value) {
    if (value.trim().isEmpty) return;
    ref.read(appStateProvider.notifier).addSubTask(widget.task.id, value);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appStateProvider);
    final subtasks = subTasks(state, widget.task.id);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _SectionHeader(
          subtasks.isEmpty ? 'Subtasks' : 'Subtasks (${subtasks.length})',
        ),
        for (final subtask in subtasks)
          ListTile(
            key: Key('subtask-${subtask.id}'),
            contentPadding: EdgeInsets.zero,
            dense: true,
            leading: Checkbox(
              key: Key('subtask-checkbox-${subtask.id}'),
              value: subtask.isDone,
              shape: const CircleBorder(),
              onChanged: (_) =>
                  ref.read(appStateProvider.notifier).toggleDone(subtask),
            ),
            title: Text(
              subtask.title,
              style: subtask.isDone
                  ? const TextStyle(decoration: TextDecoration.lineThrough)
                  : null,
            ),
            trailing: IconButton(
              key: Key('delete-subtask-${subtask.id}'),
              tooltip: 'Delete subtask',
              icon: const Icon(Icons.close, size: 18),
              onPressed: () =>
                  ref.read(appStateProvider.notifier).deleteTask(subtask.id),
            ),
          ),
        TextField(
          key: const Key('add-subtask'),
          controller: _controller,
          textInputAction: TextInputAction.done,
          decoration: const InputDecoration(
            labelText: 'Add subtask',
            prefixIcon: Icon(Icons.add),
            border: OutlineInputBorder(),
          ),
          onSubmitted: _add,
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Footer

class _CreatedFooter extends StatelessWidget {
  const _CreatedFooter({required this.created});

  final int created;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      created > 0 ? 'Created ${_formatDateTime(created)}' : 'Created unknown',
      key: const Key('created-footer'),
      style: theme.textTheme.bodySmall?.copyWith(
        color: theme.colorScheme.onSurfaceVariant,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Actions

enum _TaskAction { duplicate, archive, delete }

class _TaskActionsMenu extends ConsumerWidget {
  const _TaskActionsMenu({required this.task});

  final Task task;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return PopupMenuButton<_TaskAction>(
      key: const Key('task-actions'),
      tooltip: 'Task actions',
      onSelected: (action) {
        switch (action) {
          case _TaskAction.duplicate:
            ref.read(appStateProvider.notifier).duplicateTask(task.id);
          case _TaskAction.archive:
            _archive(context, ref);
          case _TaskAction.delete:
            _delete(context, ref);
        }
      },
      itemBuilder: (context) => const [
        PopupMenuItem(
          value: _TaskAction.duplicate,
          child: _MenuItem(icon: Icons.copy_outlined, label: 'Duplicate'),
        ),
        PopupMenuItem(
          value: _TaskAction.archive,
          child: _MenuItem(icon: Icons.archive_outlined, label: 'Archive'),
        ),
        PopupMenuItem(
          value: _TaskAction.delete,
          child: _MenuItem(icon: Icons.delete_outline, label: 'Delete'),
        ),
      ],
    );
  }

  Future<void> _archive(BuildContext context, WidgetRef ref) async {
    // Capture the route before the update: removing the task from state swaps
    // this menu out, so `context` is gone by the time the save completes.
    final navigator = Navigator.of(context);
    await ref.read(appStateProvider.notifier).archiveTask(task.id);
    navigator.pop();
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final navigator = Navigator.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete task?'),
        content: const Text('This cannot be undone.'),
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
    if (confirmed != true) return;
    await ref.read(appStateProvider.notifier).deleteTask(task.id);
    navigator.pop();
  }
}

// ---------------------------------------------------------------------------
// Shared bits

class _MenuItem extends StatelessWidget {
  const _MenuItem({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20),
        const SizedBox(width: 12),
        Text(label),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title);

  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 4),
      child: Text(
        title,
        style: theme.textTheme.titleSmall?.copyWith(
          color: theme.colorScheme.primary,
        ),
      ),
    );
  }
}

String _formatDate(int ms) =>
    dbDateStr(DateTime.fromMillisecondsSinceEpoch(ms));

String _formatTime(int ms) {
  final time = DateTime.fromMillisecondsSinceEpoch(ms);
  return '${time.hour.toString().padLeft(2, '0')}:'
      '${time.minute.toString().padLeft(2, '0')}';
}

String _formatDateTime(int ms) => '${_formatDate(ms)} ${_formatTime(ms)}';
