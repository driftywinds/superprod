import '../../core/json.dart';

/// A tag / work context, field-compatible with upstream `tag.model.ts`.
///
/// The Today context is a tag with id [todayTagId] whose `taskIds` is the
/// ordering of today's tasks — membership itself is derived from due dates.
class Tag {
  const Tag({
    required this.id,
    required this.title,
    this.color,
    this.created = 0,
    this.updated,
    this.taskIds = const [],
    this.icon,
    this.theme = const {},
    this.advancedCfg = const {},
    this.extra = const {},
  });

  final String id;
  final String title;
  final String? color;
  final int created;
  final int? updated;
  final List<String> taskIds;
  final String? icon;
  final Map<String, Object?> theme;
  final Map<String, Object?> advancedCfg;
  final Map<String, Object?> extra;

  static const _knownKeys = {
    'id',
    'title',
    'color',
    'created',
    'updated',
    'taskIds',
    'icon',
    'theme',
    'advancedCfg',
  };

  factory Tag.fromJson(Map<String, Object?> json) => Tag(
    id: asString(json['id']) ?? '',
    title: asString(json['title']) ?? '',
    color: asString(json['color']),
    created: asIntOr(json['created'], 0),
    updated: asInt(json['updated']),
    taskIds: asStringList(json['taskIds']),
    icon: asString(json['icon']),
    theme: asMap(json['theme']),
    advancedCfg: asMap(json['advancedCfg']),
    extra: {
      for (final entry in json.entries)
        if (!_knownKeys.contains(entry.key)) entry.key: entry.value,
    },
  );

  Map<String, Object?> toJson() {
    final json = <String, Object?>{...extra};
    json['id'] = id;
    json['title'] = title;
    if (color != null) json['color'] = color;
    json['created'] = created;
    if (updated != null) json['updated'] = updated;
    json['taskIds'] = taskIds;
    if (icon != null) json['icon'] = icon;
    json['theme'] = theme;
    json['advancedCfg'] = advancedCfg;
    return json;
  }

  Tag merged(Map<String, Object?> changes) =>
      Tag.fromJson({...toJson(), ...changes});
}
