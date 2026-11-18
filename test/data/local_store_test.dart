import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:superprod/data/local_store.dart';
import 'package:superprod/domain/models/task.dart';

void main() {
  late Directory dir;
  late LocalStore store;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('superprod_store_');
    store = LocalStore(dir);
  });

  tearDown(() async {
    if (await dir.exists()) await dir.delete(recursive: true);
  });

  String filePath() => '${dir.path}${Platform.pathSeparator}app_state.json';

  test('creates an initial state when no document exists', () async {
    final state = await store.load(todayStr: '2026-11-18', nowMs: 1000);
    expect(state.tasks, isEmpty);
    expect(state.tags.containsKey(todayTagId), isTrue);
    expect(state.config['startOfNextDayTime'], '00:00');
  });

  test('saves and reloads the document', () async {
    var state = await store.load(todayStr: '2026-11-18', nowMs: 1000);
    state = state.copyWith(
      tasks: {
        't1': Task(id: 't1', title: 'Persisted', created: 5),
      },
    );
    await store.save(state);

    final reloaded = await store.load(todayStr: '2026-11-18', nowMs: 2000);
    expect(reloaded.tasks['t1']!.title, 'Persisted');
    expect(reloaded.tasks['t1']!.created, 5);
  });

  test('a corrupt document is preserved, not deleted', () async {
    await File(filePath()).writeAsString('{not json');
    final state = await store.load(todayStr: '2026-11-18', nowMs: 1000);
    expect(state.tasks, isEmpty);

    final backups = dir
        .listSync()
        .whereType<File>()
        .where((file) => file.path.contains('app_state.corrupt-'))
        .toList();
    expect(backups, hasLength(1));
    expect(await backups.single.readAsString(), '{not json');
  });

  test('atomic write leaves no temp file behind', () async {
    final state = await store.load(todayStr: '2026-11-18', nowMs: 1000);
    await store.save(state);
    final names = dir.listSync().map((entity) => entity.path).toList();
    expect(names.where((path) => path.endsWith('.tmp')), isEmpty);
    expect(jsonDecode(await File(filePath()).readAsString())['schemaVersion'], 4);
  });
}
