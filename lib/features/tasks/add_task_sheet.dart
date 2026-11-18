import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/short_syntax.dart';
import '../../data/providers.dart';

/// Opens the add-task sheet, pre-filled with the current view's project.
Future<void> showAddTaskSheet(
  BuildContext context,
  WidgetRef ref, {
  String? projectId,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => AddTaskSheet(defaultProjectId: projectId),
  );
}

/// The add sheet shows the parsed result live, so short syntax is verifiable
/// before the task exists rather than a surprise afterwards.
class AddTaskSheet extends ConsumerStatefulWidget {
  const AddTaskSheet({super.key, this.defaultProjectId});

  final String? defaultProjectId;

  @override
  ConsumerState<AddTaskSheet> createState() => _AddTaskSheetState();
}

class _AddTaskSheetState extends ConsumerState<AddTaskSheet> {
  final _controller = TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final parsed = parseShortSyntax(_controller.text);
    if (parsed.title.isEmpty) return;

    final repo = ref.read(tasksRepositoryProvider);

    var projectId = widget.defaultProjectId ?? 'INBOX';
    if (parsed.project != null) {
      await repo.ensureProject(parsed.project!);
      final projects = await ref.read(projectsProvider.future);
      projectId = projects.firstWhere((p) => p.title == parsed.project).id;
    }

    await repo.add(
      title: parsed.title,
      projectId: projectId,
      tagIds: parsed.tags,
      dueDay: parsed.dueDay,
      priority: parsed.priority,
      timeEstimate: parsed.estimateMs,
    );

    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final parsed = parseShortSyntax(_controller.text);
    final insets = MediaQuery.viewInsetsOf(context);

    return Padding(
      padding: EdgeInsets.only(bottom: insets.bottom),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: const Color(0xFF232323),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              TextField(
                controller: _controller,
                focusNode: _focus,
                maxLines: null,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _submit(),
                decoration: const InputDecoration(hintText: 'What needs doing?'),
                style: const TextStyle(fontSize: 16),
              ),
              const SizedBox(height: 12),
              _Preview(parsed: parsed),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: parsed.title.isEmpty ? null : _submit,
                      child: const Text('Add task'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Preview extends StatelessWidget {
  const _Preview({required this.parsed});

  final ParsedTask parsed;

  @override
  Widget build(BuildContext context) {
    if (parsed.isEmpty) {
      return const Text(
        'Type a title. Shortcuts: #tag, +project, p1, 1h, @tomorrow, !deadline',
        style: TextStyle(fontSize: 12, color: Color(0xFF5C5C5C)),
      );
    }

    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        if (parsed.title.isNotEmpty) _pill(parsed.title, accent: true),
        for (final tag in parsed.tags) _pill('#$tag'),
        if (parsed.project != null) _pill('+${parsed.project}'),
        if (parsed.priority != null) _pill('p${parsed.priority}'),
        if (parsed.estimateMs != null) _pill(_duration(parsed.estimateMs!)),
        if (parsed.dueDay != null) _pill('due ${parsed.dueDay}'),
        if (parsed.deadlineDay != null) _pill('deadline ${parsed.deadlineDay}'),
      ],
    );
  }

  Widget _pill(String label, {bool accent = false}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          color: accent ? const Color(0x223094DE) : const Color(0xFF141414),
          border: Border.all(color: accent ? const Color(0xFF3094DE) : const Color(0xFF232323)),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: TextStyle(fontSize: 12, color: accent ? const Color(0xFF3094DE) : const Color(0xFF9A9A9A)),
        ),
      );

  static String _duration(int ms) {
    final minutes = (ms / 60000).round();
    if (minutes < 60) return '${minutes}m';
    final hours = minutes ~/ 60;
    final rest = minutes % 60;
    return rest == 0 ? '${hours}h' : '${hours}h ${rest}m';
  }
}
