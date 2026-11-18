/// Short syntax, matching upstream's `short-syntax.ts`.
///
/// Recognised forms, all optional and anywhere in the title:
///   `#tag` / `+project`   list membership
///   `p1` `p2` `p3`        priority
///   `1h` `30m` `1.5h`     time estimate (`a m / b h` also sets spent)
///   `@today` `@tomorrow`  due day
///   `@2026-11-20`         explicit due day
///   `!2026-11-25`         deadline
///
/// The parser returns the cleaned title plus what it recognised, so the add
/// sheet can show exactly what will be created before the user commits.
class ParsedTask {
  const ParsedTask({
    required this.title,
    this.tags = const [],
    this.project,
    this.priority,
    this.estimateMs,
    this.spentMs,
    this.dueDay,
    this.deadlineDay,
  });

  final String title;
  final List<String> tags;
  final String? project;
  final int? priority;
  final int? estimateMs;
  final int? spentMs;
  final String? dueDay;
  final String? deadlineDay;

  bool get isEmpty => title.isEmpty && tags.isEmpty && project == null;

  @override
  String toString() =>
      'ParsedTask(title: $title, tags: $tags, project: $project, priority: $priority, '
      'estimateMs: $estimateMs, dueDay: $dueDay, deadlineDay: $deadlineDay)';
}

final _tagPattern = RegExp(r'(?:^|\s)#([\w-]+)');
final _projectPattern = RegExp(r'(?:^|\s)\+([\w-]+)');
final _priorityPattern = RegExp(r'(?:^|\s)p([1-3])(?=\s|$)');
final _durationPattern = RegExp(r'(?:^|\s)((?:\d+(?:\.\d+)?\s*[hm]\s*)+)(?=\s|$)');
final _durationPart = RegExp(r'(\d+(?:\.\d+)?)\s*([hm])');
final _spentEstimatePattern =
    RegExp(r'(?:^|\s)((?:\d+(?:\.\d+)?\s*[hm]\s*)+)/((?:\d+(?:\.\d+)?\s*[hm]\s*)+)(?=\s|$)');
final _duePattern = RegExp(r'(?:^|\s)@([\w-]+)');
final _deadlinePattern = RegExp(r'(?:^|\s)!([\w-]+)');

int? _parseDurationMs(String input) {
  var total = 0;
  var matched = false;
  for (final match in _durationPart.allMatches(input)) {
    matched = true;
    final value = double.parse(match.group(1)!);
    total += match.group(2) == 'h' ? (value * 3600000).round() : (value * 60000).round();
  }
  return matched ? total : null;
}

String _formatDay(DateTime date) {
  final month = date.month.toString().padLeft(2, '0');
  final day = date.day.toString().padLeft(2, '0');
  return '${date.year}-$month-$day';
}

String? _resolveDay(String token, DateTime now) {
  switch (token.toLowerCase()) {
    case 'today':
      return _formatDay(now);
    case 'tomorrow':
      final tomorrow = now.add(const Duration(days: 1));
      return _formatDay(tomorrow);
    case 'yesterday':
      return _formatDay(now.subtract(const Duration(days: 1)));
    default:
      if (RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(token)) return token;
      final weekday = _weekdayFromName(token);
      if (weekday != null) {
        // Next occurrence of that weekday, always in the future.
        var delta = (weekday - now.weekday) % 7;
        if (delta == 0) delta = 7;
        return _formatDay(now.add(Duration(days: delta)));
      }
      return null;
  }
}

int? _weekdayFromName(String token) {
  const names = {
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6,
    'sunday': 7,
    'mon': 1,
    'tue': 2,
    'wed': 3,
    'thu': 4,
    'fri': 5,
    'sat': 6,
    'sun': 7,
  };
  return names[token.toLowerCase()];
}

ParsedTask parseShortSyntax(String input, {DateTime? now}) {
  final reference = now ?? DateTime.now();
  var remaining = input;
  final tags = <String>[];
  String? project;
  int? priority;
  int? estimateMs;
  int? spentMs;
  String? dueDay;
  String? deadlineDay;

  for (final match in _tagPattern.allMatches(remaining)) {
    tags.add(match.group(1)!.toLowerCase());
  }
  remaining = remaining.replaceAll(_tagPattern, ' ');

  final projectMatch = _projectPattern.firstMatch(remaining);
  if (projectMatch != null) project = projectMatch.group(1);
  remaining = remaining.replaceAll(_projectPattern, ' ');

  final priorityMatch = _priorityPattern.firstMatch(remaining);
  if (priorityMatch != null) priority = int.parse(priorityMatch.group(1)!);
  remaining = remaining.replaceAll(_priorityPattern, ' ');

  // `spent / estimate` must be consumed before the plain estimate form.
  final spentMatch = _spentEstimatePattern.firstMatch(remaining);
  if (spentMatch != null) {
    spentMs = _parseDurationMs(spentMatch.group(1)!);
    estimateMs = _parseDurationMs(spentMatch.group(2)!);
    remaining = remaining.replaceFirst(_spentEstimatePattern, ' ');
  } else {
    final durationMatch = _durationPattern.firstMatch(remaining);
    if (durationMatch != null) {
      estimateMs = _parseDurationMs(durationMatch.group(1)!);
      remaining = remaining.replaceFirst(_durationPattern, ' ');
    }
  }

  final dueMatch = _duePattern.firstMatch(remaining);
  if (dueMatch != null) {
    dueDay = _resolveDay(dueMatch.group(1)!, reference);
    if (dueDay != null) remaining = remaining.replaceFirst(_duePattern, ' ');
  }

  final deadlineMatch = _deadlinePattern.firstMatch(remaining);
  if (deadlineMatch != null) {
    deadlineDay = _resolveDay(deadlineMatch.group(1)!, reference);
    if (deadlineDay != null) remaining = remaining.replaceFirst(_deadlinePattern, ' ');
  }

  final title = remaining.replaceAll(RegExp(r'\s+'), ' ').trim();

  return ParsedTask(
    title: title,
    tags: tags,
    project: project,
    priority: priority,
    estimateMs: estimateMs,
    spentMs: spentMs,
    dueDay: dueDay,
    deadlineDay: deadlineDay,
  );
}
