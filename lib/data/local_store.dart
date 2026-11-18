import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../domain/app_state.dart';

/// Durable local state: one JSON document, written atomically.
///
/// The document is the whole app state, matching upstream's "state is the
/// source of truth" model. Writes go to a temp file and are renamed over the
/// old one, so a crash mid-write cannot truncate the document.
class LocalStore {
  LocalStore(this.directory);

  final Directory directory;

  File get _file => File('${directory.path}${Platform.pathSeparator}app_state.json');
  File get _tempFile =>
      File('${directory.path}${Platform.pathSeparator}app_state.json.tmp');

  static Future<LocalStore> openDefault() async =>
      LocalStore(await getApplicationSupportDirectory());

  Future<AppState> load({required String todayStr, required int nowMs}) async {
    await directory.create(recursive: true);
    if (!await _file.exists()) {
      return AppState.initial(todayStr: todayStr, nowMs: nowMs);
    }
    try {
      final json = jsonDecode(await _file.readAsString());
      return AppState.fromJson((json as Map).cast<String, Object?>());
    } catch (error) {
      // Never drop user data silently: keep the unreadable document aside.
      final stamp = DateTime.now().millisecondsSinceEpoch;
      await _file.rename(
        '${directory.path}${Platform.pathSeparator}app_state.corrupt-$stamp.json',
      );
      return AppState.initial(todayStr: todayStr, nowMs: nowMs);
    }
  }

  Future<void> save(AppState state) {
    // Serialize writes: two rapid intents must not interleave temp-file
    // writes or delete each other's target on Windows.
    final next = _pending.then((_) => _write(state));
    _pending = next.catchError((_) {});
    return next;
  }

  Future<void> _write(AppState state) async {
    await directory.create(recursive: true);
    await _tempFile.writeAsString(jsonEncode(state.toJson()), flush: true);
    try {
      if (await _file.exists()) {
        await _file.delete();
      }
    } on PathNotFoundException {
      // Another queued write already replaced it.
    }
    await _tempFile.rename(_file.path);
  }

  Future<void> _pending = Future.value();
}
