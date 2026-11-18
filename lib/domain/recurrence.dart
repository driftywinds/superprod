/// Recurrence calculation for repeating tasks.
///
/// Ports upstream Super Productivity `features/task-repeat-cfg`:
/// `store/get-next-repeat-occurrence.util.ts`, `store/recurrence-date.util.ts`,
/// `store/get-nth-weekday-of-month.util.ts`, `store/repeat-until-day.util.ts`,
/// `store/get-effective-repeat-start-date.util.ts`,
/// `store/get-effective-last-task-creation-day.util.ts`,
/// `store/get-repeat-due-with-time.util.ts`,
/// `store/clamp-past-timed-occurrence.util.ts`,
/// `dialog-edit-task-repeat-cfg/get-quick-setting-updates.ts` and the
/// completion gate of `store/task-repeat-cfg.effects.ts`
/// (`updateStartDateOnComplete$`) plus the paused/`waitForCompletion` guards of
/// `task-repeat-cfg.service.ts#_getActionsForTaskRepeatCfg`.
///
/// Scan dates are local noon copies: noon is never touched by a DST
/// transition, so day arithmetic and calendar comparisons stay stable.
library;

import '../core/day.dart';
import 'models/task_repeat_cfg.dart';

const _msPerMinute = 60 * 1000;
const _maxDaysToScan = 365 * 2;
const _maxMonthsToScan = 24;
const _maxYearsToScan = 10;

const _weekdayKeys = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];
const _weekdayNames = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const _weekdayShortNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _monthShortNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

final _dayPrefix = RegExp(r'^(\d{4})-(\d{1,2})-(\d{1,2})');

// ---------------------------------------------------------------- public API

/// Upstream `getNextRepeatOccurrence`: the first occurrence strictly after the
/// last created instance (or, with [inclusive], on or after [from]).
///
/// Returns `null` when the config is invalid (`repeatEvery < 1`), when an
/// anchor date string is malformed, when the scan finds nothing, or when the
/// occurrence would fall after the inclusive `repeatUntilDay`.
///
/// Mirrors upstream: the schedule is anchored on the effective start date
/// (`lastTaskCreationDay` for `repeatFromCompletionDate` configs) and gated by
/// the effective last creation day.
DateTime? nextOccurrence(
  TaskRepeatCfg cfg, {
  required DateTime from,
  bool inclusive = false,
}) {
  final next = _scanForward(cfg, from, inclusive: inclusive);
  final until = cfg.repeatUntilDay;
  if (next == null || until == null) return next;
  return dbDateStr(next).compareTo(until) > 0 ? null : next;
}

/// Upstream `getRepeatDueWithTime` + `clampPastTimedOccurrence`: the due
/// timestamp of [occurrenceDay] for a timed repeat config.
///
/// The time comes from `cfg.startTime` (`HH:mm`); without a valid one there is
/// nothing to place and the result is `null`.
///
/// [startOfNextDayDiffMs] is the logical-day offset from
/// `startOfNextDayDiffMs()` in `core/day.dart`: a clock time before the offset
/// belongs to the late night of the logical day and lands on the next calendar
/// day (#3378). The default 0 is plain calendar days.
///
/// [todayStr] enables upstream `clampPastTimedOccurrence` (#7354): a timed
/// occurrence with a day before the logical today is moved to today, so a past
/// instance does not fire a missed reminder the moment it is saved. Untimed
/// configs are left alone (#7344) and result in `null` here.
DateTime? nextDueWithTime(
  TaskRepeatCfg cfg, {
  required DateTime occurrenceDay,
  int startOfNextDayDiffMs = 0,
  String? todayStr,
}) {
  final startTime = cfg.startTime;
  if (startTime == null) return null;
  final clock = _parseClock(startTime);
  if (clock == null) return null;

  var day = _noon(occurrenceDay);
  final today = _parseDay(todayStr);
  if (today != null && dbDateStr(day).compareTo(dbDateStr(today)) < 0) {
    day = today;
  }
  final startMinutes = clock.$1 * 60 + clock.$2;
  if (startMinutes * _msPerMinute < startOfNextDayDiffMs) {
    // setDate semantics: a DST night must not shift the calendar day.
    day = _addDays(day, 1);
  }
  return DateTime(day.year, day.month, day.day, clock.$1, clock.$2);
}

/// Short English summary of [cfg]'s rule, e.g. `Every Monday`,
/// `Every 2 weeks on Mon, Wed`, `Monthly on the 3rd Thursday`, `Daily`,
/// `Yearly on 12 Dec`, plus `, until 15 Jan 2027` when `repeatUntilDay` is set.
///
/// Fixed English on purpose: the app has no locale data for recurrence yet, so
/// this is the deterministic fallback the UI can render (upstream builds its
/// sentence through `TranslateService`/`Intl`).
String describeRepeat(TaskRepeatCfg cfg) {
  final summary = _describeRule(cfg);
  final until = cfg.repeatUntilDay;
  if (until == null) return summary;
  final day = _parseDay(until);
  final untilStr = day == null
      ? until
      : '${day.day} ${_monthShortNames[day.month - 1]} ${day.year}';
  return '$summary, until $untilStr';
}

/// Upstream `getQuickSettingUpdates` merged onto [cfg]: the preset's schedule
/// fields with every monthly anchor it does not own cleared.
///
/// [now] is the preset's reference day (upstream `referenceDate ?? today`), so
/// pass the day the recurrence is being set up for — the picked add-bar date or
/// the config's own start date, floored at today. `CUSTOM` (and any unknown
/// value) leaves the config untouched.
TaskRepeatCfg applyQuickSetting(
  TaskRepeatCfg cfg,
  String quickSetting, {
  required DateTime now,
}) {
  switch (quickSetting) {
    case 'DAILY':
      return cfg.merged({'repeatCycle': 'DAILY', 'repeatEvery': 1});
    case 'WEEKLY_CURRENT_WEEKDAY':
      return cfg.merged({
        ..._weeklyForDay(now),
        'repeatCycle': 'WEEKLY',
        'repeatEvery': 1,
      });
    case 'MONDAY_TO_FRIDAY':
      return cfg.merged({
        'repeatCycle': 'WEEKLY',
        'repeatEvery': 1,
        'monday': true,
        'tuesday': true,
        'wednesday': true,
        'thursday': true,
        'friday': true,
        'saturday': false,
        'sunday': false,
      });
    case 'MONTHLY_CURRENT_DATE':
      return cfg.merged({
        'repeatCycle': 'MONTHLY',
        'repeatEvery': 1,
        'startDate': dbDateStr(now),
        ..._monthlyAnchorReset,
      });
    case 'MONTHLY_FIRST_DAY':
      // The first 1st-of-month on or after the anchor day; month + 1 rolls the
      // year over correctly in December.
      final firstDay = now.day == 1
          ? DateTime(now.year, now.month, 1)
          : DateTime(now.year, now.month + 1, 1);
      return cfg.merged({
        'repeatCycle': 'MONTHLY',
        'repeatEvery': 1,
        'startDate': dbDateStr(firstDay),
        ..._monthlyAnchorReset,
      });
    case 'MONTHLY_LAST_DAY':
      // The last day of the anchor's month: always that day or later.
      final lastDay = DateTime(now.year, now.month + 1, 0);
      return cfg.merged({
        'repeatCycle': 'MONTHLY',
        'repeatEvery': 1,
        'startDate': dbDateStr(lastDay),
        ..._monthlyAnchorReset,
        'monthlyLastDay': true,
      });
    case 'MONTHLY_NTH_WEEKDAY':
      // The same Nth weekday the reference day implies, capped at 4 (a 5th
      // occurrence would not exist in every month).
      final weekOfMonth = ((now.day - 1) ~/ 7) + 1;
      return cfg.merged({
        'repeatCycle': 'MONTHLY',
        'repeatEvery': 1,
        'startDate': dbDateStr(now),
        'monthlyWeekOfMonth': weekOfMonth > 4 ? 4 : weekOfMonth,
        'monthlyWeekday': now.weekday % 7,
        'monthlyLastDay': null,
      });
    case 'YEARLY_CURRENT_DATE':
      return cfg.merged({
        'repeatCycle': 'YEARLY',
        'repeatEvery': 1,
        'startDate': dbDateStr(now),
      });
    default:
      return cfg;
  }
}

/// Whether the controller may create the next instance now.
///
/// Upstream gates, in the order the effects and service apply them:
///  * a paused series creates nothing at all (service early return, selectors);
///  * a series whose `startDate` is still ahead has no due occurrence yet
///    (`getNewestPossibleDueDate` gives up while `startDate > today`);
///  * `waitForCompletion` opens only once an instance was completed — the
///    caller must pass [wasCompleted] as "the previous instance is done", after
///    checking no other live or archived instance is still uncompleted;
///  * completing a `repeatFromCompletionDate` instance only re-anchors the
///    schedule (`startDate` and `lastTaskCreationDay` = [todayStr]); the next
///    instance is created by the following creation sweep (#11266);
///  * a plain series is created ahead of time by the day-change sweep, so its
///    completion creates nothing.
///
/// Therefore `false` means "create nothing now" — not "nothing to do": the
/// caller still advances the cursor for `skipOverdue` and re-anchors
/// `repeatFromCompletionDate` itself.
bool shouldCreateNextOccurrence(
  TaskRepeatCfg cfg, {
  required bool wasCompleted,
  required String todayStr,
}) {
  if (cfg.isPaused) return false;
  final startDate = cfg.startDate;
  if (startDate != null &&
      startDate.isNotEmpty &&
      startDate.compareTo(todayStr) > 0) {
    return false;
  }
  if (wasCompleted) {
    if (cfg.repeatFromCompletionDate) return false;
    return cfg.waitForCompletion;
  }
  return !cfg.waitForCompletion;
}

// ----------------------------------------------------------------- internals

/// Port of `getNextRepeatOccurrenceIgnoringEnd`.
DateTime? _scanForward(
  TaskRepeatCfg cfg,
  DateTime from, {
  required bool inclusive,
}) {
  if (cfg.repeatEvery < 1) return null;

  final startDate = _parseDay(_effectiveStartDateStr(cfg));
  final lastCreationDay = _parseDay(_effectiveLastCreationDayStr(cfg));
  if (startDate == null || lastCreationDay == null) return null;

  var lastTaskCreation = lastCreationDay;
  var checkDate = _noon(from);
  DateTime? fromDateFloor;
  if (inclusive) {
    // Relocating a live instance: ignore prior-creation gating so today is
    // considered, but never resolve to an occurrence before `from` (#7951).
    fromDateFloor = checkDate;
    lastTaskCreation = _noon(DateTime(1970));
  } else {
    // Start checking from the day after the last task creation.
    if (!lastTaskCreation.isBefore(checkDate)) checkDate = lastTaskCreation;
    checkDate = _addDays(checkDate, 1);
  }

  switch (cfg.repeatCycle) {
    case 'DAILY':
      for (var i = 0; i < _maxDaysToScan; i++) {
        if (_isOnCycle(_diffInDays(startDate, checkDate), cfg.repeatEvery)) {
          return checkDate;
        }
        checkDate = _addDays(checkDate, 1);
      }
      return null;

    case 'WEEKLY':
      for (var i = 0; i < _maxDaysToScan; i++) {
        if (_isOnCycle(_diffInWeeks(startDate, checkDate), cfg.repeatEvery) &&
            cfg.weekdayAt(checkDate.weekday)) {
          return checkDate;
        }
        checkDate = _addDays(checkDate, 1);
      }
      return null;

    case 'MONTHLY':
      if (_hasNthWeekdayAnchor(cfg)) {
        return _findNthWeekdayOccurrence(
          cfg,
          checkDate,
          direction: 1,
          maxMonths: _maxMonthsToScan,
          accept: (candidate, cursor) =>
              !candidate.isBefore(checkDate) &&
              _isOnCycle(_diffInMonths(startDate, cursor), cfg.repeatEvery),
        );
      }
      // `monthlyLastDay` anchors to month-end: day 31 is clamped to the true
      // last day of every month.
      final repeatDay = cfg.monthlyLastDay ? 31 : startDate.day;
      final isLastCreationMonth =
          lastTaskCreation.year == checkDate.year &&
          lastTaskCreation.month == checkDate.month;
      checkDate = _moveToMonthDay(
        checkDate,
        isLastCreationMonth ? 1 : 0,
        repeatDay,
      );
      for (var i = 0; i < _maxMonthsToScan; i++) {
        if (_isOnCycle(_diffInMonths(startDate, checkDate), cfg.repeatEvery) &&
            (fromDateFloor == null || !checkDate.isBefore(fromDateFloor))) {
          return checkDate;
        }
        checkDate = _moveToMonthDay(checkDate, 1, repeatDay);
      }
      return null;

    case 'YEARLY':
      final repeatDay = startDate.day;
      final repeatMonth = startDate.month;
      checkDate = _moveToYearDay(checkDate, 0, repeatMonth, repeatDay);
      // Past this year's occurrence already: take next year's.
      if (!checkDate.isAfter(lastTaskCreation)) {
        checkDate = _moveToYearDay(checkDate, 1, repeatMonth, repeatDay);
      }
      for (var i = 0; i < _maxYearsToScan; i++) {
        if (_isOnCycle(checkDate.year - startDate.year, cfg.repeatEvery) &&
            (fromDateFloor == null || !checkDate.isBefore(fromDateFloor))) {
          return checkDate;
        }
        checkDate = _moveToYearDay(checkDate, 1, repeatMonth, repeatDay);
      }
      return null;

    default:
      return null;
  }
}

/// Port of `getEffectiveRepeatStartDate`.
String _effectiveStartDateStr(TaskRepeatCfg cfg) {
  final lastCreationDay = cfg.lastTaskCreationDay;
  if (cfg.repeatFromCompletionDate &&
      lastCreationDay != null &&
      (cfg.startDate ?? '').compareTo(lastCreationDay) <= 0) {
    return lastCreationDay;
  }
  final startDate = cfg.startDate;
  return startDate == null || startDate.isEmpty ? '1970-01-01' : startDate;
}

/// Port of `getEffectiveLastTaskCreationDay`.
String _effectiveLastCreationDayStr(TaskRepeatCfg cfg) {
  final explicit = cfg.lastTaskCreationDay;
  if (explicit != null) return explicit;
  final timestamp = cfg.lastTaskCreation;
  if (timestamp == null || timestamp == 0) return '1970-01-01';
  return dbDateStr(DateTime.fromMillisecondsSinceEpoch(timestamp));
}

/// Anchor presence is the single source of truth for "Nth weekday" recurrence.
bool _hasNthWeekdayAnchor(TaskRepeatCfg cfg) {
  final week = cfg.monthlyWeekOfMonth;
  final weekday = cfg.monthlyWeekday;
  if (week == null || weekday == null) return false;
  return (week == -1 || (week >= 1 && week <= 4)) &&
      weekday >= 0 &&
      weekday <= 6;
}

/// Port of `findMonthlyNthWeekdayOccurrence`.
DateTime? _findNthWeekdayOccurrence(
  TaskRepeatCfg cfg,
  DateTime from, {
  required int direction,
  required int maxMonths,
  required bool Function(DateTime candidate, DateTime cursor) accept,
}) {
  var cursor = _noon(DateTime(from.year, from.month, 1));
  for (var i = 0; i < maxMonths; i++) {
    final candidate = _nthWeekdayOfMonth(
      cursor.year,
      cursor.month,
      cfg.monthlyWeekday!,
      cfg.monthlyWeekOfMonth!,
    );
    if (accept(candidate, cursor)) return candidate;
    cursor = _noon(DateTime(cursor.year, cursor.month + direction, 1));
  }
  return null;
}

/// Port of `getNthWeekdayOfMonth`; [weekday] is 0 = Sunday … 6 = Saturday.
DateTime _nthWeekdayOfMonth(int year, int month, int weekday, int n) {
  // `DateTime.weekday` starts at Monday (1) while the config starts at Sunday.
  final dartWeekday = weekday == 0 ? DateTime.sunday : weekday;
  if (n == -1) {
    final lastDay = DateTime(year, month + 1, 0, 12);
    final offset = (lastDay.weekday - dartWeekday + 7) % 7;
    return _addDays(lastDay, -offset);
  }
  final firstDay = _noon(DateTime(year, month, 1));
  final offset = (dartWeekday - firstDay.weekday + 7) % 7;
  // Day is always <= 28 for n in 1..4, so no month-overflow check is needed.
  return _noon(DateTime(year, month, 1 + offset + (n - 1) * 7));
}

Map<String, Object?> _weeklyForDay(DateTime day) {
  final enabled = _weekdayKeys[day.weekday - 1];
  return {
    for (final key in _weekdayKeys) key: key == enabled,
  };
}

/// Switching between monthly presets clears every monthly anchor: anchor
/// presence is the discriminator, so a stale field would silently win.
const _monthlyAnchorReset = <String, Object?>{
  'monthlyWeekOfMonth': null,
  'monthlyWeekday': null,
  'monthlyLastDay': null,
};

String _describeRule(TaskRepeatCfg cfg) {
  final every = cfg.repeatEvery;
  switch (cfg.repeatCycle) {
    case 'DAILY':
      return every == 1 ? 'Daily' : 'Every $every days';

    case 'WEEKLY':
      final days = [
        for (var i = 0; i < 7; i++)
          if (cfg.weekdayAt(DateTime.monday + i)) i,
      ];
      if (days.isEmpty) {
        return every == 1 ? 'Weekly' : 'Every $every weeks';
      }
      final longNames = days.length == 1;
      final names = [
        for (final day in days)
          longNames ? _weekdayNames[day] : _weekdayShortNames[day],
      ].join(', ');
      if (every == 1) {
        if (days.length == 5 && days.last == 4) return 'Every weekday';
        return 'Every $names';
      }
      return 'Every $every weeks on $names';

    case 'MONTHLY':
      final String suffix;
      if (_hasNthWeekdayAnchor(cfg)) {
        final ordinal = cfg.monthlyWeekOfMonth == -1
            ? 'last'
            : _ordinal(cfg.monthlyWeekOfMonth!);
        suffix = 'on the $ordinal ${_weekdayNames[(cfg.monthlyWeekday! + 6) % 7]}';
      } else if (cfg.monthlyLastDay) {
        suffix = 'on the last day';
      } else {
        final startDay = _parseDay(_effectiveStartDateStr(cfg))?.day ?? 1;
        suffix = 'on the ${_ordinal(startDay)}';
      }
      return every == 1 ? 'Monthly $suffix' : 'Every $every months $suffix';

    case 'YEARLY':
      final start = _parseDay(_effectiveStartDateStr(cfg));
      final day = start?.day ?? 1;
      final month = start?.month ?? 1;
      final on = 'on $day ${_monthShortNames[month - 1]}';
      return every == 1 ? 'Yearly $on' : 'Every $every years $on';

    default:
      return 'Custom';
  }
}

String _ordinal(int n) {
  if (n >= 11 && n <= 13) return '${n}th';
  return switch (n % 10) {
    1 => '${n}st',
    2 => '${n}nd',
    3 => '${n}rd',
    _ => '${n}th',
  };
}

// ------------------------------------------------------------- date plumbing

/// Upstream `dateStrToUtcDate`: the `yyyy-MM-dd` prefix at local noon, or
/// `null` for a malformed or non-existent calendar day.
DateTime? _parseDay(String? value) {
  if (value == null) return null;
  final match = _dayPrefix.firstMatch(value);
  if (match == null) return null;
  final year = int.parse(match.group(1)!);
  final month = int.parse(match.group(2)!);
  final day = int.parse(match.group(3)!);
  final date = DateTime(year, month, day);
  if (date.year != year || date.month != month || date.day != day) return null;
  return _noon(date);
}

(int, int)? _parseClock(String value) {
  if (value.length > 5) return null;
  final parts = value.split(':');
  if (parts.length != 2) return null;
  final hour = int.tryParse(parts[0]);
  final minute = int.tryParse(parts[1]);
  if (hour == null || minute == null) return null;
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  return (hour, minute);
}

DateTime _noon(DateTime date) => DateTime(date.year, date.month, date.day, 12);

DateTime _addDays(DateTime date, int days) =>
    DateTime(date.year, date.month, date.day + days, 12);

/// Upstream `getDiffInDays`: calendar days, not absolute milliseconds.
int _diffInDays(DateTime a, DateTime b) =>
    DateTime.utc(b.year, b.month, b.day)
        .difference(DateTime.utc(a.year, a.month, a.day))
        .inDays;

/// Upstream `getDiffInWeeks`: complete weeks, floored like `Math.floor`.
int _diffInWeeks(DateTime a, DateTime b) => (_diffInDays(a, b) / 7).floor();

/// Upstream `getDiffInMonth`.
int _diffInMonths(DateTime a, DateTime b) =>
    (b.year - a.year) * 12 + b.month - a.month;

bool _isOnCycle(int diff, int repeatEvery) =>
    diff >= 0 && diff % repeatEvery == 0;

int _lastDayOfMonth(int year, int month) => DateTime(year, month + 1, 0).day;

/// Upstream `moveToMonthDay`: step from day 1 so a target month without the day
/// clamps instead of overflowing into the month after it (#10091, #10902).
DateTime _moveToMonthDay(DateTime date, int monthDelta, int day) {
  final shifted = DateTime(date.year, date.month + monthDelta, 1);
  final clamped = day.clamp(1, _lastDayOfMonth(shifted.year, shifted.month));
  return DateTime(shifted.year, shifted.month, clamped, 12);
}

/// Upstream `moveToYearDay`: Feb 29 falls on Feb 28 in non-leap years.
DateTime _moveToYearDay(DateTime date, int yearDelta, int month, int day) {
  final year = date.year + yearDelta;
  final clamped = day.clamp(1, _lastDayOfMonth(year, month));
  return DateTime(year, month, clamped, 12);
}
