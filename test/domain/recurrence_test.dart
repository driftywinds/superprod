import 'package:flutter_test/flutter_test.dart';
import 'package:superprod/core/day.dart';
import 'package:superprod/domain/models/task_repeat_cfg.dart';
import 'package:superprod/domain/recurrence.dart';

/// Noon of a calendar day, the recurrence scanner's DST-safe convention.
DateTime noon(int year, int month, int day) => DateTime(year, month, day, 12);

/// A repeat config with weekday flags off unless [weekdays] names them.
TaskRepeatCfg cfg({
  String id = 'cfg',
  String repeatCycle = 'DAILY',
  int repeatEvery = 1,
  String? startDate = '2022-01-10',
  String? lastTaskCreationDay = '2022-01-10',
  int? lastTaskCreation,
  Set<int> weekdays = const {},
  bool monthlyLastDay = false,
  int? monthlyWeekOfMonth,
  int? monthlyWeekday,
  String? repeatUntilDay,
  bool isPaused = false,
  bool waitForCompletion = false,
  bool repeatFromCompletionDate = false,
  String? startTime,
  List<String> deletedInstanceDates = const [],
}) => TaskRepeatCfg(
  id: id,
  repeatCycle: repeatCycle,
  repeatEvery: repeatEvery,
  startDate: startDate,
  lastTaskCreationDay: lastTaskCreationDay,
  lastTaskCreation: lastTaskCreation,
  monday: weekdays.contains(DateTime.monday),
  tuesday: weekdays.contains(DateTime.tuesday),
  wednesday: weekdays.contains(DateTime.wednesday),
  thursday: weekdays.contains(DateTime.thursday),
  friday: weekdays.contains(DateTime.friday),
  saturday: weekdays.contains(DateTime.saturday),
  sunday: weekdays.contains(DateTime.sunday),
  monthlyLastDay: monthlyLastDay,
  monthlyWeekOfMonth: monthlyWeekOfMonth,
  monthlyWeekday: monthlyWeekday,
  repeatUntilDay: repeatUntilDay,
  isPaused: isPaused,
  waitForCompletion: waitForCompletion,
  repeatFromCompletionDate: repeatFromCompletionDate,
  startTime: startTime,
  deletedInstanceDates: deletedInstanceDates,
);

void main() {
  group('nextOccurrence - DAILY', () {
    test('returns tomorrow for a daily task created today', () {
      expect(
        nextOccurrence(
          cfg(repeatCycle: 'DAILY', startDate: '2022-01-10'),
          from: DateTime(2022, 1, 10),
        ),
        noon(2022, 1, 11),
      );
    });

    test('respects every 2 days', () {
      expect(
        nextOccurrence(
          cfg(repeatCycle: 'DAILY', repeatEvery: 2, startDate: '2022-01-10'),
          from: DateTime(2022, 1, 11),
        ),
        noon(2022, 1, 12),
      );
    });

    test('respects every 3 days', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'DAILY',
            repeatEvery: 3,
            startDate: '2022-01-01',
            lastTaskCreationDay: '2022-01-10',
          ),
          from: DateTime(2022, 1, 11),
        ),
        noon(2022, 1, 13),
      );
    });

    test('skips to the next occurrence when the last creation is past', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'DAILY',
            startDate: '2022-01-01',
            lastTaskCreationDay: '2022-01-05',
          ),
          from: DateTime(2022, 1, 10),
        ),
        noon(2022, 1, 11),
      );
    });

    test('starts from the day after the last creation when from is earlier', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'DAILY',
            startDate: '2022-01-01',
            lastTaskCreationDay: '2022-01-15',
          ),
          from: DateTime(2022, 1, 10),
        ),
        noon(2022, 1, 16),
      );
    });

    test('falls back to 1970-01-01 when startDate is missing', () {
      final result = nextOccurrence(
        cfg(
          repeatCycle: 'DAILY',
          startDate: null,
          lastTaskCreationDay: '1970-01-01',
        ),
        from: DateTime(2022, 1, 10),
      );
      expect(result, noon(2022, 1, 11));
    });

    test('falls back to the lastTaskCreation timestamp', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'DAILY',
            lastTaskCreationDay: null,
            lastTaskCreation: DateTime(2022, 1, 10).millisecondsSinceEpoch,
          ),
          from: DateTime(2022, 1, 10),
        ),
        noon(2022, 1, 11),
      );
    });
  });

  group('nextOccurrence - WEEKLY', () {
    test('returns next week for the same weekday', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'WEEKLY',
            startDate: '2022-01-10',
            weekdays: {DateTime.monday},
          ),
          from: DateTime(2022, 1, 11),
        ),
        noon(2022, 1, 17),
      );
    });

    test('picks the next enabled weekday in the current week', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'WEEKLY',
            startDate: '2022-01-10',
            weekdays: {
              DateTime.monday,
              DateTime.wednesday,
              DateTime.friday,
            },
          ),
          from: DateTime(2022, 1, 11),
        ),
        noon(2022, 1, 12),
      );
    });

    test('finds the next valid weekday when from matches the last creation', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'WEEKLY',
            startDate: '2022-01-10',
            weekdays: {DateTime.tuesday, DateTime.thursday},
          ),
          from: DateTime(2022, 1, 10),
        ),
        noon(2022, 1, 11),
      );
    });

    test('every 2 weeks includes the rest of the active week', () {
      const start = '2026-02-02';
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'WEEKLY',
            repeatEvery: 2,
            startDate: start,
            lastTaskCreationDay: '2026-02-05',
            weekdays: {
              DateTime.monday,
              DateTime.tuesday,
              DateTime.wednesday,
              DateTime.thursday,
              DateTime.friday,
            },
          ),
          from: DateTime(2026, 2, 5),
        ),
        noon(2026, 2, 6),
      );
    });

    test('every 2 weeks skips the off week entirely', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'WEEKLY',
            repeatEvery: 2,
            startDate: '2026-02-02',
            lastTaskCreationDay: '2026-02-06',
            weekdays: {
              DateTime.monday,
              DateTime.tuesday,
              DateTime.wednesday,
              DateTime.thursday,
              DateTime.friday,
            },
          ),
          from: DateTime(2026, 2, 6),
        ),
        noon(2026, 2, 16),
      );
    });
  });

  group('nextOccurrence - MONTHLY day of month', () {
    test('returns the same day next month', () {
      expect(
        nextOccurrence(
          cfg(repeatCycle: 'MONTHLY', startDate: '2022-01-15'),
          from: DateTime(2022, 1, 16),
        ),
        noon(2022, 2, 15),
      );
    });

    test('clamps 31 to Feb 28 in a non-leap year', () {
      expect(
        nextOccurrence(
          cfg(repeatCycle: 'MONTHLY', startDate: '2022-01-31'),
          from: DateTime(2022, 2, 1),
        ),
        noon(2022, 2, 28),
      );
    });

    test('clamps 31 to Feb 29 in a leap year', () {
      expect(
        nextOccurrence(
          cfg(repeatCycle: 'MONTHLY', startDate: '2024-01-31'),
          from: DateTime(2024, 2, 1),
        ),
        noon(2024, 2, 29),
      );
    });

    test('clamps 31 to Apr 30 after a March 31 creation', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'MONTHLY',
            startDate: '2022-01-31',
            lastTaskCreationDay: '2022-03-31',
          ),
          from: DateTime(2022, 4, 1),
        ),
        noon(2022, 4, 30),
      );
    });

    test('every 4 months from Oct 31 does not skip February', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'MONTHLY',
            repeatEvery: 4,
            startDate: '2026-10-31',
          ),
          from: DateTime(2026, 11, 1),
        ),
        noon(2027, 2, 28),
      );
    });

    test('every 4 months from Oct 31 does not skip a 30-day month', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'MONTHLY',
            repeatEvery: 4,
            startDate: '2026-10-31',
            lastTaskCreationDay: '2027-02-28',
          ),
          from: DateTime(2027, 3, 1),
        ),
        noon(2027, 6, 30),
      );
    });
  });

  group('nextOccurrence - MONTHLY monthlyLastDay', () {
    test('returns the last day of the next month', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'MONTHLY',
            startDate: '2026-05-31',
            monthlyLastDay: true,
          ),
          from: DateTime(2026, 6, 1),
        ),
        noon(2026, 6, 30),
      );
    });

    test('clamps to month-end even when the anchor day is 30', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'MONTHLY',
            startDate: '2026-06-30',
            monthlyLastDay: true,
          ),
          from: DateTime(2026, 7, 1),
        ),
        noon(2026, 7, 31),
      );
    });

    test('clamps to February month-end', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'MONTHLY',
            startDate: '2026-01-31',
            monthlyLastDay: true,
          ),
          from: DateTime(2026, 2, 1),
        ),
        noon(2026, 2, 28),
      );
    });

    test('clamps to February 29 in a leap year', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'MONTHLY',
            startDate: '2024-01-31',
            monthlyLastDay: true,
          ),
          from: DateTime(2024, 2, 1),
        ),
        noon(2024, 2, 29),
      );
    });
  });

  group('nextOccurrence - MONTHLY Nth weekday', () {
    test('returns the first Thursday of next month', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'MONTHLY',
            startDate: '2026-01-01',
            monthlyWeekOfMonth: 1,
            monthlyWeekday: 4,
          ),
          from: DateTime(2026, 1, 2),
        ),
        noon(2026, 2, 5),
      );
    });

    test('returns the last Monday of next month', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'MONTHLY',
            startDate: '2026-01-26',
            monthlyWeekOfMonth: -1,
            monthlyWeekday: 1,
          ),
          from: DateTime(2026, 1, 27),
        ),
        noon(2026, 2, 23),
      );
    });

    test('handles a month with five occurrences for "last"', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'MONTHLY',
            startDate: '2026-02-24',
            monthlyWeekOfMonth: -1,
            monthlyWeekday: 2,
          ),
          from: DateTime(2026, 2, 25),
        ),
        noon(2026, 3, 31),
      );
    });

    test('respects repeatEvery > 1', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'MONTHLY',
            repeatEvery: 2,
            startDate: '2026-01-01',
            monthlyWeekOfMonth: 1,
            monthlyWeekday: 4,
          ),
          from: DateTime(2026, 1, 2),
        ),
        noon(2026, 3, 5),
      );
    });

    test('ignores an out-of-range anchor and falls back to day-of-month', () {
      final result = nextOccurrence(
        cfg(
          repeatCycle: 'MONTHLY',
          startDate: '2026-01-15',
          lastTaskCreationDay: '2026-01-15',
          monthlyWeekOfMonth: 5,
          monthlyWeekday: 1,
        ),
        from: DateTime(2026, 1, 16),
      );
      expect(result, noon(2026, 2, 15));
    });
  });

  group('nextOccurrence - YEARLY', () {
    test('returns the same date next year', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'YEARLY',
            startDate: '2022-03-15',
            lastTaskCreationDay: '2022-03-15',
          ),
          from: DateTime(2022, 3, 16),
        ),
        noon(2023, 3, 15),
      );
    });

    test('respects every 2 years', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'YEARLY',
            repeatEvery: 2,
            startDate: '2022-03-15',
            lastTaskCreationDay: '2022-03-15',
          ),
          from: DateTime(2022, 3, 16),
        ),
        noon(2024, 3, 15),
      );
    });

    test('keeps this cycle when the last creation is older', () {
      // The exclusive scan discards its day step in the yearly branch, so an
      // uncreated occurrence of the current cycle is still returned.
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'YEARLY',
            startDate: '2022-03-15',
            lastTaskCreationDay: '2022-01-10',
          ),
          from: DateTime(2022, 3, 16),
        ),
        noon(2022, 3, 15),
      );
    });

    test('returns this year when the date has not passed yet', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'YEARLY',
            startDate: '2021-12-25',
            lastTaskCreationDay: '2021-12-25',
          ),
          from: DateTime(2022, 1, 1),
        ),
        noon(2022, 12, 25),
      );
    });

    test('Feb 29 falls on Feb 28 in a non-leap year', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'YEARLY',
            startDate: '2024-02-29',
            lastTaskCreationDay: '2024-02-29',
          ),
          from: DateTime(2024, 3, 1),
        ),
        noon(2025, 2, 28),
      );
    });

    test('leap-day repeat every 2 years uses calendar-year intervals', () {
      final leapCfg = cfg(
        repeatCycle: 'YEARLY',
        repeatEvery: 2,
        startDate: '2024-02-29',
        lastTaskCreationDay: '2024-02-29',
      );
      expect(
        nextOccurrence(leapCfg, from: DateTime(2024, 3, 1)),
        noon(2026, 2, 28),
      );
      expect(
        nextOccurrence(
          leapCfg.merged({'lastTaskCreationDay': '2026-02-28'}),
          from: DateTime(2026, 3, 1),
        ),
        noon(2028, 2, 29),
      );
    });
  });

  group('nextOccurrence - repeatUntilDay', () {
    final from = DateTime(2022, 1, 14, 10);

    test('returns the next day when no end day is set', () {
      expect(
        nextOccurrence(
          cfg(startDate: '2022-01-10', lastTaskCreationDay: '2022-01-10'),
          from: from,
        ),
        noon(2022, 1, 15),
      );
    });

    test('allows an occurrence on the end day itself', () {
      expect(
        nextOccurrence(
          cfg(
            startDate: '2022-01-10',
            lastTaskCreationDay: '2022-01-10',
            repeatUntilDay: '2022-01-15',
          ),
          from: from,
        ),
        noon(2022, 1, 15),
      );
    });

    test('returns null when the next occurrence is after the end day', () {
      expect(
        nextOccurrence(
          cfg(
            startDate: '2022-01-10',
            lastTaskCreationDay: '2022-01-10',
            repeatUntilDay: '2022-01-14',
          ),
          from: from,
        ),
        isNull,
      );
    });

    test('respects the end day for inclusive lookups', () {
      final untilCfg = cfg(
        startDate: '2022-01-10',
        lastTaskCreationDay: '2022-01-10',
        repeatUntilDay: '2022-01-14',
      );
      expect(
        nextOccurrence(untilCfg, from: from, inclusive: true),
        noon(2022, 1, 14),
      );
      expect(
        nextOccurrence(
          untilCfg.merged({'repeatUntilDay': '2022-01-13'}),
          from: from,
          inclusive: true,
        ),
        isNull,
      );
    });
  });

  group('nextOccurrence - invalid input and boundaries', () {
    test('returns null for repeatEvery < 1', () {
      expect(nextOccurrence(cfg(repeatEvery: 0), from: DateTime(2022)), isNull);
      expect(nextOccurrence(cfg(repeatEvery: -1), from: DateTime(2022)), isNull);
    });

    test('returns null for an unknown repeat cycle', () {
      expect(
        nextOccurrence(cfg(repeatCycle: 'UNKNOWN'), from: DateTime(2022)),
        isNull,
      );
    });

    test('returns null for a malformed start date', () {
      expect(
        nextOccurrence(cfg(startDate: 'not-a-date'), from: DateTime(2022)),
        isNull,
      );
    });

    test('does not consult deletedInstanceDates - the caller does', () {
      // Upstream creation checks deletedInstanceDates after choosing a target
      // date; the schedule scan itself stays pure (getNextRepeatOccurrence).
      expect(
        nextOccurrence(
          cfg(
            startDate: '2022-01-10',
            lastTaskCreationDay: '2022-01-10',
            deletedInstanceDates: ['2022-01-11'],
          ),
          from: DateTime(2022, 1, 10),
        ),
        noon(2022, 1, 11),
      );
    });

    test('anchors on lastTaskCreationDay for repeatFromCompletionDate', () {
      expect(
        nextOccurrence(
          cfg(
            repeatFromCompletionDate: true,
            startDate: '2020-01-01',
            lastTaskCreationDay: '2022-01-10',
          ),
          from: DateTime(2022, 1, 10),
        ),
        noon(2022, 1, 11),
      );
      // A startDate moved past the completion day wins (#11266).
      expect(
        nextOccurrence(
          cfg(
            repeatFromCompletionDate: true,
            startDate: '2022-01-20',
            lastTaskCreationDay: '2022-01-10',
          ),
          from: DateTime(2022, 1, 10),
        ),
        noon(2022, 1, 20),
      );
    });
  });

  group('nextOccurrence - inclusive relocation (#7951)', () {
    test('DAILY returns today when created today, tomorrow when exclusive', () {
      final daily = cfg(
        startDate: '2026-11-18',
        lastTaskCreationDay: '2026-11-18',
      );
      expect(
        nextOccurrence(daily, from: DateTime(2026, 11, 18)),
        noon(2026, 11, 19),
      );
      expect(
        nextOccurrence(daily, from: DateTime(2026, 11, 18), inclusive: true),
        noon(2026, 11, 18),
      );
    });

    test('WEEKLY returns today when today matches the mask', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'WEEKLY',
            startDate: '2026-11-18',
            lastTaskCreationDay: '2026-11-18',
            weekdays: {DateTime.wednesday},
          ),
          from: DateTime(2026, 11, 18),
          inclusive: true,
        ),
        noon(2026, 11, 18),
      );
    });

    test('WEEKLY still skips today when today is not a valid occurrence', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'WEEKLY',
            startDate: '2026-11-18',
            lastTaskCreationDay: '2026-11-18',
            weekdays: {DateTime.thursday},
          ),
          from: DateTime(2026, 11, 18),
          inclusive: true,
        ),
        noon(2026, 11, 19),
      );
    });

    test('MONTHLY never resolves to an occurrence before from', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'MONTHLY',
            startDate: '2026-01-10',
            lastTaskCreationDay: '2026-06-10',
          ),
          from: DateTime(2026, 6, 16),
          inclusive: true,
        ),
        noon(2026, 7, 10),
      );
    });

    test('YEARLY never resolves to an occurrence before from', () {
      expect(
        nextOccurrence(
          cfg(
            repeatCycle: 'YEARLY',
            startDate: '2020-03-10',
            lastTaskCreationDay: '2026-03-10',
          ),
          from: DateTime(2026, 6, 16),
          inclusive: true,
        ),
        noon(2027, 3, 10),
      );
    });

    test('respects repeatEvery when today is off-cycle', () {
      expect(
        nextOccurrence(
          cfg(
            repeatEvery: 2,
            startDate: '2026-11-17',
            lastTaskCreationDay: '2026-11-18',
          ),
          from: DateTime(2026, 11, 18),
          inclusive: true,
        ),
        noon(2026, 11, 19),
      );
    });

    test('keeps the repeatFromCompletionDate anchor in inclusive mode', () {
      expect(
        nextOccurrence(
          cfg(
            repeatFromCompletionDate: true,
            startDate: '2020-01-01',
            lastTaskCreationDay: '2026-11-18',
          ),
          from: DateTime(2026, 11, 18),
          inclusive: true,
        ),
        noon(2026, 11, 18),
      );
    });
  });

  group('nextOccurrence - DST-neutral noon', () {
    // US spring-forward 2022-03-13 / fall-back 2022-11-06; the scan must stay
    // on noon so a DST night never shifts the calendar day.
    test('daily across a spring-forward night stays at noon', () {
      final result = nextOccurrence(
        cfg(startDate: '2022-03-12', lastTaskCreationDay: '2022-03-12'),
        from: DateTime(2022, 3, 12, 23, 59),
      );
      expect(dbDateStr(result!), '2022-03-13');
      expect(result.hour, 12);
      expect(result.minute, 0);
    });

    test('daily across a fall-back night stays at noon', () {
      final result = nextOccurrence(
        cfg(startDate: '2022-11-05', lastTaskCreationDay: '2022-11-05'),
        from: DateTime(2022, 11, 5, 23, 59),
      );
      expect(dbDateStr(result!), '2022-11-06');
      expect(result.hour, 12);
      expect(result.minute, 0);
    });

    test('monthly across a DST night stays at noon', () {
      final result = nextOccurrence(
        cfg(
          repeatCycle: 'MONTHLY',
          startDate: '2026-02-08',
          lastTaskCreationDay: '2026-02-08',
        ),
        from: DateTime(2026, 3, 8, 1),
      );
      expect(dbDateStr(result!), '2026-03-08');
      expect(result.hour, 12);
    });

    test('near-midnight from times still scan whole calendar days', () {
      expect(
        nextOccurrence(
          cfg(startDate: '2022-01-10', lastTaskCreationDay: '2022-01-10'),
          from: DateTime(2022, 1, 10, 23, 59, 59, 999),
        ),
        noon(2022, 1, 11),
      );
      expect(
        nextOccurrence(
          cfg(startDate: '2022-01-10', lastTaskCreationDay: '2022-01-11'),
          from: DateTime(2022, 1, 11, 0, 0, 1),
        ),
        noon(2022, 1, 12),
      );
    });
  });

  group('nextDueWithTime', () {
    final day = noon(2026, 6, 10);

    test('places startTime on the occurrence day', () {
      expect(
        nextDueWithTime(
          cfg(startTime: '10:00'),
          occurrenceDay: day,
        ),
        DateTime(2026, 6, 10, 10),
      );
      expect(
        nextDueWithTime(
          cfg(startTime: '7:05'),
          occurrenceDay: day,
        ),
        DateTime(2026, 6, 10, 7, 5),
      );
    });

    test('rolls a time before the day boundary to the next day (#3378)', () {
      const offset = 5 * 60 * 60 * 1000;
      expect(
        nextDueWithTime(
          cfg(startTime: '02:00'),
          occurrenceDay: day,
          startOfNextDayDiffMs: offset,
        ),
        DateTime(2026, 6, 11, 2),
      );
    });

    test('keeps a time at or after the day boundary on the day', () {
      const offset = 5 * 60 * 60 * 1000;
      expect(
        nextDueWithTime(
          cfg(startTime: '06:00'),
          occurrenceDay: day,
          startOfNextDayDiffMs: offset,
        ),
        DateTime(2026, 6, 10, 6),
      );
      expect(
        nextDueWithTime(
          cfg(startTime: '05:00'),
          occurrenceDay: day,
          startOfNextDayDiffMs: offset,
        ),
        DateTime(2026, 6, 10, 5),
      );
    });

    test('respects minutes in the day-boundary offset', () {
      const offset = 270 * 60 * 1000; // 04:30
      expect(
        nextDueWithTime(
          cfg(startTime: '04:29'),
          occurrenceDay: day,
          startOfNextDayDiffMs: offset,
        ),
        DateTime(2026, 6, 11, 4, 29),
      );
      expect(
        nextDueWithTime(
          cfg(startTime: '04:30'),
          occurrenceDay: day,
          startOfNextDayDiffMs: offset,
        ),
        DateTime(2026, 6, 10, 4, 30),
      );
    });

    test('clamps a past timed occurrence to today (#7354)', () {
      expect(
        nextDueWithTime(
          cfg(startTime: '10:00'),
          occurrenceDay: noon(2026, 6, 1),
          todayStr: '2026-06-10',
        ),
        DateTime(2026, 6, 10, 10),
      );
    });

    test('preserves today and future occurrences for timed cfgs', () {
      expect(
        nextDueWithTime(
          cfg(startTime: '10:00'),
          occurrenceDay: day,
          todayStr: '2026-06-10',
        ),
        DateTime(2026, 6, 10, 10),
      );
      expect(
        nextDueWithTime(
          cfg(startTime: '10:00'),
          occurrenceDay: noon(2026, 7, 10),
          todayStr: '2026-06-10',
        ),
        DateTime(2026, 7, 10, 10),
      );
    });

    test('keeps the logical today before the day boundary (#3378)', () {
      expect(
        nextDueWithTime(
          cfg(startTime: '02:00'),
          occurrenceDay: noon(2026, 6, 9),
          startOfNextDayDiffMs: 5 * 60 * 60 * 1000,
          todayStr: '2026-06-09',
        ),
        DateTime(2026, 6, 10, 2),
      );
    });

    test('returns null without a usable startTime', () {
      expect(nextDueWithTime(cfg(), occurrenceDay: day), isNull);
      expect(
        nextDueWithTime(cfg(startTime: 'nope'), occurrenceDay: day),
        isNull,
      );
    });
  });

  group('describeRepeat', () {
    test('daily', () {
      expect(describeRepeat(cfg()), 'Daily');
      expect(describeRepeat(cfg(repeatEvery: 3)), 'Every 3 days');
    });

    test('weekly', () {
      expect(
        describeRepeat(
          cfg(repeatCycle: 'WEEKLY', weekdays: {DateTime.monday}),
        ),
        'Every Monday',
      );
      expect(
        describeRepeat(
          cfg(
            repeatCycle: 'WEEKLY',
            weekdays: {
              DateTime.monday,
              DateTime.tuesday,
              DateTime.wednesday,
              DateTime.thursday,
              DateTime.friday,
            },
          ),
        ),
        'Every weekday',
      );
      expect(
        describeRepeat(
          cfg(
            repeatCycle: 'WEEKLY',
            repeatEvery: 2,
            weekdays: {DateTime.monday, DateTime.wednesday},
          ),
        ),
        'Every 2 weeks on Mon, Wed',
      );
      expect(
        describeRepeat(cfg(repeatCycle: 'WEEKLY', repeatEvery: 2)),
        'Every 2 weeks',
      );
    });

    test('monthly', () {
      expect(
        describeRepeat(
          cfg(repeatCycle: 'MONTHLY', startDate: '2026-01-15'),
        ),
        'Monthly on the 15th',
      );
      expect(
        describeRepeat(
          cfg(
            repeatCycle: 'MONTHLY',
            monthlyWeekOfMonth: 3,
            monthlyWeekday: 4,
          ),
        ),
        'Monthly on the 3rd Thursday',
      );
      expect(
        describeRepeat(
          cfg(
            repeatCycle: 'MONTHLY',
            repeatEvery: 2,
            monthlyWeekOfMonth: 3,
            monthlyWeekday: 4,
          ),
        ),
        'Every 2 months on the 3rd Thursday',
      );
      expect(
        describeRepeat(
          cfg(
            repeatCycle: 'MONTHLY',
            monthlyWeekOfMonth: -1,
            monthlyWeekday: DateTime.monday % 7,
          ),
        ),
        'Monthly on the last Monday',
      );
      expect(
        describeRepeat(cfg(repeatCycle: 'MONTHLY', monthlyLastDay: true)),
        'Monthly on the last day',
      );
      expect(
        describeRepeat(
          cfg(repeatCycle: 'MONTHLY', repeatEvery: 2, monthlyLastDay: true),
        ),
        'Every 2 months on the last day',
      );
    });

    test('yearly', () {
      expect(
        describeRepeat(
          cfg(repeatCycle: 'YEARLY', startDate: '2026-12-12'),
        ),
        'Yearly on 12 Dec',
      );
      expect(
        describeRepeat(
          cfg(repeatCycle: 'YEARLY', repeatEvery: 2, startDate: '2024-02-29'),
        ),
        'Every 2 years on 29 Feb',
      );
    });

    test('appends the inclusive end day', () {
      expect(
        describeRepeat(cfg(repeatUntilDay: '2027-01-15')),
        'Daily, until 15 Jan 2027',
      );
    });

    test('falls back for an unknown cycle', () {
      expect(describeRepeat(cfg(repeatCycle: 'UNKNOWN')), 'Custom');
    });
  });

  group('applyQuickSetting', () {
    final reference = DateTime(2025, 12, 28); // Sunday

    test('DAILY keeps startDate and sets the cycle', () {
      final result = applyQuickSetting(
        cfg(startDate: '2026-01-05', repeatEvery: 4),
        'DAILY',
        now: reference,
      );
      expect(result.repeatCycle, 'DAILY');
      expect(result.repeatEvery, 1);
      expect(result.startDate, '2026-01-05');
    });

    test('WEEKLY_CURRENT_WEEKDAY enables only the reference weekday', () {
      final sunday = applyQuickSetting(
        cfg(repeatCycle: 'MONTHLY', monthlyLastDay: true),
        'WEEKLY_CURRENT_WEEKDAY',
        now: reference,
      );
      expect(sunday.repeatCycle, 'WEEKLY');
      expect(sunday.repeatEvery, 1);
      // The preset owns no startDate, so an existing one is kept.
      expect(sunday.startDate, '2022-01-10');
      expect(
        applyQuickSetting(cfg(startDate: null), 'WEEKLY_CURRENT_WEEKDAY',
                now: reference)
            .startDate,
        isNull,
      );
      expect(sunday.sunday, isTrue);
      for (final other in [
        sunday.monday,
        sunday.tuesday,
        sunday.wednesday,
        sunday.thursday,
        sunday.friday,
        sunday.saturday,
      ]) {
        expect(other, isFalse);
      }

      final friday = applyQuickSetting(
        cfg(),
        'WEEKLY_CURRENT_WEEKDAY',
        now: DateTime(2025, 12, 26),
      );
      expect(friday.friday, isTrue);
      expect(friday.sunday, isFalse);
    });

    test('MONDAY_TO_FRIDAY enables the work week only', () {
      final result = applyQuickSetting(
        cfg(repeatCycle: 'YEARLY', repeatEvery: 3),
        'MONDAY_TO_FRIDAY',
        now: reference,
      );
      expect(result.repeatCycle, 'WEEKLY');
      expect(result.repeatEvery, 1);
      expect(result.startDate, '2022-01-10');
      expect(
        [
          result.monday,
          result.tuesday,
          result.wednesday,
          result.thursday,
          result.friday,
        ],
        everyElement(isTrue),
      );
      expect(
        [result.saturday, result.sunday],
        everyElement(isFalse),
      );
    });

    test('MONTHLY_CURRENT_DATE anchors on the reference day', () {
      final result = applyQuickSetting(
        cfg(
          repeatCycle: 'MONTHLY',
          monthlyWeekOfMonth: 2,
          monthlyWeekday: 1,
          monthlyLastDay: true,
        ),
        'MONTHLY_CURRENT_DATE',
        now: DateTime(2026, 5, 22),
      );
      expect(result.repeatCycle, 'MONTHLY');
      expect(result.repeatEvery, 1);
      expect(result.startDate, '2026-05-22');
      expect(result.monthlyWeekOfMonth, isNull);
      expect(result.monthlyWeekday, isNull);
      expect(result.monthlyLastDay, isFalse);
    });

    test('MONTHLY_FIRST_DAY anchors on the next 1st', () {
      String start(DateTime now) =>
          applyQuickSetting(cfg(), 'MONTHLY_FIRST_DAY', now: now).startDate!;

      expect(start(DateTime(2026, 5, 22)), '2026-06-01');
      expect(start(DateTime(2026, 5, 1)), '2026-05-01');
      expect(start(DateTime(2026, 12, 15)), '2027-01-01');
    });

    test('MONTHLY_LAST_DAY anchors on this month-end', () {
      final result = applyQuickSetting(
        cfg(monthlyWeekOfMonth: 2, monthlyWeekday: 1),
        'MONTHLY_LAST_DAY',
        now: DateTime(2026, 5, 22),
      );
      expect(result.repeatCycle, 'MONTHLY');
      expect(result.startDate, '2026-05-31');
      expect(result.monthlyLastDay, isTrue);
      expect(result.monthlyWeekOfMonth, isNull);
      expect(result.monthlyWeekday, isNull);
      expect(
        applyQuickSetting(
          cfg(),
          'MONTHLY_LAST_DAY',
          now: DateTime(2026, 6, 10),
        ).startDate,
        '2026-06-30',
      );
    });

    test('MONTHLY_NTH_WEEKDAY infers the ordinal and weekday', () {
      final secondMonday = applyQuickSetting(
        cfg(monthlyLastDay: true),
        'MONTHLY_NTH_WEEKDAY',
        now: DateTime(2026, 1, 12),
      );
      expect(secondMonday.repeatCycle, 'MONTHLY');
      expect(secondMonday.monthlyWeekOfMonth, 2);
      expect(secondMonday.monthlyWeekday, DateTime.monday % 7);
      expect(secondMonday.startDate, '2026-01-12');
      expect(secondMonday.monthlyLastDay, isFalse);

      final capped = applyQuickSetting(
        cfg(),
        'MONTHLY_NTH_WEEKDAY',
        now: DateTime(2026, 1, 29), // 5th Thursday -> capped to 4th
      );
      expect(capped.monthlyWeekOfMonth, 4);
      expect(capped.monthlyWeekday, DateTime.thursday % 7);
    });

    test('YEARLY_CURRENT_DATE anchors on the reference day', () {
      final result = applyQuickSetting(
        cfg(repeatCycle: 'DAILY'),
        'YEARLY_CURRENT_DATE',
        now: DateTime(2026, 11, 18),
      );
      expect(result.repeatCycle, 'YEARLY');
      expect(result.repeatEvery, 1);
      expect(result.startDate, '2026-11-18');
    });

    test('CUSTOM and unknown presets leave the config untouched', () {
      final original = cfg(repeatCycle: 'WEEKLY', repeatEvery: 2);
      expect(applyQuickSetting(original, 'CUSTOM', now: reference), same(original));
      expect(applyQuickSetting(original, 'NOPE', now: reference), same(original));
    });
  });

  group('shouldCreateNextOccurrence', () {
    const today = '2026-11-18';

    test('a paused series never creates', () {
      final paused = cfg(isPaused: true, waitForCompletion: true);
      expect(
        shouldCreateNextOccurrence(paused, wasCompleted: true, todayStr: today),
        isFalse,
      );
      expect(
        shouldCreateNextOccurrence(paused, wasCompleted: false, todayStr: today),
        isFalse,
      );
    });

    test('waitForCompletion opens only after a completion', () {
      final gated = cfg(
        waitForCompletion: true,
        startDate: '2026-11-01',
        lastTaskCreationDay: '2026-11-18',
      );
      expect(
        shouldCreateNextOccurrence(gated, wasCompleted: true, todayStr: today),
        isTrue,
      );
      expect(
        shouldCreateNextOccurrence(gated, wasCompleted: false, todayStr: today),
        isFalse,
      );
    });

    test('a plain series is created by the day sweep, not on completion', () {
      final plain = cfg(
        startDate: '2026-11-01',
        lastTaskCreationDay: '2026-11-18',
      );
      expect(
        shouldCreateNextOccurrence(plain, wasCompleted: true, todayStr: today),
        isFalse,
      );
      expect(
        shouldCreateNextOccurrence(plain, wasCompleted: false, todayStr: today),
        isTrue,
      );
    });

    test('repeatFromCompletionDate re-anchors on completion instead', () {
      final fromCompletion = cfg(
        repeatFromCompletionDate: true,
        waitForCompletion: true,
        startDate: '2026-11-01',
        lastTaskCreationDay: '2026-11-18',
      );
      expect(
        shouldCreateNextOccurrence(
          fromCompletion,
          wasCompleted: true,
          todayStr: today,
        ),
        isFalse,
      );
      expect(
        shouldCreateNextOccurrence(
          fromCompletion,
          wasCompleted: false,
          todayStr: today,
        ),
        isFalse,
      );
    });

    test('a series that has not started yet creates nothing', () {
      expect(
        shouldCreateNextOccurrence(
          cfg(startDate: '2026-12-01', lastTaskCreationDay: null),
          wasCompleted: false,
          todayStr: today,
        ),
        isFalse,
      );
    });
  });
}
