/// Lenient JSON readers. Synced state comes from other clients, so a field may
/// be absent, null, or encoded differently than we would write it.
library;

int? asInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}

int asIntOr(Object? value, int fallback) => asInt(value) ?? fallback;

String? asString(Object? value) => value is String ? value : null;

bool? asBool(Object? value) => value is bool ? value : null;

bool asBoolOr(Object? value, bool fallback) => asBool(value) ?? fallback;

List<String> asStringList(Object? value) {
  if (value is! List) return const [];
  return [
    for (final item in value)
      if (item is String) item,
  ];
}

Map<String, Object?> asMap(Object? value) {
  if (value is! Map) return const {};
  return {for (final entry in value.entries) '${entry.key}': entry.value};
}

Map<String, int> asIntMap(Object? value) {
  final raw = asMap(value);
  return {
    for (final entry in raw.entries)
      if (asInt(entry.value) case final int v) entry.key: v,
  };
}

List<Map<String, Object?>> asMapList(Object? value) {
  if (value is! List) return const [];
  return [
    for (final item in value)
      if (item is Map) asMap(item),
  ];
}
