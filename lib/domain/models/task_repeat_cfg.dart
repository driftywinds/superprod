import '../../core/json.dart';

/// Repeat configuration for recurring tasks, field-compatible with upstream
/// `task-repeat-cfg.model.ts`.
///
/// Enum-like fields stay strings so persisted/synced values round-trip exactly.
class TaskRepeatCfg {
  const TaskRepeatCfg({
    required this.id,
    this.projectId,
    this.lastTaskCreation,
    this.lastTaskCreationDay,
    this.title,
    this.tagIds = const [],
    this.order = 0,
    this.defaultEstimate,
    this.priority,
    this.startTime,
    this.remindAt,
    this.isPaused = false,
    this.quickSetting = 'DAILY',
    this.repeatCycle = 'WEEKLY',
    this.startDate,
    this.repeatUntilDay,
    this.repeatEvery = 1,
    this.monday = true,
    this.tuesday = true,
    this.wednesday = true,
    this.thursday = true,
    this.friday = true,
    this.saturday = false,
    this.sunday = false,
    this.monthlyWeekOfMonth,
    this.monthlyWeekday,
    this.monthlyLastDay = false,
    this.notes,
    this.shouldInheritSubtasks = false,
    this.repeatFromCompletionDate = false,
    this.waitForCompletion = false,
    this.disableAutoUpdateSubtasks = false,
    this.subTaskTemplates = const [],
    this.deletedInstanceDates = const [],
    this.skipOverdue = false,
    this.extra = const {},
  });

  final String id;

  /// `null` means the config follows the task's project.
  final String? projectId;
  final int? lastTaskCreation;
  final String? lastTaskCreationDay;
  final String? title;
  final List<String> tagIds;
  final int order;
  final int? defaultEstimate;
  final Object? priority;
  final String? startTime;

  /// Reminder option id (`AtStart`, `m5`, …, `d1`).
  final String? remindAt;

  final bool isPaused;

  /// UI preset: DAILY, WEEKLY_CURRENT_WEEKDAY, MONTHLY_CURRENT_DATE, …,
  /// MONDAY_TO_FRIDAY, YEARLY_CURRENT_DATE, CUSTOM.
  final String quickSetting;

  /// DAILY | WEEKLY | MONTHLY | YEARLY.
  final String repeatCycle;

  /// `yyyy-MM-dd`; anchors monthly/yearly recurrence.
  final String? startDate;

  /// Inclusive last day an occurrence may fall on; null = forever.
  final String? repeatUntilDay;
  final int repeatEvery;
  final bool monday;
  final bool tuesday;
  final bool wednesday;
  final bool thursday;
  final bool friday;
  final bool saturday;
  final bool sunday;

  /// 1..4, or -1 for the last occurrence; with [monthlyWeekday] forms the
  /// "Nth weekday of the month" anchor.
  final int? monthlyWeekOfMonth;

  /// 0 = Sunday … 6 = Saturday.
  final int? monthlyWeekday;
  final bool monthlyLastDay;

  final String? notes;
  final bool shouldInheritSubtasks;
  final bool repeatFromCompletionDate;
  final bool waitForCompletion;
  final bool disableAutoUpdateSubtasks;
  final List<Map<String, Object?>> subTaskTemplates;
  final List<String> deletedInstanceDates;
  final bool skipOverdue;
  final Map<String, Object?> extra;

  bool weekdayAt(int weekday) => switch (weekday) {
    DateTime.monday => monday,
    DateTime.tuesday => tuesday,
    DateTime.wednesday => wednesday,
    DateTime.thursday => thursday,
    DateTime.friday => friday,
    DateTime.saturday => saturday,
    DateTime.sunday => sunday,
    _ => false,
  };

  static const _knownKeys = {
    'id',
    'projectId',
    'lastTaskCreation',
    'lastTaskCreationDay',
    'title',
    'tagIds',
    'order',
    'defaultEstimate',
    'priority',
    'startTime',
    'remindAt',
    'isPaused',
    'quickSetting',
    'repeatCycle',
    'startDate',
    'repeatUntilDay',
    'repeatEvery',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'monthlyWeekOfMonth',
    'monthlyWeekday',
    'monthlyLastDay',
    'notes',
    'shouldInheritSubtasks',
    'repeatFromCompletionDate',
    'waitForCompletion',
    'disableAutoUpdateSubtasks',
    'subTaskTemplates',
    'deletedInstanceDates',
    'skipOverdue',
  };

  factory TaskRepeatCfg.fromJson(Map<String, Object?> json) => TaskRepeatCfg(
    id: asString(json['id']) ?? '',
    projectId: asString(json['projectId']),
    lastTaskCreation: asInt(json['lastTaskCreation']),
    lastTaskCreationDay: asString(json['lastTaskCreationDay']),
    title: asString(json['title']),
    tagIds: asStringList(json['tagIds']),
    order: asIntOr(json['order'], 0),
    defaultEstimate: asInt(json['defaultEstimate']),
    priority: json['priority'],
    startTime: asString(json['startTime']),
    remindAt: asString(json['remindAt']),
    isPaused: asBoolOr(json['isPaused'], false),
    quickSetting: asString(json['quickSetting']) ?? 'DAILY',
    repeatCycle: asString(json['repeatCycle']) ?? 'WEEKLY',
    startDate: asString(json['startDate']),
    repeatUntilDay: asString(json['repeatUntilDay']),
    repeatEvery: asIntOr(json['repeatEvery'], 1),
    monday: asBoolOr(json['monday'], true),
    tuesday: asBoolOr(json['tuesday'], true),
    wednesday: asBoolOr(json['wednesday'], true),
    thursday: asBoolOr(json['thursday'], true),
    friday: asBoolOr(json['friday'], true),
    saturday: asBoolOr(json['saturday'], false),
    sunday: asBoolOr(json['sunday'], false),
    monthlyWeekOfMonth: asInt(json['monthlyWeekOfMonth']),
    monthlyWeekday: asInt(json['monthlyWeekday']),
    monthlyLastDay: asBoolOr(json['monthlyLastDay'], false),
    notes: asString(json['notes']),
    shouldInheritSubtasks: asBoolOr(json['shouldInheritSubtasks'], false),
    repeatFromCompletionDate:
        asBoolOr(json['repeatFromCompletionDate'], false),
    waitForCompletion: asBoolOr(json['waitForCompletion'], false),
    disableAutoUpdateSubtasks:
        asBoolOr(json['disableAutoUpdateSubtasks'], false),
    subTaskTemplates: asMapList(json['subTaskTemplates']),
    deletedInstanceDates: asStringList(json['deletedInstanceDates']),
    skipOverdue: asBoolOr(json['skipOverdue'], false),
    extra: {
      for (final entry in json.entries)
        if (!_knownKeys.contains(entry.key)) entry.key: entry.value,
    },
  );

  Map<String, Object?> toJson() {
    final json = <String, Object?>{...extra};
    json['id'] = id;
    if (projectId != null) json['projectId'] = projectId;
    if (lastTaskCreation != null) json['lastTaskCreation'] = lastTaskCreation;
    if (lastTaskCreationDay != null) {
      json['lastTaskCreationDay'] = lastTaskCreationDay;
    }
    if (title != null) json['title'] = title;
    json['tagIds'] = tagIds;
    json['order'] = order;
    if (defaultEstimate != null) json['defaultEstimate'] = defaultEstimate;
    if (priority != null) json['priority'] = priority;
    if (startTime != null) json['startTime'] = startTime;
    if (remindAt != null) json['remindAt'] = remindAt;
    json['isPaused'] = isPaused;
    json['quickSetting'] = quickSetting;
    json['repeatCycle'] = repeatCycle;
    if (startDate != null) json['startDate'] = startDate;
    if (repeatUntilDay != null) json['repeatUntilDay'] = repeatUntilDay;
    json['repeatEvery'] = repeatEvery;
    json['monday'] = monday;
    json['tuesday'] = tuesday;
    json['wednesday'] = wednesday;
    json['thursday'] = thursday;
    json['friday'] = friday;
    json['saturday'] = saturday;
    json['sunday'] = sunday;
    if (monthlyWeekOfMonth != null) {
      json['monthlyWeekOfMonth'] = monthlyWeekOfMonth;
    }
    if (monthlyWeekday != null) json['monthlyWeekday'] = monthlyWeekday;
    json['monthlyLastDay'] = monthlyLastDay;
    if (notes != null) json['notes'] = notes;
    json['shouldInheritSubtasks'] = shouldInheritSubtasks;
    json['repeatFromCompletionDate'] = repeatFromCompletionDate;
    json['waitForCompletion'] = waitForCompletion;
    json['disableAutoUpdateSubtasks'] = disableAutoUpdateSubtasks;
    json['subTaskTemplates'] = subTaskTemplates;
    json['deletedInstanceDates'] = deletedInstanceDates;
    json['skipOverdue'] = skipOverdue;
    return json;
  }

  TaskRepeatCfg merged(Map<String, Object?> changes) =>
      TaskRepeatCfg.fromJson({...toJson(), ...changes});
}
