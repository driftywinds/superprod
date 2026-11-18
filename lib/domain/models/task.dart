import '../../core/day.dart';
import '../../core/json.dart';

/// A task, field-compatible with upstream Super Productivity.
///
/// Field names and nullability mirror `src/app/features/tasks/task.model.ts`
/// and the plugin `Task` type. Unknown fields are preserved in [extra] so a
/// task written by another client survives a read/write round trip.
class Task {
  const Task({
    required this.id,
    required this.title,
    this.notes,
    this.timeEstimate = 0,
    this.timeSpent = 0,
    this.isDone = false,
    this.projectId = '',
    this.tagIds = const [],
    this.parentId,
    required this.created,
    this.updated,
    this.modified,
    this.subTaskIds = const [],
    this.timeSpentOnDay = const {},
    this.doneOn,
    this.remindAt,
    this.dueDay,
    this.dueWithTime,
    this.deadlineDay,
    this.deadlineWithTime,
    this.deadlineRemindAt,
    this.repeatCfgId,
    this.priority,
    this.hasPlannedTime = false,
    this.wontDoOn,
    this.hideSubTasksMode,
    this.attachments = const [],
    this.extra = const {},
  });

  final String id;
  final String title;
  final String? notes;
  final int timeEstimate;
  final int timeSpent;
  final bool isDone;
  final String projectId;
  final List<String> tagIds;
  final String? parentId;
  final int created;
  final int? updated;

  /// Upstream's `modified` stamp, written on every entity change.
  final int? modified;
  final List<String> subTaskIds;
  final Map<String, int> timeSpentOnDay;
  final int? doneOn;
  final int? remindAt;

  // dueWithTime takes precedence over dueDay; they are mutually exclusive.
  final String? dueDay;
  final int? dueWithTime;
  final String? deadlineDay;
  final int? deadlineWithTime;
  final int? deadlineRemindAt;

  final String? repeatCfgId;

  /// 1 low, 2 medium, 3 high. Legacy string encodings are preserved on read.
  final Object? priority;
  final bool hasPlannedTime;

  /// Set when the task was finished as "won't do" rather than completed.
  final int? wontDoOn;
  final int? hideSubTasksMode;
  final List<Map<String, Object?>> attachments;

  /// Fields this client does not model yet (issue provider data, plugin
  /// fields), kept verbatim so sync does not drop them.
  final Map<String, Object?> extra;

  static const _knownKeys = {
    'id',
    'title',
    'notes',
    'timeEstimate',
    'timeSpent',
    'isDone',
    'projectId',
    'tagIds',
    'parentId',
    'created',
    'updated',
    'modified',
    'subTaskIds',
    'timeSpentOnDay',
    'doneOn',
    'remindAt',
    'dueDay',
    'dueWithTime',
    'deadlineDay',
    'deadlineWithTime',
    'deadlineRemindAt',
    'repeatCfgId',
    'priority',
    'hasPlannedTime',
    'wontDoOn',
    '_hideSubTasksMode',
    'attachments',
  };

  factory Task.fromJson(Map<String, Object?> json) {
    final tagIds = asStringList(json['tagIds'])
        .where((id) => id != todayTagId)
        .toList(growable: false);
    return Task(
      id: asString(json['id']) ?? '',
      title: asString(json['title']) ?? '',
      notes: asString(json['notes']),
      timeEstimate: asIntOr(json['timeEstimate'], 0),
      timeSpent: asIntOr(json['timeSpent'], 0),
      isDone: asBoolOr(json['isDone'], false),
      projectId: asString(json['projectId']) ?? '',
      tagIds: tagIds,
      parentId: asString(json['parentId']),
      created: asIntOr(json['created'], 0),
      updated: asInt(json['updated']),
      modified: asInt(json['modified']),
      subTaskIds: asStringList(json['subTaskIds']),
      timeSpentOnDay: asIntMap(json['timeSpentOnDay']),
      doneOn: asInt(json['doneOn']),
      remindAt: asInt(json['remindAt']),
      dueDay: asString(json['dueDay']),
      dueWithTime: asInt(json['dueWithTime']),
      deadlineDay: asString(json['deadlineDay']),
      deadlineWithTime: asInt(json['deadlineWithTime']),
      deadlineRemindAt: asInt(json['deadlineRemindAt']),
      repeatCfgId: asString(json['repeatCfgId']),
      priority: json['priority'],
      hasPlannedTime: asBoolOr(json['hasPlannedTime'], false),
      wontDoOn: asInt(json['wontDoOn']),
      hideSubTasksMode: asInt(json['_hideSubTasksMode']),
      attachments: asMapList(json['attachments']),
      extra: {
        for (final entry in json.entries)
          if (!_knownKeys.contains(entry.key)) entry.key: entry.value,
      },
    );
  }

  Map<String, Object?> toJson() {
    final json = <String, Object?>{...extra};
    json['id'] = id;
    json['title'] = title;
    if (notes != null) json['notes'] = notes;
    json['timeEstimate'] = timeEstimate;
    json['timeSpent'] = timeSpent;
    json['isDone'] = isDone;
    json['projectId'] = projectId;
    json['tagIds'] = tagIds;
    if (parentId != null) json['parentId'] = parentId;
    json['created'] = created;
    if (updated != null) json['updated'] = updated;
    if (modified != null) json['modified'] = modified;
    json['subTaskIds'] = subTaskIds;
    json['timeSpentOnDay'] = timeSpentOnDay;
    if (doneOn != null) json['doneOn'] = doneOn;
    if (remindAt != null) json['remindAt'] = remindAt;
    if (dueDay != null) json['dueDay'] = dueDay;
    if (dueWithTime != null) json['dueWithTime'] = dueWithTime;
    if (deadlineDay != null) json['deadlineDay'] = deadlineDay;
    if (deadlineWithTime != null) json['deadlineWithTime'] = deadlineWithTime;
    if (deadlineRemindAt != null) json['deadlineRemindAt'] = deadlineRemindAt;
    if (repeatCfgId != null) json['repeatCfgId'] = repeatCfgId;
    if (priority != null) json['priority'] = priority;
    if (hasPlannedTime) json['hasPlannedTime'] = true;
    if (wontDoOn != null) json['wontDoOn'] = wontDoOn;
    if (hideSubTasksMode != null) json['_hideSubTasksMode'] = hideSubTasksMode;
    json['attachments'] = attachments;
    return json;
  }

  /// Applies a partial update. A key set to `null` clears that field, which is
  /// how clearing a schedule is expressed on the wire.
  Task merged(Map<String, Object?> changes) =>
      Task.fromJson({...toJson(), ...changes});

  /// The calendar day this task is scheduled for, or null when unscheduled.
  /// `dueWithTime` wins over `dueDay` (upstream Decision #1).
  String? get scheduledDay =>
      dueWithTime != null ? dbDateStrFromMs(dueWithTime!) : dueDay;

  bool isScheduledForDay(String day) => scheduledDay == day;

  bool get isSubTask => parentId != null && parentId!.isNotEmpty;

  /// Upstream: only counts while `doneOn` still equals it.
  bool get isWontDo => isDone && wontDoOn != null && doneOn == wontDoOn;

  /// 1..3, or null when unset or unrecognized.
  int? get priorityRank {
    final raw = priority;
    if (raw is num) {
      final value = raw.toInt();
      return value >= 1 && value <= 3 ? value : null;
    }
    return switch (raw) {
      'low' => 1,
      'medium' => 2,
      'high' => 3,
      _ => null,
    };
  }

  Task copyWith({String? title, String? projectId, List<String>? tagIds}) => merged({
    'title': ?title,
    'projectId': ?projectId,
    'tagIds': ?tagIds,
  });
}

/// The virtual Today tag id. Never written into [Task.tagIds].
const todayTagId = 'TODAY';
