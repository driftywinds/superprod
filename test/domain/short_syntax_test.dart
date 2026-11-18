/// Ports the meaningful cases of upstream
/// `src/app/features/tasks/short-syntax.spec.ts` (v20.0.0).
///
/// Expectations are upstream's, translated to this API's shape: upstream
/// returns `dueWithTime` for day-only schedules plus a `hasPlannedTime: false`
/// marker (the effect turns that into `dueDay`), and it returns tag/project
/// ids. Here a day-only schedule is `dueDay` with `dueWithTimeMs == null`, and
/// tags/projects come back as titles.
///
/// Not ported, because the parser deliberately does not carry them:
/// - recurrence (`@every …`) — upstream's own title-edit reading is asserted;
/// - localized date words and the day/month order setting;
/// - chrono's relative shorthands ("@2m" = in two minutes) and time-of-day
///   words ("evening");
/// - issue-task guards, which are a task property the caller checks.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:superprod/domain/short_syntax.dart';

const _tags = ['blu', 'bla', 'hihi', '1', 'A', 'Multi Word Tag'];
const _projects = ['ProjectEasyShort', 'Some Project Title'];

/// Mon 15 Jan 2024, 10:00 local.
final _now = DateTime(2024, 1, 15, 10, 0);

ShortSyntaxResult parse(
  String title, {
  ShortSyntaxConfig config = const ShortSyntaxConfig(),
  DateTime? now,
  List<String> projects = const [],
  List<String> tags = const [],
  int startOfNextDayDiffMs = 0,
}) =>
    parseShortSyntax(
      title,
      config: config,
      now: now ?? _now,
      startOfNextDayDiffMs: startOfNextDayDiffMs,
      knownProjectTitles: projects,
      knownTagTitles: tags,
    );

/// Upstream's `expectedRanges`: each token text found in the raw input, in the
/// first position that does not overlap an earlier token.
List<ShortSyntaxRange> expectedRanges(
  String title,
  List<(ShortSyntaxTokenType, String)> tokens,
) {
  final ranges = <ShortSyntaxRange>[];
  for (final (type, text) in tokens) {
    var start = title.indexOf(text);
    while (start != -1 &&
        ranges.any((r) => start < r.end && start + text.length > r.start)) {
      start = title.indexOf(text, start + 1);
    }
    expect(start, isNot(-1), reason: "'$text' not found in '$title'");
    ranges.add(ShortSyntaxRange(type, start, start + text.length));
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

String isoOf(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';

DateTime dateOfMs(int ms) => DateTime.fromMillisecondsSinceEpoch(ms);

void main() {
  group('no syntax', () {
    test('ignores an empty title', () {
      expect(parse('').hasChanges, isFalse);
    });

    test('ignores plain text', () {
      final r = parse('So what shall I do');
      expect(r.hasChanges, isFalse);
      expect(r.title, 'So what shall I do');
    });
  });

  group('time estimates', () {
    test('parses time spent and estimate from "10m/1h"', () {
      const title = 'Fun title 10m/1h';
      final r = parse(title);
      expect(r.title, 'Fun title');
      expect(r.timeSpentMs, 600000);
      expect(r.timeEstimateMs, 3600000);
      expect(
        r.ranges,
        expectedRanges(title, [
          (ShortSyntaxTokenType.estimate, '10m/1h'),
        ]),
      );
    });

    test('parses "1h/120m"', () {
      final r = parse('Fun title whatever 1h/120m');
      expect(r.title, 'Fun title whatever');
      expect(r.timeSpentMs, 3600000);
      expect(r.timeEstimateMs, 7200000);
    });

    test('parses a fractional "1.5h"', () {
      final r = parse('Fun title whatever 1.5h');
      expect(r.title, 'Fun title whatever');
      expect(r.timeEstimateMs, 5400000);
      expect(r.timeSpentMs, isNull);
    });

    test('parses "1.5h/2.5h"', () {
      final r = parse('Fun title whatever 1.5h/2.5h');
      expect(r.timeSpentMs, 5400000);
      expect(r.timeEstimateMs, 9000000);
    });

    test('ignores estimates when the due stage is disabled', () {
      final r = parse(
        'Fun title whatever 1h/120m',
        config: const ShortSyntaxConfig(isEnableDue: false),
      );
      expect(r.hasChanges, isFalse);
      expect(r.title, 'Fun title whatever 1h/120m');
    });

    test('ignores estimates when only the estimate stage is disabled', () {
      final r = parse(
        'Fun title whatever 1h/120m',
        config: const ShortSyntaxConfig(isEnableTimeEstimate: false),
      );
      expect(r.timeEstimateMs, isNull);
      expect(r.title, 'Fun title whatever 1h/120m');
    });

    test('parses time spent only from "30m/"', () {
      const title = 'Task description 30m/';
      final r = parse(title);
      expect(r.title, 'Task description');
      expect(r.timeSpentMs, 1800000);
      expect(r.timeEstimateMs, isNull);
      expect(
        r.ranges,
        expectedRanges(title, [
          (ShortSyntaxTokenType.estimate, '30m/'),
        ]),
      );
    });

    // Upstream's "time unit clusters" table: [title, estimateMs, spentMs]
    for (final (title, estimateMins, spentMins) in <(String, int?, int?)>[
      ('1h 30m', 90, null),
      ('2h5m', 125, null),
      ('1h 30m /', null, 90),
      ('2h5m/', null, 125),
      ('1h 30m / 12h', 720, 90),
      ('1.25h / 1h 4m', 64, 75),
      ('2h5m/3h', 180, 125),
    ]) {
      test('parses "$title"', () {
        final r = parse(title);
        expect(r.timeEstimateMs, estimateMins == null ? null : estimateMins * 60000);
        expect(r.timeSpentMs, spentMins == null ? null : spentMins * 60000);
      });
    }

    test('does not read uppercase units as estimates (#6515)', () {
      for (final title in [
        'create 3D floor plan',
        'create 3d floor plan',
        'compare 3M products',
        'task 3H',
      ]) {
        expect(parse(title).hasChanges, isFalse, reason: title);
      }
    });

    test('still parses lowercase "3m" and "3h"', () {
      expect(parse('task 3m').timeEstimateMs, 180000);
      expect(parse('task 3h').timeEstimateMs, 10800000);
    });

    test('does not read an estimate inside a tag as an estimate', () {
      const title = '#1h retro 1h';
      final r = parse(title, tags: _tags);
      expect(r.title, 'retro');
      expect(r.tagTitles, ['1h']);
      expect(r.ranges, [
        const ShortSyntaxRange(ShortSyntaxTokenType.tag, 0, 3),
        const ShortSyntaxRange(ShortSyntaxTokenType.estimate, 10, 12),
      ]);
    });
  });

  group('scheduled date ("@")', () {
    test('parses a time only "4pm" for today when it is still ahead', () {
      final r = parse('Test @4pm');
      expect(r.title, 'Test');
      expect(r.dueDay, isNull);
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2024-01-15');
      expect(due.hour, 16);
      expect(due.minute, 0);
    });

    test('moves a passed time to the next day', () {
      final r = parse('Test @09h', now: DateTime(2024, 1, 15, 16, 0));
      expect(r.title, 'Test');
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2024-01-16');
      expect(due.hour, 9);
      expect(due.minute, 0);
    });

    test('ignores the due stage when disabled', () {
      expect(
        parse('Test @4pm', config: const ShortSyntaxConfig(isEnableDue: false)).hasChanges,
        isFalse,
      );
      expect(
        parse('Test @Friday', config: const ShortSyntaxConfig(isEnableDue: false)).hasChanges,
        isFalse,
      );
    });

    test('parses a day-only weekday as a day, not a time', () {
      final r = parse('Test @Friday');
      expect(r.title, 'Test');
      expect(r.dueDay, '2024-01-19');
      expect(r.dueWithTimeMs, isNull);
    });

    test('rolls a weekday whose noon anchor has passed one week', () {
      // Mon 22 Jan 2024: at 10:00 and 12:00 it is today, at 17:00 next week.
      expect(parse('Task @monday', now: DateTime(2024, 1, 22, 10)).dueDay, '2024-01-22');
      expect(parse('Task @monday', now: DateTime(2024, 1, 22, 12)).dueDay, '2024-01-22');
      expect(parse('Task @monday', now: DateTime(2024, 1, 22, 17)).dueDay, '2024-01-29');
    });

    test('removes the date syntax when there is a space after @', () {
      final r = parse('Test @ tomorrow 19:00');
      expect(r.title, 'Test');
      expect(r.dueDay, isNull);
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2024-01-16');
      expect(due.hour, 19);
    });

    test('removes "@ 4" as a bare hour', () {
      final r = parse('Test @ 4');
      expect(r.title, 'Test');
      expect(r.dueDay, isNull);
      expect(dateOfMs(r.dueWithTimeMs!).hour, 4);
    });

    test('parses "12/20/25 19:00"', () {
      final r = parse('Test @ 12/20/25 19:00');
      expect(r.title, 'Test');
      expect(r.dueDay, isNull);
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2025-12-20');
      expect(due.hour, 19);
    });

    test('parses an ISO local date time', () {
      final r = parse('@2030-10-12T13:37');
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2030-10-12');
      expect(due.hour, 13);
      expect(due.minute, 37);
    });

    test('schedules an overdue task in the future', () {
      final r = parse(
        'Overdue task @tomorrow 14:00',
        now: DateTime(2025, 12, 5, 10),
      );
      expect(r.title, 'Overdue task');
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2025-12-06');
      expect(due.hour, 14);
    });

    test('parses a month name and day', () {
      // Tue 20 Oct 2026: "dec 24" is this year, "march 22" next year.
      final now = DateTime(2026, 10, 20, 10);
      expect(parse('Task @dec 24', now: now).dueDay, '2026-12-24');
      expect(parse('Task @march 22', now: now).dueDay, '2027-03-22');
      expect(
        parse('Task @nov 21 3pm', now: now).dueWithTimeMs,
        DateTime(2026, 11, 21, 15).millisecondsSinceEpoch,
      );
    });

    test('reads "25/4" as 25 April when the first number is no month', () {
      expect(parse('Task @25/4', now: DateTime(2026, 10, 20)).dueDay, '2027-04-25');
    });

    test('joins a day word after a clock time with "h"', () {
      final r = parse('Task @18h tomorrow', now: DateTime(2026, 10, 20, 10));
      expect(r.title, 'Task');
      expect(r.dueDay, isNull);
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2026-10-21');
      expect(due.hour, 18);
      expect(
        r.ranges,
        expectedRanges('Task @18h tomorrow', [
          (ShortSyntaxTokenType.due, '@18h tomorrow'),
        ]),
      );
    });

    test('reads "14h30" as 14:30 today', () {
      final r = parse('Task @14h30', now: DateTime(2026, 10, 20, 10));
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2026-10-20');
      expect(due.hour, 14);
      expect(due.minute, 30);
    });

    test('keeps "@25h" in the title', () {
      expect(parse('Task @25h').hasChanges, isFalse);
    });

    test('keeps a non-date word after a clock time', () {
      final r = parse('Task @09h call', now: DateTime(2026, 10, 20, 10));
      // removing a token mid-title keeps both neighbouring spaces
      expect(r.title, 'Task  call');
      expect(dateOfMs(r.dueWithTimeMs!).hour, 9);
    });

    test('parses "in 1 day"', () {
      final r = parse('Task @in 1 day');
      expect(r.title, 'Task');
      expect(r.dueDay, '2024-01-16');
    });

    test('parses a combination of schedule and deadline', () {
      final r = parse(
        'Pay rent @monday !friday',
        config: const ShortSyntaxConfig(isEnableDeadline: true),
        now: DateTime(2026, 6, 1, 10),
      );
      expect(r.title, 'Pay rent');
      expect(r.dueDay, '2026-06-01');
      expect(r.deadlineDay, '2026-06-05');
    });

    test('still parses schedule syntax without a preceding space', () {
      final r = parse('lunch@12', now: DateTime(2026, 6, 1, 10));
      expect(r.title, 'lunch');
      expect(dateOfMs(r.dueWithTimeMs!).hour, 12);
    });
  });

  group('deadline ("!")', () {
    test('is off by default', () {
      expect(parse('Pay rent !friday', now: DateTime(2026, 6, 1, 10)).hasChanges, isFalse);
    });

    test('ignores a "!" glued to a word', () {
      expect(
        parse(
          'Done!',
          config: const ShortSyntaxConfig(isEnableDeadline: true),
          now: DateTime(2026, 6, 1, 10),
        ).hasChanges,
        isFalse,
      );
    });

    test('finds a later deadline token after an earlier "!" (#10217)', () {
      final r = parse(
        'wow! !tomorrow',
        config: const ShortSyntaxConfig(isEnableDeadline: true),
        now: DateTime(2026, 6, 1, 10),
      );
      expect(r.title, 'wow!');
      expect(r.deadlineDay, '2026-06-02');
      expect(r.deadlineWithTimeMs, isNull);
    });

    test('strips the matched deadline token, not an earlier identical one', () {
      final r = parse(
        'Call!5 !5',
        config: const ShortSyntaxConfig(isEnableDeadline: true),
        now: DateTime(2026, 6, 1, 10),
      );
      expect(r.title, 'Call!5');
      final deadline = dateOfMs(r.deadlineWithTimeMs!);
      // 05:00 has passed today -> tomorrow
      expect(deadline.day, 2);
      expect(deadline.hour, 5);
    });

    test('parses "09h" as a 09:00 deadline', () {
      final r = parse(
        'Task !09h',
        config: const ShortSyntaxConfig(isEnableDeadline: true),
        now: DateTime(2026, 10, 20, 10),
      );
      expect(r.title, 'Task');
      final deadline = dateOfMs(r.deadlineWithTimeMs!);
      expect(isoOf(deadline), '2026-10-21');
      expect(deadline.hour, 9);
    });
  });

  group('tags', () {
    test('ignores a numeric tag at the start of the title', () {
      expect(parse('#134 Fun title', tags: _tags).hasChanges, isFalse);
      expect(parse('#123 Task description', tags: _tags).hasChanges, isFalse);
    });

    test('ignores all tags when disabled', () {
      expect(
        parse(
          'Fun title #blu #A',
          tags: _tags,
          config: const ShortSyntaxConfig(isEnableTag: false),
        ).hasChanges,
        isFalse,
      );
    });

    test('parses a tag at the start of the title', () {
      const title = '#blu Fun title';
      final r = parse(title, tags: _tags);
      expect(r.title, 'Fun title');
      expect(r.tagTitles, ['blu']);
      expect(
        r.ranges,
        expectedRanges(title, [
          (ShortSyntaxTokenType.tag, '#blu'),
        ]),
      );
    });

    test('parses multiple tags with the first at the start', () {
      final r = parse('#blu #hihi Fun title', tags: _tags);
      expect(r.title, 'Fun title');
      expect(r.tagTitles, ['blu', 'hihi']);
    });

    test('parses a tag next to a numeric-looking title', () {
      const title = '#134 Fun title #blu';
      final r = parse(title, tags: _tags);
      expect(r.title, '#134 Fun title');
      expect(r.tagTitles, ['blu']);
      expect(
        r.ranges,
        expectedRanges(title, [
          (ShortSyntaxTokenType.tag, '#blu'),
        ]),
      );
    });

    test('ignores a "#" without a space before it', () {
      expect(parse('Fun title#blu', tags: _tags).hasChanges, isFalse);
    });

    test('ignores a glued "#" but parses the following tag', () {
      final r = parse('Fun title#blu #bla', tags: _tags);
      expect(r.title, 'Fun title#blu');
      expect(r.tagTitles, ['bla']);
    });

    test('reports a tag that does not exist yet by title', () {
      final r = parse('Fun title #blu #idontexist', tags: _tags);
      expect(r.title, 'Fun title');
      expect(r.tagTitles, ['blu', 'idontexist']);
    });

    test('parses a new tag next to a word equal to it', () {
      final r = parse('asd #asd', tags: _tags);
      expect(r.title, 'asd');
      expect(r.tagTitles, ['asd']);
    });

    test('removes a tag the task already has', () {
      const title = 'Test tag #testing';
      final r = parse(title, tags: [..._tags, 'testing']);
      expect(r.title, 'Test tag');
      expect(
        r.ranges,
        expectedRanges(title, [
          (ShortSyntaxTokenType.tag, '#testing'),
        ]),
      );
    });

    test('parses an existing and a new tag in one title (#3728)', () {
      const title = 'Test tag error #testing #someNewTag3';
      final r = parse(title, tags: [..._tags, 'testing']);
      expect(r.title, 'Test tag error');
      expect(r.tagTitles, ['testing', 'someNewTag3']);
      expect(
        r.ranges,
        expectedRanges(title, [
          (ShortSyntaxTokenType.tag, '#testing'),
          (ShortSyntaxTokenType.tag, '#someNewTag3'),
        ]),
      );
    });

    test('locates duplicate tag texts at distinct positions', () {
      final r = parse('A #blu #blu', tags: _tags);
      expect(r.ranges, [
        const ShortSyntaxRange(ShortSyntaxTokenType.tag, 2, 6),
        const ShortSyntaxRange(ShortSyntaxTokenType.tag, 7, 11),
      ]);
    });
  });

  group('multi word tags (#10735)', () {
    const deepTags = [..._tags, 'Deep', 'Deep Work'];

    test('parses a title inserted by the autocomplete', () {
      const title = 'Write report #Multi Word Tag ';
      final r = parse(title, tags: _tags);
      expect(r.title, 'Write report');
      expect(r.tagTitles, ['Multi Word Tag']);
      expect(
        r.ranges,
        expectedRanges(title, [
          (ShortSyntaxTokenType.tag, '#Multi Word Tag'),
        ]),
      );
    });

    test('prefers the longest matching tag title', () {
      const title = 'Write report #Deep Work';
      final r = parse(title, tags: deepTags);
      expect(r.title, 'Write report');
      expect(r.tagTitles, ['Deep Work']);
      expect(
        r.ranges,
        expectedRanges(title, [
          (ShortSyntaxTokenType.tag, '#Deep Work'),
        ]),
      );
    });

    test('still matches the shorter tag when other words follow', () {
      final r = parse('Write report #deep Workshop', tags: deepTags);
      // upstream keeps both spaces the mid-title removal leaves behind
      expect(r.title, 'Write report  Workshop');
      expect(r.tagTitles, ['Deep']);
    });

    test('matches case-insensitively next to other tags', () {
      const title = 'Write report #deep work #blu';
      final r = parse(title, tags: deepTags);
      expect(r.title, 'Write report');
      expect(r.tagTitles, ['Deep Work', 'blu']);
      expect(
        r.ranges,
        expectedRanges(title, [
          (ShortSyntaxTokenType.tag, '#deep work'),
          (ShortSyntaxTokenType.tag, '#blu'),
        ]),
      );
    });

    test('keeps words after a single word tag', () {
      final r = parse('#work meeting notes', tags: ['work']);
      expect(r.title, 'meeting notes');
      expect(r.tagTitles, ['work']);
    });

    test('does not change behaviour for unknown multi word text', () {
      final r = parse('Write report #Shallow Work', tags: deepTags);
      expect(r.title, 'Write report  Work');
      expect(r.tagTitles, ['Shallow']);
    });

    test('does not parse a multi word tag glued to a word', () {
      expect(parse('Write report#Deep Work', tags: deepTags).hasChanges, isFalse);
    });

    test('leaves project syntax alone', () {
      final only = parse(
        'Write report +Deep Work',
        tags: deepTags,
        projects: ['Deep Work', 'Some Project Title'],
      );
      expect(only.projectTitle, 'Deep Work');
      expect(only.title, 'Write report');

      const title = 'Write report +Some Project Title #Deep Work';
      final both = parse(
        title,
        tags: deepTags,
        projects: ['Deep Work', 'Some Project Title'],
      );
      expect(both.projectTitle, 'Some Project Title');
      expect(both.title, 'Write report');
      expect(both.tagTitles, ['Deep Work']);
      expect(
        both.ranges,
        expectedRanges(title, [
          (ShortSyntaxTokenType.project, '+Some Project Title'),
          (ShortSyntaxTokenType.tag, '#Deep Work'),
        ]),
      );
    });
  });

  group('projects', () {
    test('parses a project title and strips it', () {
      const title = 'Fun title +ProjectEasyShort';
      final r = parse(title, projects: _projects);
      expect(r.projectTitle, 'ProjectEasyShort');
      expect(r.title, 'Fun title');
      expect(
        r.ranges,
        expectedRanges(title, [
          (ShortSyntaxTokenType.project, '+ProjectEasyShort'),
        ]),
      );
    });

    test('does nothing when disabled', () {
      expect(
        parse(
          'Fun title +ProjectEasyShort',
          projects: _projects,
          config: const ShortSyntaxConfig(isEnableProject: false),
        ).hasChanges,
        isFalse,
      );
    });

    test('ignores a "+" without a space before it', () {
      expect(parse('Fun title+ProjectEasyShort', projects: _projects).hasChanges, isFalse);
    });

    test('ignores a "+" followed by a space', () {
      expect(parse('Fun title + ProjectEasyShort', projects: _projects).hasChanges, isFalse);
      expect(parse('Fun title +  ProjectEasyShort', projects: _projects).hasChanges, isFalse);
    });

    test('still parses other syntax when "+ " is not a project', () {
      final r = parse('Fun title + ProjectEasyShort 10m', projects: _projects);
      expect(r.title, 'Fun title + ProjectEasyShort');
      expect(r.timeEstimateMs, 600000);
      expect(r.projectTitle, isNull);
    });

    test('parses a partially typed single word title', () {
      expect(parse('Fun title +Project', projects: _projects).projectTitle,
          'ProjectEasyShort');
    });

    test('parses a multi word title', () {
      expect(parse('Fun title +Some Project Title', projects: _projects).projectTitle,
          'Some Project Title');
      expect(parse('Fun title +Some Pro', projects: _projects).projectTitle,
          'Some Project Title');
      expect(parse('Other fun title +SomePro', projects: _projects).projectTitle,
          'Some Project Title');
    });

    test('keeps task content after a multi word title', () {
      expect(parse('+Some Project Title do the thing', projects: _projects).title,
          'do the thing');
      expect(parse('+Some Pro do the thing', projects: _projects).title,
          'do the thing');
      expect(parse('Fun title +Some Project Title and more', projects: _projects).title,
          'Fun title and more');
    });

    test('prefers a fully typed title over a longer partial one', () {
      const overlapping = ['Work', 'Work Inbox'];
      expect(parse('Task +Work in progress', projects: overlapping).projectTitle, 'Work');
      expect(parse('Task +Work in progress', projects: overlapping).title,
          'Task in progress');
      expect(parse('Task +Work Inbox stuff', projects: overlapping).projectTitle,
          'Work Inbox');
      expect(parse('Task +Work Inbox stuff', projects: overlapping).title, 'Task stuff');
      expect(parse('Task +Work Inb stuff', projects: overlapping).projectTitle, 'Work');
    });

    test('does not join task words into a title written without spaces', () {
      final r = parse('+Home work on taxes', projects: ['Home', 'Homework']);
      expect(r.projectTitle, 'Home');
      expect(r.title, 'work on taxes');
    });

    test('prefers the shortest full title match', () {
      final r = parse('Task +print', projects: ['printer', 'imprints', 'print', 'printable']);
      expect(r.projectTitle, 'print');
      expect(r.title, 'Task');
    });

    test('ignores a non existing project', () {
      expect(parse('Other fun title +Non existing project', projects: _projects).hasChanges,
          isFalse);
    });

    test('works with time estimates', () {
      final r = parse('Fun title +ProjectEasyShort 10m/1h', projects: _projects);
      expect(r.title, 'Fun title');
      expect(r.timeEstimateMs, 3600000);
      expect(r.timeSpentMs, 600000);
      expect(r.projectTitle, 'ProjectEasyShort');
    });

    test('parses titles containing special delimiters', () {
      const templates = [
        'Task *',
        'Task * 10m',
        'Task * 1h / 2h',
        'Task * @tomorrow',
        'Task * @in 1 day',
        'Task * #A',
      ];
      const specialProjects = ['a+b', '10 contracts', 'c++', 'my@email.com', 'issue#123'];
      for (final template in templates) {
        for (final project in specialProjects) {
          final title = template.replaceAll('*', '+$project');
          expect(
            parse(title, projects: specialProjects, tags: _tags).projectTitle,
            project,
            reason: title,
          );
        }
      }
    });
  });

  group('priority', () {
    for (final (token, value) in [('p1', 3), ('p2', 2), ('p3', 1)]) {
      test('maps $token to priority $value and strips it', () {
        final title = 'Fix login bug $token';
        final r = parse(title);
        expect(r.priority, value);
        expect(r.title, 'Fix login bug');
        expect(
          r.ranges,
          expectedRanges(title, [
            (ShortSyntaxTokenType.priority, token),
          ]),
        );
      });
    }

    test('is on by default', () {
      expect(parse('Fix login bug p1').priority, 3);
    });

    test('only matches lowercase tokens', () {
      expect(parse('Fix login bug P1').hasChanges, isFalse);
      expect(parse('P2 Fix P3 incident').hasChanges, isFalse);
      final r = parse('Fix P1 incident p2');
      expect(r.priority, 2);
      expect(r.title, 'Fix P1 incident');
    });

    test('matches at the start and mid-title without a double space', () {
      expect(parse('p2 Fix login bug').title, 'Fix login bug');
      final mid = parse('Fix p2 login bug');
      expect(mid.title, 'Fix login bug');
      expect(
        mid.ranges,
        expectedRanges('Fix p2 login bug', [
          (ShortSyntaxTokenType.priority, 'p2'),
        ]),
      );
    });

    for (final title in [
      'Convert mp3 files',
      'Read chapter p10',
      'Check p0 alerts',
      'Ask about p4',
      'Order p1x adapter',
      'Fix bug p1.',
      'Fix bug (p1)',
      'Fix bug p1-ish',
      'pp1 thing',
    ]) {
      test('leaves "$title" alone', () {
        expect(parse(title).hasChanges, isFalse);
      });
    }

    test('does not treat a tag named p1 as a priority', () {
      final r = parse('Fix login bug #p1', tags: _tags);
      expect(r.priority, isNull);
      expect(r.tagTitles, ['p1']);
    });

    test('consumes every token and lets the last one win', () {
      const title = 'Fix p3 login bug p1';
      final r = parse(title);
      expect(r.priority, 3);
      expect(r.title, 'Fix login bug');
      expect(
        r.ranges,
        expectedRanges(title, [
          (ShortSyntaxTokenType.priority, 'p3'),
          (ShortSyntaxTokenType.priority, 'p1'),
        ]),
      );
      // nothing is left for the add-task effect's re-parse of the clean title
      expect(parse(r.title).hasChanges, isFalse);
    });

    test('strips adjacent tokens without a double space', () {
      final r = parse('Fix p2 p1 login');
      expect(r.priority, 3);
      expect(r.title, 'Fix login');
    });

    test('combines with tag, due date, estimate and project tokens', () {
      const title = 'Fix login bug #blu p1 @tomorrow 30m +Work';
      final r = parse(title, tags: _tags, projects: ['Work']);
      expect(r.priority, 3);
      expect(r.tagTitles, ['blu']);
      expect(r.timeEstimateMs, 1800000);
      expect(r.dueDay, '2024-01-16');
      expect(r.projectTitle, 'Work');
      expect(r.title, 'Fix login bug');
      expect(r.ranges.firstWhere((range) => range.type == ShortSyntaxTokenType.priority),
          ShortSyntaxRange(ShortSyntaxTokenType.priority, title.indexOf('p1'),
              title.indexOf('p1') + 2));
    });

    test('does not hand the token digit to an unparseable due date', () {
      final r = parse('Fix login bug @someday p1');
      expect(r.priority, 3);
      expect(r.dueWithTimeMs, isNull);
      expect(r.dueDay, isNull);
    });

    test('does nothing when disabled', () {
      expect(
        parse('Fix login bug p1', config: const ShortSyntaxConfig(isEnablePriority: false))
            .hasChanges,
        isFalse,
      );
    });
  });

  group('nth weekday', () {
    // Wed 17 Jan 2024, 10:00 local.
    final now = DateTime(2024, 1, 17, 10);

    test('parses "@2monday" as the Monday after next', () {
      final r = parse('Water plants @2monday', now: now);
      expect(r.title, 'Water plants');
      expect(r.dueDay, '2024-01-29');
      expect(r.dueWithTimeMs, isNull);
    });

    test('parses "@4tuesday" as the fourth Tuesday', () {
      final r = parse('Review @4tuesday', now: now);
      expect(r.title, 'Review');
      expect(r.dueDay, '2024-02-13');
    });

    test('treats "@1monday" exactly like "@monday"', () {
      final nth = parse('Standup @1monday', now: now);
      final plain = parse('Standup @monday', now: now);
      expect(nth.title, 'Standup');
      expect(nth.dueDay, plain.dueDay);
      expect(nth.dueWithTimeMs, plain.dueWithTimeMs);
    });

    test('supports the full range of n (1..5)', () {
      for (final (nth, expected) in [
        (1, '2024-01-22'),
        (2, '2024-01-29'),
        (3, '2024-02-05'),
        (4, '2024-02-12'),
        (5, '2024-02-19'),
      ]) {
        final r = parse('Task @${nth}monday', now: now);
        expect(r.title, 'Task');
        expect(r.dueDay, expected, reason: 'n=$nth');
      }
    });

    test('supports abbreviations, plurals and casing', () {
      for (final title in ['Task @2mon', 'Task @2mondays', 'Task @2MON', 'Task @2Mon']) {
        final r = parse(title, now: now);
        expect(r.title, 'Task', reason: title);
        expect(r.dueDay, '2024-01-29', reason: title);
      }
      for (final title in ['Task @4TUE', 'Task @4tues', 'Task @4tuesdays']) {
        expect(parse(title, now: now).dueDay, '2024-02-13', reason: title);
      }
    });

    test('accepts whitespace between the number and the weekday', () {
      final r = parse('Task @2 monday', now: now);
      expect(r.title, 'Task');
      expect(r.dueDay, '2024-01-29');
    });

    test('anchors the date no matter what time of day it is typed', () {
      // 23:00 is past the noon anchor; the result must still be the plain nth
      // weekday, not rolled forward a week.
      expect(parse('Task @2monday', now: DateTime(2024, 1, 17, 23)).dueDay,
          '2024-01-29');
    });

    test('parses a trailing time', () {
      final r = parse('Team call @2monday 3pm', now: now);
      expect(r.title, 'Team call');
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2024-01-29');
      expect(due.hour, 15);
    });

    test('does not leave the weekday in the title (#10285)', () {
      for (final title in ['Task @2monday', 'Task @9monday', 'Task @0monday']) {
        expect(parse(title, now: now).title, 'Task', reason: title);
      }
    });

    test('does not turn an out-of-range n into a time', () {
      for (final title in ['Task @9monday', 'Task @0monday']) {
        final r = parse(title, now: now);
        expect(r.dueWithTimeMs, isNull, reason: title);
        expect(r.dueDay, isNull, reason: title);
      }
    });

    test('strips trailing punctuation with the token', () {
      final r = parse('Dinner @2mondays.', now: now);
      expect(r.title, 'Dinner.');
      expect(r.dueDay, '2024-01-29');
    });

    test('leaves a trailing date in the title', () {
      final r = parse('Task @2friday tomorrow', now: now);
      expect(r.title, 'Task tomorrow');
      expect(r.dueDay, '2024-01-26');
    });

    test('reads a spaced hour and weekday as a time', () {
      for (final (title, hour) in [('Call @10 fri', 10), ('Call @15 friday', 15)]) {
        final r = parse(title, now: now);
        expect(r.title, 'Call', reason: title);
        final due = dateOfMs(r.dueWithTimeMs!);
        expect(isoOf(due), '2024-01-19', reason: title);
        expect(due.hour, hour, reason: title);
      }
    });

    test('does not claim a spaced count with a leading zero', () {
      final r = parse('Call @05 fri', now: now);
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2024-01-19');
      expect(due.hour, 5);
    });

    test('does not consume a word the weekday only prefixes', () {
      expect(parse('Task @2monx', now: now).title, 'Task monx');
    });

    test('also supports the deadline form', () {
      final r = parse(
        'Taxes !2monday',
        config: const ShortSyntaxConfig(isEnableDeadline: true),
        now: now,
      );
      expect(r.title, 'Taxes');
      expect(r.deadlineDay, '2024-01-29');
      expect(r.deadlineWithTimeMs, isNull);
    });

    test('supports a trailing time on the deadline form', () {
      final r = parse(
        'Taxes !2monday 3pm',
        config: const ShortSyntaxConfig(isEnableDeadline: true),
        now: now,
      );
      final deadline = dateOfMs(r.deadlineWithTimeMs!);
      expect(isoOf(deadline), '2024-01-29');
      expect(deadline.hour, 15);
    });

    test('advances one week when the typed time today has passed', () {
      final mondayEvening = DateTime(2024, 1, 22, 17);
      final r = parse('Team call @1monday 3pm', now: mondayEvening);
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2024-01-29');
      expect(due.hour, 15);
      expect(
        r.dueWithTimeMs,
        parse('Team call @monday 3pm', now: mondayEvening).dueWithTimeMs,
      );
    });

    test('counts a timed nth>1 on from the advanced first occurrence', () {
      final r = parse('Team call @2monday 3pm', now: DateTime(2024, 1, 22, 17));
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2024-02-05');
      expect(due.hour, 15);
    });

    test('keeps a timed nth>1 one week after a first occurrence still ahead', () {
      final r = parse('Team call @2monday 3pm', now: DateTime(2024, 1, 22, 14));
      expect(isoOf(dateOfMs(r.dueWithTimeMs!)), '2024-01-29');
    });

    test('keeps today when the typed time is still ahead', () {
      final r = parse('Team call @1monday 3pm', now: DateTime(2024, 1, 22, 14));
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2024-01-22');
      expect(due.hour, 15);
    });

    test('removes the selected deadline token, not an earlier duplicate', () {
      const title = 'wow!2monday !2monday';
      final r = parse(
        title,
        config: const ShortSyntaxConfig(isEnableDeadline: true),
        now: now,
      );
      expect(r.title, 'wow!2monday');
      expect(r.deadlineDay, '2024-01-29');
      // literal positions: the first copy of the token text is exactly the
      // ambiguity under test
      expect(r.ranges, [const ShortSyntaxRange(ShortSyntaxTokenType.deadline, 12, 20)]);
    });
  });

  group('URLs', () {
    const extract = ShortSyntaxConfig(urlBehavior: ShortSyntaxUrlBehavior.extract);
    const keepAndAttach =
        ShortSyntaxConfig(urlBehavior: ShortSyntaxUrlBehavior.keepAndAttach);

    test('extracts an https URL', () {
      final r = parse('Task https://example.com', config: extract);
      expect(r.title, 'Task');
      expect(r.attachments, hasLength(1));
      expect(r.attachments.first.path, 'https://example.com');
      expect(r.attachments.first.type, ShortSyntaxAttachmentType.link);
      expect(r.attachments.first.title, 'example');
    });

    test('extracts an http URL', () {
      final r = parse('Task http://example.com', config: extract);
      expect(r.attachments.first.path, 'http://example.com');
      expect(r.attachments.first.type, ShortSyntaxAttachmentType.link);
    });

    test('extracts a file URL', () {
      final r = parse('Task file:///path/to/document.pdf', config: extract);
      expect(r.attachments.first.path, 'file:///path/to/document.pdf');
      expect(r.attachments.first.type, ShortSyntaxAttachmentType.file);
      expect(r.title, 'Task');
    });

    test('extracts a www URL with a guessed protocol', () {
      final r = parse('Task www.example.com', config: extract);
      expect(r.attachments.first.path, '//www.example.com');
      expect(r.attachments.first.type, ShortSyntaxAttachmentType.link);
    });

    test('extracts multiple URLs with mixed protocols', () {
      final r = parse(
        'Task https://example.com www.test.org file:///home/doc.txt',
        config: extract,
      );
      expect(r.attachments.map((a) => a.path).toList(),
          ['https://example.com', '//www.test.org', 'file:///home/doc.txt']);
      expect(r.attachments.map((a) => a.type).toList(), [
        ShortSyntaxAttachmentType.link,
        ShortSyntaxAttachmentType.link,
        ShortSyntaxAttachmentType.file,
      ]);
      expect(r.title, 'Task');
    });

    test('detects image URLs', () {
      expect(
        parse('Task https://example.com/image.png', config: extract).attachments.first.type,
        ShortSyntaxAttachmentType.image,
      );
      expect(
        parse('Task file:///path/to/image.jpg', config: extract).attachments.first.type,
        ShortSyntaxAttachmentType.image,
      );
    });

    test('works with combined short syntax', () {
      final r = parse(
        'Task https://example.com @tomorrow #urgent 30m',
        config: extract,
        tags: _tags,
      );
      expect(r.attachments.first.path, 'https://example.com');
      expect(r.title, 'Task');
      expect(r.timeEstimateMs, 1800000);
      expect(r.tagTitles, contains('urgent'));
      expect(r.dueDay, '2024-01-16');
    });

    test('cleans a URL out of the middle of the title', () {
      final r = parse('Task with https://example.com in middle', config: extract);
      expect(r.title, 'Task with in middle');
    });

    test('handles Windows and Unix file paths', () {
      expect(
        parse('Task file:///C:/Users/name/document.pdf', config: extract)
            .attachments
            .first
            .path,
        'file:///C:/Users/name/document.pdf',
      );
      expect(
        parse('Task file:///home/user/document.txt', config: extract).attachments.first.path,
        'file:///home/user/document.txt',
      );
    });

    test('strips trailing punctuation from the attachment path', () {
      final r = parse('Check https://example.com.', config: extract);
      expect(r.attachments.first.path, 'https://example.com');
      expect(r.title, 'Check .');
    });

    test('extracts the basename as the attachment title', () {
      expect(
        parse('Task https://example.com/path/to/file.pdf', config: extract)
            .attachments
            .first
            .title,
        'file',
      );
      final trailing = parse('Task https://example.com/projects/', config: extract);
      expect(trailing.attachments.first.path, 'https://example.com/projects/');
      expect(trailing.attachments.first.title, 'projects');
      expect(trailing.title, 'Task');
    });

    test('keeps the URL in the title in "keep" mode', () {
      expect(parse('Check https://example.com for details').hasChanges, isFalse);
      expect(parse('Check https://example.com for details',
              config: const ShortSyntaxConfig(urlBehavior: ShortSyntaxUrlBehavior.keep))
          .hasChanges,
          isFalse);
    });

    test('keeps the URL and adds an attachment in "keep-and-attach" mode', () {
      final r = parse('Check https://example.com for details', config: keepAndAttach);
      expect(r.attachments, hasLength(1));
      expect(r.title, 'Check https://example.com for details');
    });

    test('keeps multiple URLs in "keep-and-attach" mode', () {
      final r = parse('Check https://example.com and www.test.org', config: keepAndAttach);
      expect(r.attachments.map((a) => a.path).toList(),
          ['https://example.com', '//www.test.org']);
      expect(r.title, 'Check https://example.com and www.test.org');
    });

    test('removes multiple URLs in "extract" mode', () {
      final r = parse('Check https://example.com and www.test.org', config: extract);
      expect(r.attachments, hasLength(2));
      expect(r.title, 'Check and');
    });

    test('uses "keep" when urlBehavior is not given', () {
      expect(parse('Task https://example.com').hasChanges, isFalse);
    });

    test('works with keep-and-attach mode and other short syntax', () {
      final r = parse(
        'Task https://example.com @tomorrow #urgent 30m',
        config: keepAndAttach,
        tags: _tags,
      );
      expect(r.attachments, hasLength(1));
      expect(r.title, 'Task https://example.com');
      expect(r.timeEstimateMs, 1800000);
      expect(r.dueDay, '2024-01-16');
    });

    test('uses the URL basename as the title for a bare URL', () {
      expect(parse('https://example.com/my-cool-page', config: extract).title,
          'my-cool-page');
      expect(parse('https://example.com', config: extract).title, 'example');
    });

    test('does not highlight an estimate inside a URL', () {
      final r = parse('Read https://ex.com/30m-guide later 30m', config: extract);
      expect(r.title, 'Read later');
      expect(r.ranges, [
        const ShortSyntaxRange(ShortSyntaxTokenType.url, 5, 29),
        const ShortSyntaxRange(ShortSyntaxTokenType.estimate, 36, 39),
      ]);
    });

    test('does not touch the markdown syntax in "keep" mode', () {
      expect(parse('Add [Website](https://example.com/)').hasChanges, isFalse);
    });

    test('extracts the URL of a markdown link in "extract" mode', () {
      final r = parse('Add [Website](https://example.com/)', config: extract);
      expect(r.attachments.first.path, 'https://example.com/');
      expect(r.title, 'Add Website');
    });

    test('keeps the markdown link and attaches in "keep-and-attach" mode', () {
      final r = parse('Add [Website](https://example.com/)', config: keepAndAttach);
      expect(r.attachments.first.path, 'https://example.com/');
      expect(r.title, 'Add [Website](https://example.com/)');
    });

    test('handles markdown links with trailing text', () {
      final r = parse('Check [docs](https://example.com/docs) for details', config: extract);
      expect(r.attachments.first.path, 'https://example.com/docs');
      expect(r.title, 'Check docs for details');
    });

    test('handles parentheses inside a markdown URL', () {
      final r = parse(
        'Read [article](https://en.wikipedia.org/wiki/C_(programming_language))',
        config: extract,
      );
      expect(r.attachments.first.path,
          'https://en.wikipedia.org/wiki/C_(programming_language)');
      expect(r.title, 'Read article');
    });

    test('handles multiple markdown links', () {
      final r = parse('[Site1](https://a.com) and [Site2](https://b.com)', config: extract);
      expect(r.attachments.map((a) => a.path).toList(), ['https://a.com', 'https://b.com']);
      expect(r.title, 'Site1 and Site2');
    });

    test('handles a mixed markdown link and plain URL', () {
      final r = parse('[docs](https://a.com) and https://b.com', config: extract);
      expect(r.attachments.map((a) => a.path).toList(), ['https://a.com', 'https://b.com']);
      expect(r.title, 'docs and');
    });

    test('highlights the stripped markdown syntax around the display text', () {
      const title = 'Check [docs](https://example.com/docs) for details';
      final r = parse(title, config: extract);
      expect(r.ranges, [
        const ShortSyntaxRange(ShortSyntaxTokenType.url, 6, 7),
        const ShortSyntaxRange(ShortSyntaxTokenType.url, 11, 38),
      ]);
      expect(title.substring(6, 7), '[');
      expect(title.substring(11, 38), '](https://example.com/docs)');
    });

    test('highlights markdown syntax and a plain URL in the same title', () {
      const title = '[docs](https://a.com) and https://b.com';
      final r = parse(title, config: extract);
      expect(r.ranges, [
        const ShortSyntaxRange(ShortSyntaxTokenType.url, 0, 1),
        const ShortSyntaxRange(ShortSyntaxTokenType.url, 5, 21),
        const ShortSyntaxRange(ShortSyntaxTokenType.url, 26, 39),
      ]);
    });

    test('does not touch the title when a markdown link carries no URL', () {
      expect(parse('Add [Website]()', config: extract).hasChanges, isFalse);
    });

    test('keeps a URL-less markdown link when another URL is extracted', () {
      const title = 'Add [Website]() https://a.com';
      final r = parse(title, config: extract);
      expect(r.attachments.first.path, 'https://a.com');
      expect(r.title, 'Add [Website]()');
      expect(r.ranges, [const ShortSyntaxRange(ShortSyntaxTokenType.url, 16, 29)]);
    });

    test('collapses only the markdown links that carry a URL', () {
      const title = '[a]() [b](https://b.com)';
      final r = parse(title, config: extract);
      expect(r.attachments.first.path, 'https://b.com');
      expect(r.title, '[a]() b');
      expect(r.ranges, [
        const ShortSyntaxRange(ShortSyntaxTokenType.url, 6, 7),
        const ShortSyntaxRange(ShortSyntaxTokenType.url, 8, 24),
      ]);
    });
  });

  group('combined', () {
    test('works when the estimate comes first', () {
      const title = 'Fun title 10m/1h +ProjectEasyShort';
      final r = parse(title, projects: _projects);
      expect(r.title, 'Fun title');
      expect(r.timeEstimateMs, 3600000);
      expect(r.projectTitle, 'ProjectEasyShort');
      expect(
        r.ranges,
        expectedRanges(title, [
          (ShortSyntaxTokenType.estimate, '10m/1h'),
          (ShortSyntaxTokenType.project, '+ProjectEasyShort'),
        ]),
      );
    });

    test('works when the project comes first', () {
      const title = 'Some task +ProjectEasyShort 30m #tag';
      final r = parse(title, projects: _projects);
      expect(r.title, 'Some task');
      expect(r.timeEstimateMs, 1800000);
      expect(r.projectTitle, 'ProjectEasyShort');
      expect(r.tagTitles, ['tag']);
      expect(
        r.ranges,
        expectedRanges(title, [
          (ShortSyntaxTokenType.project, '+ProjectEasyShort'),
          (ShortSyntaxTokenType.estimate, '30m'),
          (ShortSyntaxTokenType.tag, '#tag'),
        ]),
      );
    });

    test('parses schedule, project, time spent and estimate together', () {
      const title = 'Test @Friday 4pm +Project 2h/4h';
      final r = parse(title, projects: ['Project', 'Another Project']);
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2024-01-19');
      expect(due.hour, 16);
      expect(r.title, 'Test');
      expect(r.projectTitle, 'Project');
      expect(r.timeEstimateMs, 4 * 3600 * 1000);
      expect(r.timeSpentMs, 2 * 3600 * 1000);
    });

    test('parses a schedule and multiple new tags', () {
      final r = parse('Test @fri 4pm #html #css');
      final due = dateOfMs(r.dueWithTimeMs!);
      expect(isoOf(due), '2024-01-19');
      expect(due.hour, 16);
      expect(r.title, 'Test');
      expect(r.tagTitles, ['html', 'css']);
    });

    test('does nothing when every stage is off', () {
      final r = parse(
        'Test @fri 4pm #html #css +ProjectEasyShort',
        projects: _projects,
        tags: _tags,
        config: const ShortSyntaxConfig(
          isEnableDue: false,
          isEnableProject: false,
          isEnableTag: false,
        ),
      );
      expect(r.hasChanges, isFalse);
    });
  });

  group('logical day offset', () {
    test('files a day-only schedule under the logical day', () {
      // 01:00 with a 05:00 start of next day still belongs to the previous day.
      final r = parse(
        'Task @tomorrow',
        now: DateTime(2024, 1, 16, 1),
        startOfNextDayDiffMs: 5 * 3600 * 1000,
      );
      expect(r.dueDay, '2024-01-17');
    });
  });

  group('recurrence phrases (not parsed as recurrence)', () {
    // Upstream's title-edit reading (`isParseRepeat: false`): the date inside
    // the phrase still applies, no repeat config is produced.
    test('reads the date of "@every friday"', () {
      final r = parse('Water plants @every friday', now: DateTime(2024, 1, 17, 10));
      expect(r.title, 'Water plants');
      expect(r.dueDay, '2024-01-19');
    });

    test('leaves "@daily" alone', () {
      expect(parse('Journal @daily', now: DateTime(2024, 1, 17, 10)).hasChanges, isFalse);
    });
  });
}
