import '../../core/json.dart';

/// A project, field-compatible with upstream `project.model.ts`.
class Project {
  const Project({
    required this.id,
    required this.title,
    this.isArchived = false,
    this.isDone = false,
    this.doneOn,
    this.isHiddenFromMenu = false,
    this.isEnableBacklog = false,
    this.taskIds = const [],
    this.backlogTaskIds = const [],
    this.noteIds = const [],
    this.theme = const {},
    this.advancedCfg = const {},
    this.icon,
    this.created,
    this.updated,
    this.extra = const {},
  });

  final String id;
  final String title;
  final bool isArchived;
  final bool isDone;
  final int? doneOn;
  final bool isHiddenFromMenu;
  final bool isEnableBacklog;

  /// Main list order. Upstream keeps membership on the project, not the task.
  final List<String> taskIds;
  final List<String> backlogTaskIds;
  final List<String> noteIds;

  final Map<String, Object?> theme;
  final Map<String, Object?> advancedCfg;
  final String? icon;
  final int? created;
  final int? updated;
  final Map<String, Object?> extra;

  static const _knownKeys = {
    'id',
    'title',
    'isArchived',
    'isDone',
    'doneOn',
    'isHiddenFromMenu',
    'isEnableBacklog',
    'taskIds',
    'backlogTaskIds',
    'noteIds',
    'theme',
    'advancedCfg',
    'icon',
    'created',
    'updated',
  };

  factory Project.fromJson(Map<String, Object?> json) => Project(
    id: asString(json['id']) ?? '',
    title: asString(json['title']) ?? '',
    isArchived: asBoolOr(json['isArchived'], false),
    isDone: asBoolOr(json['isDone'], false),
    doneOn: asInt(json['doneOn']),
    isHiddenFromMenu: asBoolOr(json['isHiddenFromMenu'], false),
    isEnableBacklog: asBoolOr(json['isEnableBacklog'], false),
    taskIds: asStringList(json['taskIds']),
    backlogTaskIds: asStringList(json['backlogTaskIds']),
    noteIds: asStringList(json['noteIds']),
    theme: asMap(json['theme']),
    advancedCfg: asMap(json['advancedCfg']),
    icon: asString(json['icon']),
    created: asInt(json['created']),
    updated: asInt(json['updated']),
    extra: {
      for (final entry in json.entries)
        if (!_knownKeys.contains(entry.key)) entry.key: entry.value,
    },
  );

  Map<String, Object?> toJson() {
    final json = <String, Object?>{...extra};
    json['id'] = id;
    json['title'] = title;
    json['isArchived'] = isArchived;
    json['isDone'] = isDone;
    if (doneOn != null) json['doneOn'] = doneOn;
    json['isHiddenFromMenu'] = isHiddenFromMenu;
    json['isEnableBacklog'] = isEnableBacklog;
    json['taskIds'] = taskIds;
    json['backlogTaskIds'] = backlogTaskIds;
    json['noteIds'] = noteIds;
    json['theme'] = theme;
    json['advancedCfg'] = advancedCfg;
    if (icon != null) json['icon'] = icon;
    if (created != null) json['created'] = created;
    if (updated != null) json['updated'] = updated;
    return json;
  }

  Project merged(Map<String, Object?> changes) =>
      Project.fromJson({...toJson(), ...changes});

  Project copyWith({String? title, List<String>? taskIds, List<String>? backlogTaskIds}) =>
      merged({
        'title': ?title,
        'taskIds': ?taskIds,
        'backlogTaskIds': ?backlogTaskIds,
      });
}
