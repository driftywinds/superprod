import 'package:flutter_test/flutter_test.dart';
import 'package:superprod/core/short_syntax.dart';

void main() {
  group('short syntax', () {
    final now = DateTime(2026, 11, 18, 10); // Wednesday

    test('leaves a plain title alone', () {
      final parsed = parseShortSyntax('Write the release notes', now: now);
      expect(parsed.title, 'Write the release notes');
      expect(parsed.tags, isEmpty);
      expect(parsed.project, isNull);
      expect(parsed.estimateMs, isNull);
    });

    test('extracts tags and project and keeps the title clean', () {
      final parsed = parseShortSyntax('Fix login #bug +superprod', now: now);
      expect(parsed.title, 'Fix login');
      expect(parsed.tags, ['bug']);
      expect(parsed.project, 'superprod');
    });

    test('reads priority', () {
      expect(parseShortSyntax('Ship it p1', now: now).priority, 1);
      expect(parseShortSyntax('Later p3', now: now).priority, 3);
    });

    test('reads hours and minutes', () {
      expect(parseShortSyntax('Deep work 1h 30m', now: now).estimateMs, 90 * 60000);
      expect(parseShortSyntax('Quick 15m', now: now).estimateMs, 15 * 60000);
    });

    test('reads explicit day and keywords', () {
      expect(parseShortSyntax('Call mom @tomorrow', now: now).dueDay, '2026-11-19');
      expect(parseShortSyntax('Review @2026-12-01', now: now).dueDay, '2026-12-01');
    });

    test('resolves a weekday to the next occurrence', () {
      // 2026-11-18 is a Wednesday; the next Monday is the 23rd.
      expect(parseShortSyntax('Standup @monday', now: now).dueDay, '2026-11-23');
    });

    test('reads a deadline', () {
      expect(parseShortSyntax('Taxes !2026-12-31', now: now).deadlineDay, '2026-12-31');
    });

    test('handles everything at once', () {
      final parsed = parseShortSyntax('Plan sprint #work +superprod p2 2h @tomorrow', now: now);
      expect(parsed.title, 'Plan sprint');
      expect(parsed.tags, ['work']);
      expect(parsed.project, 'superprod');
      expect(parsed.priority, 2);
      expect(parsed.estimateMs, 120 * 60000);
      expect(parsed.dueDay, '2026-11-19');
    });

    test('does not treat hash inside a word as a tag', () {
      final parsed = parseShortSyntax('Issue #42 is fixed', now: now);
      expect(parsed.tags, ['42']);
      expect(parsed.title, 'Issue is fixed');
    });
  });
}
