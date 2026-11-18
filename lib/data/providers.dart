import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/db/database.dart';
import '../data/repositories/tasks_repository.dart';
import '../sync/sync_client.dart';

/// Single database instance for the app's lifetime.
final databaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});

final tasksRepositoryProvider = Provider<TasksRepository>(
  (ref) => TasksRepository(ref.watch(databaseProvider)),
);

/// `YYYY-MM-DD` of the current logical day.
final todayProvider = Provider<String>((ref) {
  final now = DateTime.now();
  return '${now.year}-${now.month.toString().padLeft(2, '0')}-'
      '${now.day.toString().padLeft(2, '0')}';
});

final todayTasksProvider = StreamProvider<List<Task>>((ref) {
  final repo = ref.watch(tasksRepositoryProvider);
  return repo.watchForDay(ref.watch(todayProvider));
});

final inboxTasksProvider = StreamProvider<List<Task>>(
  (ref) => ref.watch(tasksRepositoryProvider).watchInbox(),
);

final doneTodayProvider = StreamProvider<List<Task>>((ref) {
  final repo = ref.watch(tasksRepositoryProvider);
  return repo.watchDoneForDay(ref.watch(todayProvider));
});

final projectsProvider = StreamProvider<List<Project>>(
  (ref) => ref.watch(tasksRepositoryProvider).watchProjects(),
);

/// Settings live in the same SQLite file as the data, so a backup is one file.
class AppSettings {
  const AppSettings({
    this.syncBaseUrl = '',
    this.syncToken = '',
    this.syncEncryptionPassword = '',
    this.accentColor,
  });

  final String syncBaseUrl;
  final String syncToken;
  final String syncEncryptionPassword;
  final int? accentColor;

  bool get hasSyncCredentials =>
      syncBaseUrl.trim().isNotEmpty && syncToken.trim().isNotEmpty;

  AppSettings copyWith({
    String? syncBaseUrl,
    String? syncToken,
    String? syncEncryptionPassword,
    int? accentColor,
  }) =>
      AppSettings(
        syncBaseUrl: syncBaseUrl ?? this.syncBaseUrl,
        syncToken: syncToken ?? this.syncToken,
        syncEncryptionPassword: syncEncryptionPassword ?? this.syncEncryptionPassword,
        accentColor: accentColor ?? this.accentColor,
      );
}

class SettingsRepository {
  SettingsRepository(this._db);

  final AppDatabase _db;

  static const _baseUrlKey = 'sync.baseUrl';
  static const _tokenKey = 'sync.token';
  static const _passwordKey = 'sync.encryptionPassword';
  static const _accentKey = 'ui.accent';

  Future<AppSettings> load() async {
    final rows = await _db.select(_db.meta).get();
    final map = {for (final row in rows) row.key: row.value};
    return AppSettings(
      syncBaseUrl: map[_baseUrlKey] ?? '',
      syncToken: map[_tokenKey] ?? '',
      syncEncryptionPassword: map[_passwordKey] ?? '',
      accentColor: int.tryParse(map[_accentKey] ?? ''),
    );
  }

  Future<void> save(AppSettings settings) async {
    await _put(_baseUrlKey, settings.syncBaseUrl);
    await _put(_tokenKey, settings.syncToken);
    await _put(_passwordKey, settings.syncEncryptionPassword);
    if (settings.accentColor != null) {
      await _put(_accentKey, settings.accentColor!.toString());
    }
  }

  Future<void> _put(String key, String value) => _db
      .into(_db.meta)
      .insertOnConflictUpdate(MetaCompanion.insert(key: key, value: value));
}

final settingsRepositoryProvider = Provider<SettingsRepository>(
  (ref) => SettingsRepository(ref.watch(databaseProvider)),
);

final settingsProvider = FutureProvider<AppSettings>(
  (ref) => ref.watch(settingsRepositoryProvider).load(),
);

final syncClientProvider = Provider<SyncClient>((ref) => SyncClient());

/// Connection check used by Settings → Sync.
final syncProbeProvider = FutureProvider.family<SyncProbeResult, AppSettings>(
  (ref, settings) => ref.watch(syncClientProvider).probe(settings),
);
