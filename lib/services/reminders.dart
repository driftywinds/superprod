import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

/// Local task reminders.
///
/// Reminders are stored on the task (`remindAt`); this service mirrors them to
/// OS notifications. Every call is best-effort: a failing plugin (desktop, web,
/// permission denied) must never break task edits.
class Reminders {
  Reminders._();

  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  static Future<void> init() async {
    if (_ready) return;
    tz_data.initializeTimeZones();
    try {
      final info = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(info.identifier));
    } catch (_) {
      // Unknown zone: fall back to UTC rather than failing startup.
      tz.setLocalLocation(tz.getLocation('UTC'));
    }

    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    await _plugin.initialize(
      settings: const InitializationSettings(android: android),
    );
    await _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.requestNotificationsPermission();
    _ready = true;
  }

  /// Stable per-task notification id.
  static int idFor(String taskId) => taskId.hashCode & 0x7fffffff;

  /// Schedules a one-shot reminder. Past times are ignored.
  ///
  /// shortcut: inexact alarms (no SCHEDULE_EXACT_ALARM permission prompt);
  /// upgrade to exactAllowWhileIdle when reminders need minute precision.
  static Future<void> schedule({
    required String taskId,
    required String taskTitle,
    required DateTime at,
  }) async {
    if (!_ready || !at.isAfter(DateTime.now())) return;
    try {
      await _plugin.zonedSchedule(
        id: idFor(taskId),
        title: taskTitle,
        body: 'Task reminder',
        scheduledDate: tz.TZDateTime.from(at, tz.local),
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            'task_reminders',
            'Task reminders',
            channelDescription: 'Reminders for scheduled tasks',
            importance: Importance.high,
            priority: Priority.high,
          ),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      );
    } catch (_) {
      // Notification channel unavailable (permissions/config): task data is
      // still correct, the reminder is just not shown.
    }
  }

  static Future<void> cancel(String taskId) async {
    if (!_ready) return;
    try {
      await _plugin.cancel(id: idFor(taskId));
    } catch (_) {
      // Ignore: nothing to cancel if the plugin is unavailable.
    }
  }
}
