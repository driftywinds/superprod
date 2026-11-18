import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/providers.dart';

/// One-line task capture. Enter submits and keeps focus for the next task.
class AddTaskBar extends ConsumerStatefulWidget {
  const AddTaskBar({
    super.key,
    this.projectId = '',
    this.scheduleForToday = false,
  });

  final String projectId;
  final bool scheduleForToday;

  @override
  ConsumerState<AddTaskBar> createState() => _AddTaskBarState();
}

class _AddTaskBarState extends ConsumerState<AddTaskBar> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _submit(String value) {
    if (value.trim().isEmpty) return;
    ref
        .read(appStateProvider.notifier)
        .addTask(
          value,
          projectId: widget.projectId,
          scheduleForToday: widget.scheduleForToday,
        );
    _controller.clear();
    _focusNode.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
        child: TextField(
          controller: _controller,
          focusNode: _focusNode,
          textInputAction: TextInputAction.done,
          onSubmitted: _submit,
          decoration: InputDecoration(
            hintText: 'Add a task',
            prefixIcon: const Icon(Icons.add),
            filled: true,
            fillColor: theme.colorScheme.surfaceContainerHighest,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(28),
              borderSide: BorderSide.none,
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16),
          ),
        ),
      ),
    );
  }
}
