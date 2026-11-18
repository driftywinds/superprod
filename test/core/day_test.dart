import 'package:flutter_test/flutter_test.dart';
import 'package:superprod/core/day.dart';

void main() {
  group('dbDateStr', () {
    test('pads month and day', () {
      expect(dbDateStr(DateTime(2026, 1, 2)), '2026-01-02');
      expect(dbDateStrFromMs(DateTime(2026, 11, 18, 23, 59).millisecondsSinceEpoch),
          '2026-11-18');
    });

    test('isDbDateStr checks shape only', () {
      expect(isDbDateStr('2026-11-18'), isTrue);
      expect(isDbDateStr('2026-1-18'), isFalse);
      expect(isDbDateStr('2026/11/18'), isFalse);
      expect(isDbDateStr('2026-11-1x'), isFalse);
    });
  });

  group('startOfNextDayDiffMs', () {
    test('parses HH:mm into milliseconds', () {
      expect(startOfNextDayDiffMs(time: '05:00'), 5 * 60 * 60 * 1000);
      expect(startOfNextDayDiffMs(time: '00:00'), 0);
      expect(startOfNextDayDiffMs(time: '23:59'), (23 * 60 + 59) * 60 * 1000);
    });

    test('invalid time resets to zero instead of trusting half a pair', () {
      expect(startOfNextDayDiffMs(time: '5:0'), 0);
      expect(startOfNextDayDiffMs(time: '25:00'), 0);
      expect(startOfNextDayDiffMs(time: 'five'), 0);
    });

    test('single-digit hours are accepted by the upstream pattern', () {
      expect(startOfNextDayDiffMs(time: '5:00'), 5 * 60 * 60 * 1000);
    });

    test('legacy hour applies only without a time string', () {
      expect(startOfNextDayDiffMs(legacyHour: 4), 4 * 60 * 60 * 1000);
      expect(startOfNextDayDiffMs(time: '01:00', legacyHour: 4),
          1 * 60 * 60 * 1000);
      expect(startOfNextDayDiffMs(legacyHour: 24), 0);
    });
  });

  group('DayCalendar', () {
    test('early morning belongs to the previous logical day', () {
      final calendar = DayCalendar(5 * 60 * 60 * 1000);
      expect(calendar.todayStr(DateTime(2026, 11, 18, 2)), '2026-11-17');
      expect(calendar.todayStr(DateTime(2026, 11, 18, 5)), '2026-11-18');
    });

    test('isToday shifts the timestamp by the offset', () {
      final calendar = DayCalendar(5 * 60 * 60 * 1000);
      final now = DateTime(2026, 11, 18, 3);
      expect(
        calendar.isToday(DateTime(2026, 11, 18, 2).millisecondsSinceEpoch, now),
        isTrue,
      );
      expect(
        calendar.isToday(DateTime(2026, 11, 18, 9).millisecondsSinceEpoch, now),
        isFalse,
      );
    });

    test('a zero offset is plain calendar days', () {
      const calendar = DayCalendar(0);
      final now = DateTime(2026, 11, 18, 2);
      expect(calendar.todayStr(now), '2026-11-18');
      expect(calendar.isToday(now.millisecondsSinceEpoch, now), isTrue);
    });
  });
}
