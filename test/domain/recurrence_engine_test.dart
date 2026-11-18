import 'package:flutter_test/flutter_test.dart';
import 'package:superprod/domain/app_state.dart';
import 'package:superprod/domain/models/task.dart';
import 'package:superprod/domain/models/task_repeat_cfg.dart';
import 'package:superprod/domain/recurrence_engine.dart';

import '../fixtures.dart';

void main() {
  const today = '2026-11-18';

  AppState stateWith({
    required TaskRepeatCfg cfg,
    List<Task> tasks = const [],
  }) => buildState(tasks: tasks, repeatCfgs: [cfg]);

  String Function() ids() {
    var index = 0;
    return () => 'new-${index++}';
  }

  group('sweepRecurringTasks', () {
    test('creates a daily occurrence once and advances the cursor', () {
      final cfg = TaskRepeatCfg(
        id: 'r1',
        title: 'Standup',
        repeatCycle: 'DAILY',
        quickSetting: 'DAILY',
        startDate: '2026-11-01',
        lastTaskCreationDay: '2026-11-17',
      );
      final swept = sweepRecurringTasks(
        stateWith(cfg: cfg),
        todayStr: today,
        nowMs: 1000,
        newId: ids(),
      );

      final task = swept.tasks['r1:$today']!;
      expect(task.title, 'Standup');
      expect(task.dueDay, today);
      expect(task.repeatCfgId, 'r1');
      expect(swept.repeatCfgs['r1']!.lastTaskCreationDay, today);

      // A second sweep must not duplicate the instance.
      final again = sweepRecurringTasks(
        swept,
        todayStr: today,
        nowMs: 2000,
        newId: ids(),
      );
      expect(again.tasks, hasLength(1));
    });

    test('paused configs create nothing', () {
      final cfg = TaskRepeatCfg(
        id: 'r1',
        isPaused: true,
        repeatCycle: 'DAILY',
        startDate: '2026-11-01',
        lastTaskCreationDay: '2026-11-17',
      );
      final swept = sweepRecurringTasks(
        stateWith(cfg: cfg),
        todayStr: today,
        nowMs: 1000,
        newId: ids(),
      );
      expect(swept.tasks, isEmpty);
    });

    test('skipOverdue advances past a missed occurrence without creating', () {
      final cfg = TaskRepeatCfg(
        id: 'r1',
        repeatCycle: 'WEEKLY',
        startDate: '2026-11-02',
        lastTaskCreationDay: '2026-11-09',
        skipOverdue: true,
        monday: true,
        tuesday: false,
        wednesday: false,
        thursday: false,
        friday: false,
        saturday: false,
        sunday: false,
      );
      // Monday 2026-11-16 is behind today (Wednesday 18th).
      final swept = sweepRecurringTasks(
        stateWith(cfg: cfg),
        todayStr: today,
        nowMs: 1000,
        newId: ids(),
      );
      expect(swept.tasks, isEmpty);
      expect(swept.repeatCfgs['r1']!.lastTaskCreationDay, '2026-11-16');
    });

    test('deleted instance dates are skipped, not recreated', () {
      final cfg = TaskRepeatCfg(
        id: 'r1',
        repeatCycle: 'DAILY',
        startDate: '2026-11-01',
        lastTaskCreationDay: '2026-11-17',
        deletedInstanceDates: const [today],
      );
      final swept = sweepRecurringTasks(
        stateWith(cfg: cfg),
        todayStr: today,
        nowMs: 1000,
        newId: ids(),
      );
      expect(swept.tasks, isEmpty);
      expect(swept.repeatCfgs['r1']!.lastTaskCreationDay, today);
    });

    test('repeatUntilDay stops creation', () {
      final cfg = TaskRepeatCfg(
        id: 'r1',
        repeatCycle: 'DAILY',
        startDate: '2026-11-01',
        lastTaskCreationDay: '2026-11-17',
        repeatUntilDay: '2026-11-17',
      );
      final swept = sweepRecurringTasks(
        stateWith(cfg: cfg),
        todayStr: today,
        nowMs: 1000,
        newId: ids(),
      );
      expect(swept.tasks, isEmpty);
    });

    test('startTime produces a dueWithTime and a remindAt offset', () {
      final cfg = TaskRepeatCfg(
        id: 'r1',
        repeatCycle: 'DAILY',
        startDate: '2026-11-01',
        lastTaskCreationDay: '2026-11-17',
        startTime: '09:00',
        remindAt: 'm30',
      );
      final swept = sweepRecurringTasks(
        stateWith(cfg: cfg),
        todayStr: today,
        nowMs: 1000,
        newId: ids(),
      );
      final task = swept.tasks['r1:$today']!;
      expect(task.dueDay, isNull);
      expect(task.dueWithTime, isNotNull);
      expect(
        DateTime.fromMillisecondsSinceEpoch(task.dueWithTime!).hour,
        9,
      );
      expect(
        task.remindAt,
        task.dueWithTime! - 30 * 60 * 1000,
      );
    });
  });

  group('onRecurringTaskCompleted', () {
    taskWithCfg(String cfgId) =>
        buildTask(id: 't1', repeatCfgId: cfgId, dueDay: today);

    test('waitForCompletion creates the next occurrence on completion', () {
      final cfg = TaskRepeatCfg(
        id: 'r1',
        repeatCycle: 'DAILY',
        startDate: '2026-11-01',
        lastTaskCreationDay: '2026-11-18',
        waitForCompletion: true,
      );
      final state = buildState(
        tasks: [taskWithCfg('r1')],
        repeatCfgs: [cfg],
      );
      final next = onRecurringTaskCompleted(
        state,
        state.tasks['t1']!,
        todayStr: today,
        nowMs: 1000,
        newId: ids(),
      );
      expect(next.tasks, hasLength(2));
      expect(
        next.tasks.values.where((task) => task.id != 't1').single.dueDay,
        '2026-11-19',
      );
    });

    test('waitForCompletion does not create while another instance is open', () {
      final cfg = TaskRepeatCfg(
        id: 'r1',
        repeatCycle: 'DAILY',
        startDate: '2026-11-01',
        lastTaskCreationDay: '2026-11-18',
        waitForCompletion: true,
      );
      final state = buildState(
        tasks: [taskWithCfg('r1'), buildTask(id: 'open', repeatCfgId: 'r1')],
        repeatCfgs: [cfg],
      );
      final next = onRecurringTaskCompleted(
        state,
        state.tasks['t1']!,
        todayStr: today,
        nowMs: 1000,
        newId: ids(),
      );
      expect(next.tasks, hasLength(2));
    });

    test('repeatFromCompletionDate re-anchors instead of creating', () {
      final cfg = TaskRepeatCfg(
        id: 'r1',
        repeatCycle: 'DAILY',
        startDate: '2026-11-01',
        repeatFromCompletionDate: true,
      );
      final state = buildState(
        tasks: [taskWithCfg('r1')],
        repeatCfgs: [cfg],
      );
      final next = onRecurringTaskCompleted(
        state,
        state.tasks['t1']!,
        todayStr: today,
        nowMs: 1000,
        newId: ids(),
      );
      expect(next.tasks, hasLength(1));
      expect(next.repeatCfgs['r1']!.startDate, today);
      expect(next.repeatCfgs['r1']!.lastTaskCreationDay, today);
    });

    test('a paused config creates nothing', () {
      final cfg = TaskRepeatCfg(
        id: 'r1',
        repeatCycle: 'DAILY',
        isPaused: true,
        waitForCompletion: true,
      );
      final state = buildState(
        tasks: [taskWithCfg('r1')],
        repeatCfgs: [cfg],
      );
      final next = onRecurringTaskCompleted(
        state,
        state.tasks['t1']!,
        todayStr: today,
        nowMs: 1000,
        newId: ids(),
      );
      expect(next.tasks, hasLength(1));
    });

    test('a plain series defers creation to the sweep', () {
      final cfg = TaskRepeatCfg(
        id: 'r1',
        repeatCycle: 'DAILY',
        startDate: '2026-11-01',
      );
      final state = buildState(
        tasks: [taskWithCfg('r1')],
        repeatCfgs: [cfg],
      );
      final next = onRecurringTaskCompleted(
        state,
        state.tasks['t1']!,
        todayStr: today,
        nowMs: 1000,
        newId: ids(),
      );
      expect(next.tasks, hasLength(1));
    });
  });
}
