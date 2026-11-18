/// Port of upstream Super Productivity's short-syntax text parser:
/// `src/app/features/tasks/short-syntax.ts` (v20.0.0), its position tracker
/// `tracked-title.ts`, `string-to-ms.pipe.ts` and the English subset of
/// `short-syntax-date-parser.ts`.
///
/// Pure Dart: no Flutter imports, no packages, no chrono-node.
///
/// Deliberate differences from upstream, each also marked at its site:
/// - Dates: chrono-node is replaced by a self-contained English grammar (see
///   `_parseDateLike`). Locale date words and the day/month order setting are
///   not ported, and chrono's relative shorthands ("2m" = in two minutes) are
///   not either.
/// - Recurrence: the `@every …` stage is NOT ported, so a recurrence phrase is
///   read exactly like upstream reads it with `isParseRepeat: false` (the title
///   edit path): the date found inside the phrase still applies, no repeat
///   config is produced.
/// - Ids: upstream returns tag ids, a project id and nanoid attachment ids.
///   This layer knows only titles (the caller resolves or creates entities), so
///   [ShortSyntaxResult.tagTitles], [ShortSyntaxResult.projectTitle] and
///   [ShortSyntaxAttachment] carry no ids.
/// - `dueTimeStr` (the DST escape hatch for a typed time that does not exist on
///   the resolved day) has no field in this API; the returned timestamp is all
///   there is.
/// - `issueId`: upstream silently skips priority, deadline, project and URL
///   parsing for issue tasks. That is a task property, not a text property, so
///   the caller decides: do not call this parser for issue titles, or pass a
///   config with those stages off.
library;

import '../core/day.dart';

/// Which syntax stages run. Defaults are upstream's
/// `DEFAULT_GLOBAL_CONFIG.shortSyntax`.
class ShortSyntaxConfig {
  const ShortSyntaxConfig({
    this.isEnableDue = true,
    this.isEnableDeadline = false,
    this.isEnableProject = true,
    this.isEnableTag = true,
    this.isEnableTimeEstimate = true,
    this.isEnablePriority = true,
    this.urlBehavior = ShortSyntaxUrlBehavior.keep,
  });

  final bool isEnableDue;

  /// Upstream: optional, absent means off.
  final bool isEnableDeadline;
  final bool isEnableProject;
  final bool isEnableTag;

  /// Upstream has no separate flag: the estimate stage is gated by
  /// [isEnableDue] alone. Defaults to on so the behaviour is identical.
  final bool isEnableTimeEstimate;

  /// Upstream: optional, absent means on.
  final bool isEnablePriority;

  /// Upstream: optional, absent / unknown means [ShortSyntaxUrlBehavior.keep].
  final ShortSyntaxUrlBehavior urlBehavior;
}

enum ShortSyntaxUrlBehavior { keep, extract, keepAndAttach }

enum ShortSyntaxTokenType { due, deadline, estimate, priority, tag, project, url }

/// A span of the *raw* input consumed by a parse stage, e.g. `@tomorrow`,
/// `#home`, `30m/1h`. A token whose consumed text is split by an earlier
/// removal ("@tomorrow evening" around a stripped "1h") yields one range per
/// contiguous run.
class ShortSyntaxRange {
  const ShortSyntaxRange(this.type, this.start, this.end);

  final ShortSyntaxTokenType type;
  final int start;
  final int end;

  @override
  bool operator ==(Object other) =>
      other is ShortSyntaxRange &&
      other.type == type &&
      other.start == start &&
      other.end == end;

  @override
  int get hashCode => Object.hash(type, start, end);

  @override
  String toString() => '${type.name}($start..$end)';
}

enum ShortSyntaxAttachmentType { link, image, file }

/// A URL or file path found in the title. Upstream's `TaskAttachment` also
/// carries a nanoid and an icon name; ids belong to the persistence layer and
/// an icon is a UI concern, so neither is produced here. Upstream also filters
/// out URLs the task already has as an attachment — that needs the task, so the
/// caller deduplicates.
class ShortSyntaxAttachment {
  const ShortSyntaxAttachment({
    required this.path,
    required this.type,
    required this.title,
  });

  final String path;
  final ShortSyntaxAttachmentType type;

  /// Upstream `_baseNameForUrl`: file name without directory or extension.
  final String title;

  @override
  String toString() => '${type.name}($path)';
}

class ShortSyntaxResult {
  const ShortSyntaxResult({
    required this.title,
    required this.hasChanges,
    this.dueWithTimeMs,
    this.dueDay,
    this.deadlineWithTimeMs,
    this.deadlineDay,
    this.timeEstimateMs,
    this.timeSpentMs,
    this.priority,
    this.tagTitles = const [],
    this.projectTitle,
    this.attachments = const [],
    this.ranges = const [],
  });

  /// Input minus the consumed tokens. Upstream trims, and collapses interior
  /// whitespace only on the URL-extract path — spaces between remaining words
  /// are kept otherwise, so this is not `raw.replaceAll(RegExp(r'\s+'), ' ')`.
  final String title;

  /// False when nothing was recognised. Upstream returns `undefined` in that
  /// case; a fresh result with an unchanged title carries the same information.
  final bool hasChanges;

  /// Epoch ms, when a clock time was given. Mutually exclusive with [dueDay].
  final int? dueWithTimeMs;

  /// `yyyy-MM-dd` (logical day) when only a day was given.
  final String? dueDay;

  final int? deadlineWithTimeMs;
  final String? deadlineDay;

  final int? timeEstimateMs;

  /// The left half of `30m/1h`. Upstream stores it in
  /// `taskSpentOnDay[getDbDateStr()]`; that needs the *task* date, so the value
  /// is returned and the caller decides where it goes.
  final int? timeSpentMs;

  /// 1 low, 2 medium, 3 high (upstream `p1` → 3).
  final int? priority;

  /// Known tag titles as written on the tag, or the typed title of a tag that
  /// does not exist yet. Order-preserving and deduplicated (upstream returns
  /// ids and deduplicates when it applies them).
  final List<String> tagTitles;

  /// The matched project's title, as known to the caller.
  final String? projectTitle;

  final List<ShortSyntaxAttachment> attachments;

  /// Positions in the raw input, sorted by start.
  final List<ShortSyntaxRange> ranges;
}

/// Parses short syntax out of [raw].
///
/// [startOfNextDayDiffMs] is upstream's logical-day offset
/// (`DateService.getStartOfNextDayDiffMs`): it only shifts which calendar day a
/// time-only schedule is filed under, the same way `todayStr` does.
ShortSyntaxResult parseShortSyntax(
  String raw, {
  required ShortSyntaxConfig config,
  required DateTime now,
  required int startOfNextDayDiffMs,
  required List<String> knownProjectTitles,
  required List<String> knownTagTitles,
}) {
  final tracked = _TrackedTitle(raw);
  final ranges = <ShortSyntaxRange>[];
  void addRanges(ShortSyntaxTokenType type, List<_TextRange> found) {
    for (final range in found) {
      ranges.add(ShortSyntaxRange(type, range.start, range.end));
    }
  }

  int? dueWithTimeMs;
  int? deadlineWithTimeMs;
  int? timeEstimateMs;
  int? timeSpentMs;
  int? priority;
  String? dueDay;
  String? deadlineDay;
  String? projectTitle;
  var tagTitles = const <String>[];
  var attachments = const <ShortSyntaxAttachment>[];
  var isTitleChanged = false;

  // First, so the due stage never sees the token: "@someday p1" would otherwise
  // hand its "1" to the numeric-hour fallback.
  if (config.isEnablePriority) {
    final result = _parsePriority(tracked);
    if (result != null) {
      priority = result.$1;
      addRanges(ShortSyntaxTokenType.priority, result.$2);
      isTitleChanged = true;
    }
  }

  if (config.isEnableDue) {
    if (config.isEnableTimeEstimate) {
      final result = _parseTimeSpent(tracked);
      if (result != null) {
        timeEstimateMs = result.estimateMs;
        timeSpentMs = result.spentMs;
        addRanges(ShortSyntaxTokenType.estimate, result.ranges);
        isTitleChanged = true;
      }
    }
    final result = _parseDateStage(
      tracked,
      now,
      _dueRegExp,
      isDeadline: false,
    );
    if (result != null) {
      if (result.date != null) {
        if (result.hasTime) {
          dueWithTimeMs = result.date!.millisecondsSinceEpoch;
          dueDay = null;
        } else {
          dueDay = _logicalDayStr(result.date!, startOfNextDayDiffMs);
          dueWithTimeMs = null;
        }
      }
      addRanges(ShortSyntaxTokenType.due, result.ranges);
      isTitleChanged = true;
    }
  }

  if (config.isEnableDeadline) {
    final result = _parseDateStage(
      tracked,
      now,
      _deadlineRegExp,
      isDeadline: true,
    );
    if (result != null) {
      if (result.date != null) {
        // Upstream keeps a noon timestamp for a day-only deadline and marks it
        // with `hasDeadlineTime: false`; here the two forms are split the same
        // way as dueDay/dueWithTime.
        if (result.hasTime) {
          deadlineWithTimeMs = result.date!.millisecondsSinceEpoch;
          deadlineDay = null;
        } else {
          deadlineDay = _logicalDayStr(result.date!, startOfNextDayDiffMs);
          deadlineWithTimeMs = null;
        }
      }
      addRanges(ShortSyntaxTokenType.deadline, result.ranges);
      isTitleChanged = true;
    }
  }

  if (config.isEnableProject) {
    final result = _parseProject(tracked, knownProjectTitles);
    if (result != null) {
      projectTitle = result.title;
      addRanges(ShortSyntaxTokenType.project, result.ranges);
      isTitleChanged = true;
    }
  }

  if (config.isEnableTag) {
    final result = _parseTags(tracked, knownTagTitles);
    tagTitles = result.titles;
    addRanges(ShortSyntaxTokenType.tag, result.ranges);
    isTitleChanged = isTitleChanged || result.isTitleChanged;
  }

  final urlResult = _parseUrlAttachments(tracked, config.urlBehavior);
  if (urlResult != null) {
    attachments = urlResult.attachments;
    addRanges(ShortSyntaxTokenType.url, urlResult.ranges);
  }

  final title = urlResult?.title ?? tracked.text;
  isTitleChanged = isTitleChanged || title != raw;
  ranges.sort((a, b) => a.start - b.start);

  return ShortSyntaxResult(
    title: title,
    hasChanges: isTitleChanged ||
        ranges.isNotEmpty ||
        attachments.isNotEmpty ||
        priority != null ||
        tagTitles.isNotEmpty ||
        projectTitle != null,
    dueWithTimeMs: dueWithTimeMs,
    dueDay: dueDay,
    deadlineWithTimeMs: deadlineWithTimeMs,
    deadlineDay: deadlineDay,
    timeEstimateMs: timeEstimateMs,
    timeSpentMs: timeSpentMs,
    priority: priority,
    tagTitles: tagTitles,
    projectTitle: projectTitle,
    attachments: attachments,
    ranges: ranges,
  );
}

String _logicalDayStr(DateTime date, int startOfNextDayDiffMs) =>
    dbDateStr(date.subtract(Duration(milliseconds: startOfNextDayDiffMs)));

// ---------------------------------------------------------------------------
// Position bookkeeping (upstream `TrackedTitle`)
// ---------------------------------------------------------------------------

class _TextRange {
  _TextRange(this.start, this.end);

  int start;
  int end;
}

final _wsRegExp = RegExp(r'\s');

class _TrackedTitle {
  _TrackedTitle(this.raw)
      : _text = raw,
        _offsets = List<int>.generate(raw.length, (i) => i);

  final String raw;
  String _text;

  /// `_offsets[i]` is the index in [_text]'s raw input of `_text[i]`.
  final List<int> _offsets;

  String get text => _text;

  /// Raw-input positions of the working-title span `[start, end)`, as maximal
  /// contiguous runs with whitespace trimmed off their edges.
  List<_TextRange> rawRanges(int start, int end) {
    final runs = <_TextRange>[];
    for (var i = start; i < end; i++) {
      final rawIndex = _offsets[i];
      final last = runs.isEmpty ? null : runs.last;
      if (last != null && rawIndex == last.end) {
        last.end = rawIndex + 1;
      } else {
        runs.add(_TextRange(rawIndex, rawIndex + 1));
      }
    }
    final visible = <_TextRange>[];
    for (final run in runs) {
      var s = run.start;
      var e = run.end;
      while (s < e && _wsRegExp.hasMatch(raw[s])) {
        s++;
      }
      while (e > s && _wsRegExp.hasMatch(raw[e - 1])) {
        e--;
      }
      if (e > s) visible.add(_TextRange(s, e));
    }
    return visible;
  }

  void remove(int start, int end) {
    _text = _text.substring(0, start) + _text.substring(end);
    _offsets.removeRange(start, end);
  }

  void trim() {
    var s = 0;
    var e = _text.length;
    while (s < e && _wsRegExp.hasMatch(_text[s])) {
      s++;
    }
    while (e > s && _wsRegExp.hasMatch(_text[e - 1])) {
      e--;
    }
    if (e < _text.length) remove(e, _text.length);
    if (s > 0) remove(0, s);
  }

  /// `.trim().replace(/\s+/g, ' ')`: every interior whitespace run becomes one
  /// space carrying the run's first raw position.
  void collapseWhitespace() {
    final text = StringBuffer();
    final offsets = <int>[];
    var pendingWsOffset = -1;
    for (var i = 0; i < _text.length; i++) {
      final ch = _text[i];
      if (_wsRegExp.hasMatch(ch)) {
        if (text.isNotEmpty && pendingWsOffset == -1) pendingWsOffset = _offsets[i];
      } else {
        if (pendingWsOffset != -1) {
          text.write(' ');
          offsets.add(pendingWsOffset);
          pendingWsOffset = -1;
        }
        text.write(ch);
        offsets.add(_offsets[i]);
      }
    }
    _text = text.toString();
    _offsets
      ..clear()
      ..addAll(offsets);
  }
}

// ---------------------------------------------------------------------------
// Token grammar (upstream's regexes, kept verbatim)
// ---------------------------------------------------------------------------

const _tagChar = '#';
const _plusChar = '+';

/// `/(?:\s|^)t?((?:\d+(?:\.\d+)?[mh]\s*)+)(?:\s*\/((?:\s*\d+(?:\.\d+)?[mh])+)?)?(?=\s|$)/`
final _timeSpentRegExp = RegExp(
  r'(?:\s|^)t?((?:\d+(?:\.\d+)?[mh]\s*)+)(?:\s*\/((?:\s*\d+(?:\.\d+)?[mh])+)?)?(?=\s|$)',
);

/// `/\+(?!\s)((?:(?!\s+(?:#|@|t?\d+[mh]\b)).)+)/`
final _projectRegExp =
    RegExp(r'\+(?!\s)((?:(?!\s+(?:#|@|t?\d+[mh]\b)).)+)');

/// `/#[^(+|#@!)\s]+/gi` — the char class is upstream's `[^${ALL_SPECIAL}|\s]`,
/// where ALL_SPECIAL expands to `(\+|#|@|!)`.
final _tagRegExp = RegExp(r'#[^()+|#@!\s]+', caseSensitive: false);

/// `/@[^(+|#@!)]+/gi` — note there is no `\s` here: a due match swallows the
/// rest of the line up to the next trigger character.
final _dueRegExp = RegExp(r'@[^()+|#@!]+', caseSensitive: false);

/// `!/[^(+|#@!)]+/gi`
final _deadlineRegExp = RegExp(r'![^()+|#@!]+', caseSensitive: false);

/// `/(?:^|\s)p([1-3])(?=\s|$)/`
final _priorityRegExp = RegExp(r'(?:^|\s)p([1-3])(?=\s|$)');

/// `/(?:\d{1,2})(\s*)(weekday)(?![\w])/` at the start of a due match.
final _nthWeekdayRegExp = RegExp(
  r'^(\d{1,2})(\s*)('
  r'mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?'
  r'|mon|tues?|wed|thu(?:rs?)?|fri|sat|sun'
  r')(?![\w])',
  caseSensitive: false,
);

/// `^(?:[1-9]\d{0,2})\s*…` — the clock-time-with-h form, `@09h`, `@14h30`.
final _hTimeRegExp = RegExp(
  r'^(\d{1,2})h(\d{2})?(?=[\s,.;:!?)]|$)',
  caseSensitive: false,
);

final _urlRegExp =
    RegExp(r'(?:(?:https?|file)://\S+|www\.\S+?)(?=\s|$)', caseSensitive: false);

final _markdownLinkRegExp =
    RegExp(r'\[([^\]]+)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)');

final _digitsRegExp = RegExp(r'\d+');
final _numericTagRegExp = RegExp(r'^[0-9]+$');

const _weekdayByUnit = <String, int>{
  'sun': 0,
  'sunday': 0,
  'mon': 1,
  'monday': 1,
  'tue': 2,
  'tues': 2,
  'tuesday': 2,
  'wed': 3,
  'wednesday': 3,
  'thu': 4,
  'thur': 4,
  'thurs': 4,
  'thursday': 4,
  'fri': 5,
  'friday': 5,
  'sat': 6,
  'saturday': 6,
};

int? _weekdayOfUnit(String unit) {
  final direct = _weekdayByUnit[unit];
  if (direct != null) return direct;
  if (unit.endsWith('s')) return _weekdayByUnit[unit.substring(0, unit.length - 1)];
  return null;
}

String _charAt(String text, int index) =>
    index < 0 || index >= text.length ? '' : text[index];

bool _isTokenBoundary(String text, int index) {
  final ch = _charAt(text, index);
  return ch.isEmpty || _wsRegExp.hasMatch(ch);
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

/// Every token is consumed and the last one wins ("p3 … p1" is High): a token
/// left in the title would be parsed again by the add-task effect, which
/// re-runs short syntax on the already-cleaned title.
(int, List<_TextRange>)? _parsePriority(_TrackedTitle tracked) {
  int? priority;
  final ranges = <_TextRange>[];
  var text = tracked.text;
  var match = _priorityRegExp.firstMatch(text);
  while (match != null) {
    // The match may start with the whitespace before the token.
    final start = match.start + match[0]!.length - 2;
    final end = start + 2;
    ranges.addAll(tracked.rawRanges(start, end));
    // Take one adjacent space with the token so a mid-title removal leaves no
    // double space behind ("Fix p1 login" → "Fix login").
    final hasSpaceAfter = _charAt(tracked.text, end).isNotEmpty &&
        _wsRegExp.hasMatch(_charAt(tracked.text, end));
    tracked.remove(start, hasSpaceAfter ? end + 1 : end);
    tracked.trim();
    priority = _priorityForToken[match[1]];
    text = tracked.text;
    match = _priorityRegExp.firstMatch(text);
  }
  return priority == null ? null : (priority, ranges);
}

const _priorityForToken = <String, int>{'1': 3, '2': 2, '3': 1};

// ---------------------------------------------------------------------------
// Time estimates ("30m", "1h/2h", "t30m")
// ---------------------------------------------------------------------------

({int? estimateMs, int? spentMs, List<_TextRange> ranges})? _parseTimeSpent(
  _TrackedTitle tracked,
) {
  if (tracked.text.isEmpty) return null;
  final match = _timeSpentRegExp.firstMatch(tracked.text);
  if (match == null) return null;

  final matchSpan = match[0]!;
  final preSplit = match[1];
  final postSplit = match[2];
  final start = match.start;
  final ranges = tracked.rawRanges(start, start + matchSpan.length);
  tracked.remove(start, start + matchSpan.length);
  tracked.trim();

  // Upstream: a "/" makes the left half the time already spent and the right
  // half the estimate; without it the whole thing is the estimate.
  final spentText = matchSpan.contains('/') ? preSplit : null;
  final estimateText = spentText == null ? preSplit : postSplit;

  int? sumMs(String? value) {
    if (value == null) return null;
    var total = 0;
    for (final part in value.split(RegExp(r'\s+'))) {
      total += _stringToMs(part);
    }
    return total;
  }

  return (
    estimateMs: sumMs(estimateText),
    spentMs: sumMs(spentText),
    ranges: ranges,
  );
}

/// Upstream `stringToMs`: "1.5h", "30m", "1h30m", "1:30", bare numbers.
int _stringToMs(String value) {
  if (value.isEmpty) return 0;
  var text = value.replaceFirst(',', '.');
  final simple = RegExp(r'^(\d*\.?\d+)([smh]?)$').firstMatch(text.trim());
  if (simple != null) {
    final amount = double.parse(simple[1]!);
    switch (simple[2]!.toLowerCase()) {
      case 's':
        return (amount * 1000).round();
      case 'm':
        return (amount * 1000 * 60).round();
      case 'h':
        return (amount * 1000 * 60 * 60).round();
      default:
        // all fractional values and integers <= 8 are hours, larger ones minutes
        return simple[1]!.contains('.') || amount <= 8
            ? (amount * 1000 * 60 * 60).round()
            : (amount * 1000 * 60).round();
    }
  }

  final full = RegExp(r'^(\d{1,2}):(\d{2})$').firstMatch(text.trim());
  if (full != null) {
    return int.parse(full[1]!) * 60 * 60 * 1000 +
        int.parse(full[2]!) * 60 * 1000;
  }

  double? seconds;
  double? minutes;
  double? hours;
  String? previousLastChar;
  text = text.replaceAllMapped(RegExp(r'([a-zA-Z]+)\s*'), (m) => '${m[1]} ');
  for (final raw in text.trim().split(' ')) {
    if (raw.isEmpty) continue;
    final lastChar = raw[raw.length - 1].toLowerCase();
    final amount = _parseFloatPrefix(raw);
    if (lastChar == 's') {
      seconds = amount;
    } else if (lastChar == 'm') {
      minutes = amount;
    } else if (lastChar == 'h') {
      hours = amount;
    } else if (previousLastChar == 'm') {
      seconds = amount;
    } else if (previousLastChar == 'h') {
      minutes = amount;
    }
    previousLastChar = lastChar;
  }
  if (seconds == null && minutes == null && hours == null) return 0;
  final s = seconds ?? 0;
  final m = minutes ?? 0;
  final h = hours ?? 0;
  return (s * 1000 + m * 1000 * 60 + h * 1000 * 60 * 60).round();
}

double _parseFloatPrefix(String value) {
  final match = RegExp(r'^[+-]?\d*\.?\d+').firstMatch(value);
  return match == null ? double.nan : double.parse(match[0]!);
}

// ---------------------------------------------------------------------------
// Tags ("#tag", existing titles with spaces)
// ---------------------------------------------------------------------------

class _TagResult {
  _TagResult(this.titles, this.ranges, this.isTitleChanged);

  final List<String> titles;
  final List<_TextRange> ranges;
  final bool isTitleChanged;
}

/// The tag regex stops at whitespace, but the autocomplete inserts full titles
/// ("#Deep Work"), so existing titles with spaces are matched literally first,
/// longest title first. Only exact titles count, so "#work meeting notes" stays
/// a single tag.
_TagResult _parseTags(_TrackedTitle tracked, List<String> knownTagTitles) {
  final titles = <String>[];
  final ranges = <_TextRange>[];
  var isTitleChanged = false;

  List<String> multiWordTitles = knownTagTitles
      .map((title) => title.trim())
      .where((title) => _wsRegExp.hasMatch(title))
      .toList()
    ..sort((a, b) => b.length - a.length);

  var start = tracked.text.indexOf(_tagChar);
  while (start != -1) {
    final text = tracked.text;
    final titleStart = start + 1;
    String? matched;
    if (_isTokenBoundary(text, start - 1)) {
      for (final title in multiWordTitles) {
        final end = titleStart + title.length;
        if (end > text.length) continue;
        if (text.substring(titleStart, end).toLowerCase() == title.toLowerCase() &&
            _isTokenBoundary(text, end)) {
          matched = title;
          break;
        }
      }
    }
    if (matched != null) {
      final end = titleStart + matched.length;
      ranges.addAll(tracked.rawRanges(start, end));
      tracked.remove(start, end);
      if (!_containsIgnoreCase(titles, matched)) titles.add(matched);
      start = tracked.text.indexOf(_tagChar, start);
    } else {
      start = text.indexOf(_tagChar, start + 1);
    }
  }

  final initialTitle = tracked.text;
  final regexTagTitles =
      _tagRegExp.allMatches(initialTitle).map((m) => m[0]!).toList();

  if (regexTagTitles.isNotEmpty || titles.isNotEmpty) {
    final filtered = <String>[];
    for (final rawTitle in regexTagTitles) {
      final newTagTitle = rawTitle.trim().replaceFirst(_tagChar, '');
      final charBefore = _charAt(
        initialTitle,
        initialTitle.lastIndexOf('$_tagChar$newTagTitle') - 1,
      );
      // don't parse "Fun title#blu" as a tag
      if (charBefore.isNotEmpty && charBefore != ' ') continue;

      final trimmedTitle = initialTitle.trim();
      final tagStartIndex =
          trimmedTitle.lastIndexOf('$_tagChar$newTagTitle');
      // Numeric tags are blocked at the start of the title ("#123 Task").
      final isNumericOnly = _numericTagRegExp.hasMatch(newTagTitle);
      if (newTagTitle.isNotEmpty &&
          tagStartIndex != -1 &&
          (!isNumericOnly || tagStartIndex > 0)) {
        filtered.add(newTagTitle);
      }
    }

    for (final title in filtered) {
      final knownIndex = knownTagTitles.indexWhere(
        (knownTitle) => knownTitle.toLowerCase() == title.toLowerCase(),
      );
      final resolved = knownIndex == -1 ? title : knownTagTitles[knownIndex];
      if (!_containsIgnoreCase(titles, resolved)) titles.add(resolved);
    }

    if (filtered.isNotEmpty || titles.isNotEmpty) {
      for (final title in filtered) {
        final matchedText = '$_tagChar$title';
        final index = tracked.text.indexOf(matchedText);
        if (index != -1) {
          ranges.addAll(tracked.rawRanges(index, index + matchedText.length));
          tracked.remove(index, index + matchedText.length);
        }
      }
      tracked.trim();
      isTitleChanged = true;
    }
  }

  return _TagResult(titles, ranges, isTitleChanged);
}

bool _containsIgnoreCase(List<String> values, String value) => values
    .any((existing) => existing.toLowerCase() == value.toLowerCase());

// ---------------------------------------------------------------------------
// Projects ("+project")
// ---------------------------------------------------------------------------

class _ProjectResult {
  _ProjectResult(this.title, this.ranges);

  final String title;
  final List<_TextRange> ranges;
}

class _MatchableProject {
  _MatchableProject(this.title)
      : words = _toWords(title),
        squashedTitle = title.replaceAll(' ', '').toLowerCase();

  final String title;
  final List<String> words;

  /// Title with all whitespace removed, to match titles typed without spaces.
  final String squashedTitle;
}

List<String> _toWords(String title) =>
    title.trim().toLowerCase().split(RegExp(r'\s+'));

bool _isFullyTypedProjectTitle(
  _MatchableProject project,
  List<String> typedWords,
) =>
    project.words.length == typedWords.length &&
    Iterable<int>.generate(project.words.length)
        .every((i) => project.words[i] == typedWords[i]);

/// A partially typed title may only shorten its last word ("+Some Pro"),
/// otherwise task content would get pulled in ("+Home work on taxes" must not
/// match a project "Homework"). A single word may also be typed without any
/// whitespace at all ("+SomePro").
bool _isPartiallyTypedProjectTitle(
  _MatchableProject project,
  List<String> typedWords,
) =>
    typedWords.length == 1
        ? project.squashedTitle.startsWith(typedWords[0])
        : typedWords.length <= project.words.length &&
            Iterable<int>.generate(typedWords.length).every((i) =>
                i == typedWords.length - 1
                    ? project.words[i].startsWith(typedWords[i])
                    : project.words[i] == typedWords[i]);

_ProjectResult? _parseProject(
  _TrackedTitle tracked,
  List<String> knownProjectTitles,
) {
  if (tracked.text.isEmpty || knownProjectTitles.isEmpty) return null;

  final match = _projectRegExp.firstMatch(tracked.text);
  if (match == null || match[0]!.isEmpty) return null;

  final projectTitle = match[0]!.trim().replaceFirst(_plusChar, '');
  final projectTitleToMatch = projectTitle.replaceAll(' ', '').toLowerCase();
  final indexBeforePlus =
      tracked.text.toLowerCase().lastIndexOf('$_plusChar$projectTitleToMatch') -
          1;
  final charBeforePlus = _charAt(tracked.text, indexBeforePlus);
  // don't parse "Fun title+blu" as a project
  if (charBeforePlus.isNotEmpty && charBeforePlus != ' ') return null;

  List<_TextRange> consume(String matchedText) {
    final start = tracked.text.indexOf(matchedText);
    if (start == -1) return const [];
    final ranges = tracked.rawRanges(start, start + matchedText.length);
    tracked.remove(start, start + matchedText.length);
    tracked.trim();
    // get rid of excess whitespace a mid-title removal leaves behind
    final doubleSpaceIdx = tracked.text.indexOf('  ');
    if (doubleSpaceIdx != -1) tracked.remove(doubleSpaceIdx, doubleSpaceIdx + 1);
    return ranges;
  }

  final matchableProjects = knownProjectTitles
      .map((title) => _MatchableProject(title))
      .toList()
    ..sort((a, b) => a.title.length - b.title.length);

  final maxNrOfWords =
      matchableProjects.fold(0, (max, p) => p.words.length > max ? p.words.length : max);
  final candidateWordEnds = RegExp(r'\S+')
      .allMatches(projectTitle)
      .map((m) => m.end)
      .toList();

  ({String title, String typedTitle})? findLongestTypedPrefix(
    bool Function(_MatchableProject, List<String>) isMatch,
  ) {
    final highest = candidateWordEnds.length < maxNrOfWords
        ? candidateWordEnds.length
        : maxNrOfWords;
    for (var nrOfWords = highest; nrOfWords > 0; nrOfWords--) {
      final typedTitle = projectTitle.substring(0, candidateWordEnds[nrOfWords - 1]);
      final typedWords = _toWords(typedTitle);
      for (final project in matchableProjects) {
        if (isMatch(project, typedWords)) {
          return (title: project.title, typedTitle: typedTitle);
        }
      }
    }
    return null;
  }

  // A fully typed title (what the autocomplete inserts) always wins, so that
  // "+Work in progress" stays in project "Work" even when "Work Inbox" exists.
  final prefix = findLongestTypedPrefix(_isFullyTypedProjectTitle) ??
      findLongestTypedPrefix(_isPartiallyTypedProjectTitle);
  if (prefix == null) return null;

  return _ProjectResult(
    prefix.title,
    consume('$_plusChar${prefix.typedTitle}'),
  );
}

// ---------------------------------------------------------------------------
// Dates: due ("@…") and deadline ("!…")
// ---------------------------------------------------------------------------

class _DateStageResult {
  const _DateStageResult({this.date, required this.hasTime, required this.ranges});

  /// Null when the token was recognised but resolves to no date ("@9monday").
  final DateTime? date;

  /// Whether a clock time was given (upstream's "hour is certain").
  final bool hasTime;
  final List<_TextRange> ranges;
}

class _NthWeekday {
  const _NthWeekday(this.nth, this.weekday, this.chronoText, this.consumedLength);

  final int nth;
  final int weekday;
  final String chronoText;
  final int consumedLength;
}

class _DateMatch {
  const _DateMatch(
    this.index,
    this.text,
    this.date, {
    required this.hasTime,
    this.isTimeOnly = false,
  });

  final int index;
  final String text;
  final DateTime date;
  final bool hasTime;

  /// A match that carries a clock time and no date of its own ("3pm").
  final bool isTimeOnly;
}

_DateStageResult? _parseDateStage(
  _TrackedTitle tracked,
  DateTime now,
  RegExp regExp, {
  required bool isDeadline,
}) {
  if (tracked.text.isEmpty) return null;
  final text = tracked.text;

  // A deadline trigger only counts at the start of the title or after a space
  // (so "Done!" is not a deadline). Skip a match that fails this check rather
  // than giving up, so "wow! !tomorrow" still finds "!tomorrow" (#10217).
  RegExpMatch? selected;
  for (final match in regExp.allMatches(text)) {
    final charBefore = match.start > 0 ? text[match.start - 1] : '';
    if (!isDeadline || charBefore.isEmpty || charBefore == ' ') {
      selected = match;
      break;
    }
  }
  if (selected == null || selected[0]!.isEmpty) return null;

  final triggerIndex = selected.start;
  final triggerMatch = selected[0]!;

  // Before the date parser and before the numeric-hour fallback: "@2monday" is
  // a plain date, not 02:00 with a leftover weekday.
  final nth = _parseNthWeekday(triggerMatch.substring(1));
  if (nth != null) {
    return _applyNthWeekday(tracked, now, triggerMatch, triggerIndex, nth);
  }

  List<_TextRange> consume(String textToConsume) {
    final removeStart = tracked.text.indexOf(textToConsume, triggerIndex);
    if (removeStart == -1) return const [];
    final ranges = tracked.rawRanges(removeStart, removeStart + textToConsume.length);
    tracked.remove(removeStart, removeStart + textToConsume.length);
    tracked.trim();
    return ranges;
  }

  // Before the date parser, which reads "@09h" as "in 9 hours" (#11180).
  final hourMatch = _hTimeRegExp.firstMatch(triggerMatch.substring(1));
  if (hourMatch != null) {
    final hours = int.parse(hourMatch[1]!);
    final minutes = hourMatch[2] == null ? 0 : int.parse(hourMatch[2]!);
    var due = _nextClockTimeMs(now, hours, minutes);
    if (due == null) {
      // "@25h" is no clock time: keep it in the title rather than guess.
      return null;
    }
    var consumedLength = 1 + hourMatch[0]!.length;
    // A day right after the time sets the day: "@18h tomorrow"
    final rest = triggerMatch.substring(consumedLength);
    final day = rest.isEmpty ? null : _parseDateLike(rest, now);
    if (day != null && rest.substring(0, day.index).trim().isEmpty && !day.hasTime) {
      final date = DateTime(day.date.year, day.date.month, day.date.day, hours, minutes);
      due = date.millisecondsSinceEpoch;
      consumedLength += day.index + day.text.length;
    }
    final ranges = consume(triggerMatch.substring(0, consumedLength));
    return _DateStageResult(
      date: DateTime.fromMillisecondsSinceEpoch(due),
      hasTime: true,
      ranges: ranges,
    );
  }

  final parsed = _parseDateLike(triggerMatch, now);
  if (parsed != null) {
    final ranges = consume(
      triggerMatch.substring(0, parsed.index + parsed.text.length),
    );
    return _DateStageResult(
      date: parsed.date,
      hasTime: parsed.hasTime,
      ranges: ranges,
    );
  }

  // Fallback for a bare hour: "@4" means 04:00.
  final simpleMatch = _digitsRegExp.firstMatch(triggerMatch);
  if (simpleMatch != null) {
    final nr = int.parse(simpleMatch[0]!);
    if (nr <= 24) {
      var due = DateTime(now.year, now.month, now.day, nr);
      // If the scheduled time has already passed today, schedule for tomorrow.
      if (!due.isAfter(now)) {
        due = DateTime(now.year, now.month, now.day + 1, nr);
      }
      final ranges = consume(
        triggerMatch.substring(0, simpleMatch.start + simpleMatch[0]!.length),
      );
      return _DateStageResult(date: due, hasTime: true, ranges: ranges);
    }
  }

  return null;
}

/// An nth weekday ("@2monday", "@2 mon", "@4TUE") at the start of a due match:
/// `n` counts occurrences from today, 1..5, where 1 is the next one.
_NthWeekday? _parseNthWeekday(String dueMatchContent) {
  final match = _nthWeekdayRegExp.firstMatch(dueMatchContent);
  if (match == null) return null;
  final spaced = match[2]!.isNotEmpty;
  final nth = int.parse(match[1]!);
  // The spaced form only claims a single digit 1..5: "@10 fri" is an hour plus
  // a weekday, and "@05 fri" keeps its leading zero for the same reason.
  if (spaced && !RegExp(r'^[1-5]$').hasMatch(match[1]!)) return null;
  final weekday = _weekdayOfUnit(match[3]!.toLowerCase());
  if (weekday == null) return null;
  return _NthWeekday(
    nth,
    weekday,
    dueMatchContent.substring(match[0]!.length),
    match[0]!.length,
  );
}

_DateStageResult _applyNthWeekday(
  _TrackedTitle tracked,
  DateTime now,
  String dueMatch,
  int triggerIndex,
  _NthWeekday nth,
) {
  final parsed = nth.chronoText.isEmpty
      ? null
      : _parseDateLike(nth.chronoText, now);
  // Only absorb a time-only match that directly follows the phrase; the date
  // comes from the phrase, so "@2fri tomorrow" leaves "tomorrow" in the title.
  final timeMatch = parsed != null &&
          nth.chronoText.substring(0, parsed.index).trim().isEmpty &&
          parsed.isTimeOnly
      ? parsed
      : null;

  final consumedTotal = 1 +
      nth.consumedLength +
      (timeMatch == null ? 0 : timeMatch.index + timeMatch.text.length);
  final textToReplace = dueMatch.substring(0, consumedTotal);
  // Anchor at the selected match, like the date branch's consume(): the same
  // token text can appear earlier in the title ("wow!2monday !2monday").
  final tokenStart = tracked.text.indexOf(textToReplace, triggerIndex);
  if (tokenStart == -1) return const _DateStageResult(hasTime: false, ranges: []);
  final tokenEnd = tokenStart + textToReplace.length;
  final ranges = tracked.rawRanges(tokenStart, tokenEnd);
  _removeWithSurroundingWhitespace(tracked, tokenStart, tokenEnd);

  // Outside 1..5 the token is still consumed but resolves to no date, which
  // stops the numeric-hour fallback turning "@9monday" into 09:00.
  if (nth.nth < 1 || nth.nth > 5) {
    return _DateStageResult(hasTime: false, ranges: ranges);
  }

  final parsedTime = timeMatch?.date;
  var dueDate = _nextWeekdayDate(now, nth.weekday);
  if (parsedTime != null) {
    dueDate = DateTime(
      dueDate.year,
      dueDate.month,
      dueDate.day,
      parsedTime.hour,
      parsedTime.minute,
    );
  }
  // Match the strict forward comparison: an occurrence exactly at now still
  // counts as today.
  if (dueDate.isBefore(now)) {
    dueDate = DateTime(
      dueDate.year,
      dueDate.month,
      dueDate.day + 7,
      dueDate.hour,
      dueDate.minute,
    );
  }
  // Higher counts continue from that first occurrence, so n is strictly
  // increasing: on a Monday afternoon "@1monday" is next Monday and "@2monday"
  // the one after it.
  if (nth.nth > 1) {
    dueDate = DateTime(
      dueDate.year,
      dueDate.month,
      dueDate.day + (nth.nth - 1) * 7,
      dueDate.hour,
      dueDate.minute,
    );
  }

  return _DateStageResult(
    date: dueDate,
    hasTime: parsedTime != null,
    ranges: ranges,
  );
}

/// Trailing punctuation stays in the title, joined to the preceding word
/// ("Water plants @every friday." → "Water plants."); a mid-title removal must
/// not leave a double space either.
void _removeWithSurroundingWhitespace(
  _TrackedTitle tracked,
  int tokenStart,
  int tokenEnd,
) {
  final head = tracked.text.substring(0, tokenStart);
  final tail = tracked.text.substring(tokenEnd);
  if (RegExp(r'^[.,;:!?]').hasMatch(tail)) {
    var wsStart = tokenStart;
    while (wsStart > 0 && _wsRegExp.hasMatch(tracked.text[wsStart - 1])) {
      wsStart--;
    }
    tracked.remove(wsStart, tokenEnd);
  } else if (RegExp(r'\s$').hasMatch(head) && RegExp(r'^\s').hasMatch(tail)) {
    final tailWs = RegExp(r'^\s+').firstMatch(tail);
    tracked.remove(tokenStart, tokenEnd + (tailWs == null ? 0 : tailWs[0]!.length));
  } else {
    tracked.remove(tokenStart, tokenEnd);
  }
  tracked.trim();
}

// ------------------------- chrono-node replacement -------------------------

const _monthByPrefix = <String, int>{
  'jan': 1,
  'feb': 2,
  'mar': 3,
  'apr': 4,
  'may': 5,
  'jun': 6,
  'jul': 7,
  'aug': 8,
  'sep': 9,
  'oct': 10,
  'nov': 11,
  'dec': 12,
};

int? _monthOfWord(String word) {
  final lower = word.toLowerCase();
  for (final entry in _monthByPrefix.entries) {
    if (lower.startsWith(entry.key)) return entry.value;
  }
  return null;
}

final _isoDateRegExp =
    RegExp(r'^(\d{4})-(\d{1,2})-(\d{1,2})([T ](\d{1,2}):(\d{2}))?(?!\d)');

final _numericDateRegExp =
    RegExp(r'^(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{2,4}))?(?!\d)');

final _monthDayRegExp = RegExp(
  r'^([a-zA-Z]{3,9})\.?\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?'
  r'(?:(?:,|\s)\s*(\d{4}))?',
);

final _dayMonthRegExp = RegExp(
  r'^(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]{3,9})\.?',
);

final _dayWordRegExp = RegExp(r'^(today|tomorrow|yesterday)\b', caseSensitive: false);

final _inRegExp = RegExp(
  r'^in\s+(\d{1,3})\s+(second|minute|hour|day|week|month|year)s?\b',
  caseSensitive: false,
);

final _weekdayRegExp = RegExp(
  r'^(next\s+|this\s+)?(sundays?|mondays?|tuesdays?|wednesdays?|thursdays?'
  r'|fridays?|saturdays?|sun|mon|tues|tue|wed|thu|thur|thurs|fri|sat)\b',
  caseSensitive: false,
);

const _weekdaySource =
    r'(sundays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?'
    r'|sun|mon|tues|tue|wed|thu|thur|thurs|fri|sat)';

final _hourWeekdayRegExp = RegExp(
  r'^(\d{1,2})\s+' + _weekdaySource + r'\b',
  caseSensitive: false,
);

final _timeMeridianRegExp = RegExp(
  r'^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b',
  caseSensitive: false,
);

final _time24RegExp = RegExp(r'^(?:at\s+)?(\d{1,2}):(\d{2})\b');

DateTime _nextWeekdayDate(DateTime now, int weekday) {
  final jsWeekday = now.weekday % 7;
  final diff = (weekday - jsWeekday + 7) % 7;
  return DateTime(now.year, now.month, now.day + diff, 12);
}

int? _nextClockTimeMs(DateTime now, int hours, int minutes) {
  if (hours > 23 || minutes > 59) return null;
  final due = DateTime(now.year, now.month, now.day, hours, minutes);
  if (!due.isAfter(now)) {
    return DateTime(now.year, now.month, now.day + 1, hours, minutes)
        .millisecondsSinceEpoch;
  }
  return due.millisecondsSinceEpoch;
}

/// The English date grammar that stands in for chrono-node.
///
/// Upstream feeds the whole due/deadline token (trigger char included) to
/// chrono and consumes everything up to the end of chrono's match, so the scan
/// only has to agree on where a match starts and where it ends. Supported:
/// ISO dates (optionally with `T`/space time), `12/20/25` and `20.12.2025`
/// numeric dates (month-first; the first number is the day when it cannot be a
/// month), month-name dates both ways, weekday names with an optional
/// `next`/`this` and an optional clock time, today/tomorrow/yesterday, "in 3
/// days", and clock times ("5pm", "17:00", "at 5pm").
///
/// Not ported: other languages, the day/month order setting, "tonight"/"noon"
/// style words, and chrono's relative shorthands ("2m" = in two minutes,
/// "9h" = in nine hours — the caller's clock-time stage covers the latter).
_DateMatch? _parseDateLike(String text, DateTime now) {
  for (var i = 0; i < text.length; i++) {
    final code = text.codeUnitAt(i);
    final isWordChar = (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122);
    if (!isWordChar) continue;
    // A match never starts in the middle of a word ("x12", "mp3").
    if (i > 0) {
      final prev = text.codeUnitAt(i - 1);
      final prevIsWordChar = (prev >= 48 && prev <= 57) ||
          (prev >= 65 && prev <= 90) ||
          (prev >= 97 && prev <= 122);
      if (prevIsWordChar) continue;
    }
    final match = _matchAt(text.substring(i), i, now);
    if (match != null) return match;
  }
  return null;
}

_DateMatch? _matchAt(String rest, int index, DateTime now) {
  // ISO date, optional time.
  var match = _isoDateRegExp.firstMatch(rest);
  if (match != null) {
    final year = int.parse(match[1]!);
    final month = int.parse(match[2]!);
    final day = int.parse(match[3]!);
    final hour = match[5] == null ? 12 : int.parse(match[5]!);
    final minute = match[6] == null ? 0 : int.parse(match[6]!);
    if (_isValidDate(year, month, day) && hour <= 23 && minute <= 59) {
      final hasTime = match[5] != null;
      return _DateMatch(
        index,
        match[0]!,
        DateTime(year, month, day, hour, minute),
        hasTime: hasTime,
      );
    }
  }

  // "10 fri": a clock hour followed by a weekday, which chrono merges into
  // that weekday at that hour (kept apart from the nth-weekday token, whose
  // spaced form only takes 1..5).
  match = _hourWeekdayRegExp.firstMatch(rest);
  if (match != null) {
    final hour = int.parse(match[1]!);
    final weekday = _weekdayOfUnit(match[2]!.toLowerCase());
    if (weekday != null && hour <= 23) {
      var date = _nextWeekdayDate(now, weekday);
      date = DateTime(date.year, date.month, date.day, hour, 0);
      if (date.isBefore(now)) {
        date = DateTime(date.year, date.month, date.day + 7, hour, 0);
      }
      return _DateMatch(index, match[0]!, date, hasTime: true);
    }
  }

  // Weekday, optionally "next"/"this" and optionally with a clock time.
  match = _weekdayRegExp.firstMatch(rest);
  if (match != null) {
    final weekday = _weekdayOfUnit(match[2]!.toLowerCase());
    if (weekday != null) {
      final isNext = (match[1] ?? '').trim().toLowerCase() == 'next';
      var end = match[0]!.length;
      var hasTime = false;
      var hour = 12;
      var minute = 0;
      final time = _matchTimeAt(rest, end);
      if (time != null) {
        hasTime = true;
        hour = time.hour;
        minute = time.minute;
        end = time.end;
      }
      var date = _nextWeekdayDate(now, weekday);
      date = DateTime(date.year, date.month, date.day, hour, minute);
      // "next friday" is the Friday of next week, like chrono's "next".
      if (isNext) {
        date = DateTime(date.year, date.month, date.day + 7, hour, minute);
      }
      if (date.isBefore(now)) {
        date = DateTime(date.year, date.month, date.day + 7, hour, minute);
      }
      return _DateMatch(
        index,
        rest.substring(0, end),
        date,
        hasTime: hasTime,
      );
    }
  }

  // today / tomorrow / yesterday, with an optional clock time.
  match = _dayWordRegExp.firstMatch(rest);
  if (match != null) {
    final word = match[1]!.toLowerCase();
    var end = match[0]!.length;
    var hasTime = false;
    var hour = 12;
    var minute = 0;
    final time = _matchTimeAt(rest, end);
    if (time != null) {
      hasTime = true;
      hour = time.hour;
      minute = time.minute;
      end = time.end;
    }
    final shift = word == 'tomorrow' ? 1 : (word == 'yesterday' ? -1 : 0);
    return _DateMatch(
      index,
      rest.substring(0, end),
      DateTime(now.year, now.month, now.day + shift, hour, minute),
      hasTime: hasTime,
    );
  }

  // "dec 24", "march 22 2027"
  match = _monthDayRegExp.firstMatch(rest);
  if (match != null) {
    final month = _monthOfWord(match[1]!);
    if (month != null) {
      final day = int.parse(match[2]!);
      final year = match[3] == null ? null : int.parse(match[3]!);
      if (_isValidDate(year ?? now.year, month, day)) {
        return _dayInMonth(index, rest, match[0]!, month, day, year, now);
      }
    }
  }

  // "24 dec", "24th December"
  match = _dayMonthRegExp.firstMatch(rest);
  if (match != null) {
    final month = _monthOfWord(match[2]!);
    final day = int.parse(match[1]!);
    if (month != null && _isValidDate(now.year, month, day)) {
      return _dayInMonth(index, rest, match[0]!, month, day, null, now);
    }
  }

  // Numeric dates: "12/20/25", "20.12.2025", "3/1".
  match = _numericDateRegExp.firstMatch(rest);
  if (match != null) {
    final first = int.parse(match[1]!);
    final second = int.parse(match[3]!);
    // Month-first, unless the first number cannot be a month (quoted upstream
    // behaviour: "25/4" is 25 April even for a month-first format).
    final month = first > 12 ? second : first;
    final day = first > 12 ? first : second;
    final yearText = match[4];
    int? year;
    if (yearText != null) {
      final parsed = int.parse(yearText);
      year = yearText.length == 2 ? 2000 + parsed : parsed;
    }
    if (_isValidDate(year ?? now.year, month, day)) {
      var end = match[0]!.length;
      var hasTime = false;
      var hour = 12;
      var minute = 0;
      final time = _matchTimeAt(rest, end);
      if (time != null) {
        hasTime = true;
        hour = time.hour;
        minute = time.minute;
        end = time.end;
      }
      var date = DateTime(year ?? now.year, month, day, hour, minute);
      // Without a year, take the next occurrence of that day.
      if (year == null && date.isBefore(now)) {
        date = DateTime(now.year + 1, month, day, hour, minute);
      }
      return _DateMatch(index, rest.substring(0, end), date, hasTime: hasTime);
    }
  }

  // "in 3 days"
  match = _inRegExp.firstMatch(rest);
  if (match != null) {
    final amount = int.parse(match[1]!);
    switch (match[2]!.toLowerCase()) {
      case 'second':
        return _DateMatch(
          index,
          match[0]!,
          now.add(Duration(seconds: amount)),
          hasTime: true,
        );
      case 'minute':
        return _DateMatch(
          index,
          match[0]!,
          now.add(Duration(minutes: amount)),
          hasTime: true,
        );
      case 'hour':
        return _DateMatch(
          index,
          match[0]!,
          now.add(Duration(hours: amount)),
          hasTime: true,
        );
      case 'day':
        return _DateMatch(
          index,
          match[0]!,
          DateTime(now.year, now.month, now.day + amount, 12),
          hasTime: false,
        );
      case 'week':
        return _DateMatch(
          index,
          match[0]!,
          DateTime(now.year, now.month, now.day + amount * 7, 12),
          hasTime: false,
        );
      case 'month':
        return _DateMatch(
          index,
          match[0]!,
          DateTime(now.year, now.month + amount, now.day, 12),
          hasTime: false,
        );
      default:
        return _DateMatch(
          index,
          match[0]!,
          DateTime(now.year + amount, now.month, now.day, 12),
          hasTime: false,
        );
    }
  }

  // A clock time on its own: "5pm", "17:00", "at 5pm".
  final time = _matchTimeAt(rest, 0);
  if (time != null) {
    final due = DateTime(now.year, now.month, now.day, time.hour, time.minute);
    final date = due.isAfter(now)
        ? due
        : DateTime(now.year, now.month, now.day + 1, time.hour, time.minute);
    return _DateMatch(
      index,
      rest.substring(0, time.end),
      date,
      hasTime: true,
      isTimeOnly: true,
    );
  }

  return null;
}

_DateMatch _dayInMonth(
  int index,
  String rest,
  String matchedText,
  int month,
  int day,
  int? year,
  DateTime now,
) {
  var end = matchedText.length;
  var hasTime = false;
  var hour = 12;
  var minute = 0;
  final time = _matchTimeAt(rest, end);
  if (time != null) {
    hasTime = true;
    hour = time.hour;
    minute = time.minute;
    end = time.end;
  }
  var date = DateTime(year ?? now.year, month, day, hour, minute);
  if (year == null && date.isBefore(now)) {
    date = DateTime(now.year + 1, month, day, hour, minute);
  }
  return _DateMatch(index, rest.substring(0, end), date, hasTime: hasTime);
}

bool _isValidDate(int year, int month, int day) {
  if (month < 1 || month > 12 || day < 1) return false;
  final daysInMonth = DateTime(year, month + 1, 0).day;
  return day <= daysInMonth;
}

({int end, int hour, int minute})? _matchTimeAt(String text, int start) {
  var offset = start;
  while (offset < text.length && _wsRegExp.hasMatch(text[offset])) {
    offset++;
  }
  final rest = text.substring(offset);

  var match = _timeMeridianRegExp.firstMatch(rest);
  if (match != null) {
    var hour = int.parse(match[1]!);
    final minute = match[2] == null ? 0 : int.parse(match[2]!);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (match[3]!.toLowerCase() == 'pm' && hour != 12) hour += 12;
    if (match[3]!.toLowerCase() == 'am' && hour == 12) hour = 0;
    return (end: offset + match[0]!.length, hour: hour, minute: minute);
  }

  match = _time24RegExp.firstMatch(rest);
  if (match != null) {
    final hour = int.parse(match[1]!);
    final minute = int.parse(match[2]!);
    if (hour > 23 || minute > 59) return null;
    return (end: offset + match[0]!.length, hour: hour, minute: minute);
  }

  return null;
}

// ---------------------------------------------------------------------------
// URLs and markdown links
// ---------------------------------------------------------------------------

class _UrlResult {
  _UrlResult(this.attachments, this.title, this.ranges);

  final List<ShortSyntaxAttachment> attachments;
  final String title;
  final List<_TextRange> ranges;
}

/// Collapses every markdown link `[text](url)` down to its display text.
/// A match with an empty destination (`[text]()`) is left alone: it yields no
/// URL, so extracting it would delete characters without producing anything.
({List<String> urls, List<_TextRange> ranges}) _collapseMarkdownLinks(
  _TrackedTitle tracked,
) {
  if (!tracked.text.contains('](')) {
    return (urls: const [], ranges: const []);
  }
  final urls = <String>[];
  final ranges = <_TextRange>[];
  // Right-to-left so earlier removals don't shift later match positions.
  final matches = _markdownLinkRegExp.allMatches(tracked.text).toList().reversed;
  for (final match in matches) {
    final start = match.start;
    final displayText = match[1]!;
    final url = match[2]!;
    if (url.isEmpty) continue;
    urls.insert(0, url);
    final tailStart = start + 1 + displayText.length;
    final tailEnd = start + match[0]!.length;
    ranges.insertAll(0, tracked.rawRanges(tailStart, tailEnd));
    tracked.remove(tailStart, tailEnd);
    ranges.insertAll(0, tracked.rawRanges(start, start + 1));
    tracked.remove(start, start + 1);
  }
  return (urls: urls, ranges: ranges);
}

_UrlResult? _parseUrlAttachments(
  _TrackedTitle tracked,
  ShortSyntaxUrlBehavior behavior,
) {
  if (tracked.text.isEmpty) return null;
  final titleBefore = tracked.text;

  // 1. Collapse markdown links first — they take priority over plain URL
  // matching, which would otherwise greedily include the closing ')'.
  // 2. Then match the remaining plain URLs in what is left.
  // Both run on a scratch tracker: nothing may be removed from the real title
  // until we know there is a URL to extract.
  final scratch = _TrackedTitle(titleBefore);
  final markdownUrls = _collapseMarkdownLinks(scratch).urls;
  final plainUrlMatches =
      _urlRegExp.allMatches(scratch.text).map((m) => m[0]!).toList();

  final allUrls = [...markdownUrls, ...plainUrlMatches];
  if (allUrls.isEmpty) return null;
  if (behavior == ShortSyntaxUrlBehavior.keep) return null;

  final ranges = <_TextRange>[];
  var cleanedTitle = titleBefore;
  if (behavior == ShortSyntaxUrlBehavior.extract) {
    ranges.addAll(_collapseMarkdownLinks(tracked).ranges);
    // Remove every occurrence of each plain URL, normalized the same way the
    // attachment path is: trimmed, trailing punctuation stripped.
    for (final url in plainUrlMatches) {
      final path = _normalizeUrl(url);
      var originalUrl = path;
      if (originalUrl.startsWith('//')) originalUrl = originalUrl.substring(2);
      final spans = RegExp(RegExp.escape(originalUrl))
          .allMatches(tracked.text)
          .map((m) => (start: m.start, end: m.end))
          .toList()
          .reversed;
      for (final span in spans) {
        ranges.addAll(tracked.rawRanges(span.start, span.end));
        tracked.remove(span.start, span.end);
      }
    }
    tracked.collapseWhitespace();
    cleanedTitle = tracked.text;

    // If the title is empty after extracting URLs, use a URL basename as the
    // task name so pasting a bare URL results in a meaningful title. Uses
    // allUrls, because the pasted URL may already exist as an attachment.
    if (cleanedTitle.isEmpty && allUrls.isNotEmpty) {
      cleanedTitle = _baseNameForUrl(allUrls.first);
    }
  }

  final attachments = allUrls.map(_createUrlAttachment).toList();
  if (cleanedTitle == titleBefore && attachments.isEmpty) return null;

  return _UrlResult(attachments, cleanedTitle, cleanedTitle != titleBefore ? ranges : const []);
}

String _normalizeUrl(String url) {
  var path = url.trim().replaceFirst(RegExp(r'[.,;!?]+$'), '');
  if (!RegExp(r'^(?:https?|file)://').hasMatch(path)) path = '//$path';
  return path;
}

ShortSyntaxAttachment _createUrlAttachment(String url) {
  final path = _normalizeUrl(url);
  final isFileProtocol = path.startsWith('file://');
  final isImage = RegExp(r'\.(jpeg|jpg|gif|png)$', caseSensitive: false)
      .hasMatch(path);
  return ShortSyntaxAttachment(
    path: path,
    type: isImage
        ? ShortSyntaxAttachmentType.image
        : (isFileProtocol
            ? ShortSyntaxAttachmentType.file
            : ShortSyntaxAttachmentType.link),
    title: _baseNameForUrl(path),
  );
}

String _baseNameForUrl(String passedStr) {
  final str = passedStr.trim();
  var base = str.endsWith('/')
      ? str.substring(0, str.length - 1).substring(
          str.substring(0, str.length - 1).lastIndexOf('/') + 1)
      : str.substring(str.lastIndexOf('/') + 1);
  if (base.lastIndexOf('.') != -1) {
    base = base.substring(0, base.lastIndexOf('.'));
  }
  return base;
}
