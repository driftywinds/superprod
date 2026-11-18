/// Ports of upstream `get-db-date-str.ts` and `start-of-next-day.util.ts`.
///
/// The logical day is the calendar day shifted by the configured start of the
/// next day: with a 05:00 start, 02:00 still belongs to the previous day.
library;

/// `YYYY-MM-DD` in local time, matching upstream `getDbDateStr`.
String dbDateStr(DateTime date) {
  final year = date.year.toString().padLeft(4, '0');
  final month = date.month.toString().padLeft(2, '0');
  final day = date.day.toString().padLeft(2, '0');
  return '$year-$month-$day';
}

String dbDateStrFromMs(int ms) =>
    dbDateStr(DateTime.fromMillisecondsSinceEpoch(ms));

/// Shape check only, like upstream `isDBDateStr` (not calendar validity).
bool isDbDateStr(String value) {
  if (value.length != 10 || value[4] != '-' || value[7] != '-') return false;
  for (var i = 0; i < 10; i++) {
    if (i == 4 || i == 7) continue;
    final c = value.codeUnitAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

final _startOfNextDayTime = RegExp(r'^([01]?\d|2[0-3]):([0-5]\d)$');
const _minutesPerHour = 60;
const _maxMinutesInDay = 23 * _minutesPerHour + 59;

int _parseStartOfNextDayTimeToMinutes(String time) {
  final match = _startOfNextDayTime.firstMatch(time);
  if (match == null) return 0;
  return int.parse(match.group(1)!) * _minutesPerHour +
      int.parse(match.group(2)!);
}

/// Upstream `getStartOfNextDayDiffMs`: the offset subtracted from "now" to get
/// the logical day. An invalid time string resets to the default (0) rather
/// than trusting a half-written pair.
int startOfNextDayDiffMs({String? time, int? legacyHour}) {
  if (time != null) {
    if (!_startOfNextDayTime.hasMatch(time)) return 0;
    final minutes = _parseStartOfNextDayTimeToMinutes(time).clamp(0, _maxMinutesInDay);
    return minutes * 60 * 1000;
  }
  if (legacyHour != null && legacyHour >= 0 && legacyHour <= 23) {
    return legacyHour * _minutesPerHour * 60 * 1000;
  }
  return 0;
}

/// Logical-day helpers bound to one offset.
class DayCalendar {
  const DayCalendar(this.startOfNextDayDiffMs);

  final int startOfNextDayDiffMs;

  DateTime logicalNow(DateTime now) =>
      now.subtract(Duration(milliseconds: startOfNextDayDiffMs));

  String todayStr(DateTime now) => dbDateStr(logicalNow(now));

  /// Upstream `DateService.isToday`: the timestamp is shifted by the offset
  /// before its calendar day is taken.
  bool isToday(int timestampMs, DateTime now) =>
      dbDateStr(DateTime.fromMillisecondsSinceEpoch(
        timestampMs - startOfNextDayDiffMs,
      )) ==
      todayStr(now);
}
