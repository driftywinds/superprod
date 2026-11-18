import '../core/day.dart';
import 'app_state.dart';
import 'models/task.dart';
import 'models/task_repeat_cfg.dart';
import 'recurrence.dart';
import 'reducers.dart';

/// Creates and advances recurring task instances.
///
/// Upstream creates instances from a day-change/app-open sweep, and completion
/// only triggers creation for `waitForCompletion` series (or moves the cursor
/// for `repeatFromCompletionDate`). We follow that split: [sweepRecurringTasks]
/// runs at startup and after edits, [onRecurringTaskCompleted] handles the
/// completion-time cases.
const _reminderOffsetsMs = {
  'AtStart': 0,
  'm5': 5 * 60 * 1000,
  'm10': 10 * 60 * 1000,
  'm15': 15 * 60 * 1000,
  'm30': 30 * 60 * 1000,
  'h1': 60 * 60 * 1000,
  'd1': 24 * 60 * 60 * 1000,
  'd3': 3 * 24 * 60 * 60 * 1000,
  'w1': 7 * 24 * 60 * 60 * 1000,
};

/// The occurrence day is authoritative for "already created"; the id is derived
/// from it so a sweep cannot create the same instance twice.
String recurringTaskId(String cfgId, String day) => '$cfgId:$day';

AppState sweepRecurringTasks(
  AppState state, {
  required String todayStr,
  required int nowMs,
  required String Function() newId,
  int startOfNextDayDiffMs = 0,
}) {
  var next = state;
  for (final cfg in state.repeatCfgs.values) {
    if (cfg.isPaused) continue;
    final occurrence = _newestOccurrenceUpTo(cfg, todayStr);
    if (occurrence == null) continue;
    final day = dbDateStr(occurrence);

    // Move the cursor past deleted or skipped days without creating anything.
    if (cfg.deletedInstanceDates.contains(day) ||
        (cfg.skipOverdue && day.compareTo(todayStr) < 0)) {
      next = _advanceCursor(next, cfg, day, nowMs);
      continue;
    }

    if (_hasInstanceForDay(state, cfg.id, day)) {
      next = _advanceCursor(next, cfg, day, nowMs);
      continue;
    }

    next = _createInstance(
      next,
      cfg,
      occurrence: day,
      todayStr: todayStr,
      nowMs: nowMs,
      newId: newId,
      startOfNextDayDiffMs: startOfNextDayDiffMs,
    );
  }
  return next;
}

/// Completion hook: only `waitForCompletion` series spawn immediately; other
/// series wait for the next sweep, like upstream.
AppState onRecurringTaskCompleted(
  AppState state,
  Task completed, {
  required String todayStr,
  required int nowMs,
  required String Function() newId,
  int startOfNextDayDiffMs = 0,
}) {
  final cfgId = completed.repeatCfgId;
  if (cfgId == null) return state;
  final cfg = state.repeatCfgs[cfgId];
  if (cfg == null || cfg.isPaused) return state;

  if (cfg.repeatFromCompletionDate) {
    // Re-anchor the series on the completion day; the sweep creates from there.
    return state.copyWith(
      repeatCfgs: {
        ...state.repeatCfgs,
        cfgId: cfg.merged({
          'startDate': todayStr,
          'lastTaskCreationDay': todayStr,
          'lastTaskCreation': nowMs,
        }),
      },
    );
  }

  if (!cfg.waitForCompletion) return state;
  if (_hasOpenInstance(state, cfgId, excludingId: completed.id)) return state;

  final occurrence = nextOccurrence(cfg, from: DateTime.now());
  if (occurrence == null) return state;
  final day = dbDateStr(occurrence);
  if (cfg.deletedInstanceDates.contains(day) ||
      (cfg.repeatUntilDay != null && day.compareTo(cfg.repeatUntilDay!) > 0)) {
    return state;
  }

  return _createInstance(
    state,
    cfg,
    occurrence: day,
    todayStr: todayStr,
    nowMs: nowMs,
    newId: newId,
    startOfNextDayDiffMs: startOfNextDayDiffMs,
  );
}

/// The latest occurrence on or before [todayStr] that the cursor has not passed.
DateTime? _newestOccurrenceUpTo(TaskRepeatCfg cfg, String todayStr) {
  var from = _cursorStart(cfg, todayStr);
  DateTime? newest;
  for (var i = 0; i < 800; i++) {
    final occurrence = nextOccurrence(cfg, from: from, inclusive: true);
    if (occurrence == null) return newest;
    final day = dbDateStr(occurrence);
    if (day.compareTo(todayStr) > 0) return newest;
    if (newest != null && day == dbDateStr(newest)) return newest;
    newest = occurrence;
    from = DateTime(occurrence.year, occurrence.month, occurrence.day + 1, 12);
  }
  return newest;
}

/// Scan starts the day after the last created instance, else at the series
/// start, else today.
DateTime _cursorStart(TaskRepeatCfg cfg, String todayStr) {
  final anchor = cfg.lastTaskCreationDay ?? cfg.startDate;
  if (anchor == null) {
    return DateTime.parse(todayStr);
  }
  final parsed = DateTime.tryParse(anchor);
  if (parsed == null) return DateTime.parse(todayStr);
  return DateTime(parsed.year, parsed.month, parsed.day + 1, 12);
}

bool _hasInstanceForDay(AppState state, String cfgId, String day) => state
    .tasks
    .values
    .any((task) => task.repeatCfgId == cfgId && task.scheduledDay == day);

bool _hasOpenInstance(
  AppState state,
  String cfgId, {
  required String excludingId,
}) => state.tasks.values.any(
  (task) =>
      task.repeatCfgId == cfgId && !task.isDone && task.id != excludingId,
);

AppState _advanceCursor(
  AppState state,
  TaskRepeatCfg cfg,
  String day,
  int nowMs,
) => state.copyWith(
  repeatCfgs: {
    ...state.repeatCfgs,
    cfg.id: cfg.merged({
      'lastTaskCreationDay': day,
      'lastTaskCreation': nowMs,
    }),
  },
);

AppState _createInstance(
  AppState state,
  TaskRepeatCfg cfg, {
  required String occurrence,
  required String todayStr,
  required int nowMs,
  required String Function() newId,
  required int startOfNextDayDiffMs,
}) {
  final occurrenceDay = DateTime.parse(occurrence);
  final template = _templateFor(state, cfg);

  final hasStartTime = cfg.startTime != null && cfg.startTime!.isNotEmpty;
  final dueWithTime = hasStartTime
      ? nextDueWithTime(
          cfg,
          occurrenceDay: occurrenceDay,
          startOfNextDayDiffMs: startOfNextDayDiffMs,
          todayStr: todayStr,
        )
      : null;
  final dueDay = hasStartTime ? null : occurrence;
  final dueMs = dueWithTime?.millisecondsSinceEpoch;

  final reminderOption = cfg.remindAt;
  final remindAt = dueMs == null || reminderOption == null
      ? null
      : dueMs - (_reminderOffsetsMs[reminderOption] ?? 0);

  final id = recurringTaskId(cfg.id, occurrence);
  final task = Task(
    id: id,
    title: cfg.title ?? template?.title ?? '',
    notes: cfg.notes ?? template?.notes,
    created: DateTime(
      occurrenceDay.year,
      occurrenceDay.month,
      occurrenceDay.day,
      12,
    ).millisecondsSinceEpoch,
    projectId: cfg.projectId ?? template?.projectId ?? '',
    tagIds: cfg.tagIds.isNotEmpty ? cfg.tagIds : (template?.tagIds ?? const []),
    timeEstimate: cfg.defaultEstimate ?? template?.timeEstimate ?? 0,
    priority: cfg.priority ?? template?.priority,
    repeatCfgId: cfg.id,
    dueDay: dueDay,
    dueWithTime: dueWithTime == null || dueMs == null ? null : dueMs,
    remindAt: remindAt,
    modified: nowMs,
  );

  var next = addTask(state, task, todayStr: todayStr);
  next = _advanceCursor(next, cfg, occurrence, nowMs);
  return next;
}

/// Last instance of this series, used as the field template for new ones.
Task? _templateFor(AppState state, TaskRepeatCfg cfg) {
  Task? newest;
  for (final task in state.tasks.values) {
    if (task.repeatCfgId != cfg.id) continue;
    if (newest == null || task.created > newest.created) newest = task;
  }
  return newest;
}
