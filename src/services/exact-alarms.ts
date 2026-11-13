import { Capacitor, registerPlugin } from '@capacitor/core';
import { logger } from './logger';

/**
 * Exact-alarm capability check.
 *
 * Android 12+ only honours an exact alarm when the app may schedule them. When
 * it may not, Capacitor's local-notifications plugin quietly downgrades to
 * `setAndAllowWhileIdle`, which the OS batches — so a reminder set for 11:20
 * arrives at 11:21 or later, with no error anywhere.
 *
 * `USE_EXACT_ALARM` (declared in the manifest) is granted at install, so this
 * should be true; `SCHEDULE_EXACT_ALARM` alone needs the user to allow
 * "Alarms & reminders", which is what the settings row below offers.
 */

interface ExactAlarmPlugin {
  canScheduleExactAlarms(): Promise<{ allowed: boolean }>;
  openExactAlarmSettings(): Promise<void>;
}

const bridge = registerPlugin<ExactAlarmPlugin>('SuperprodBridge');

export const isNative = (): boolean => Capacitor.isNativePlatform();

/** True when the OS will fire the alarm at the exact minute we asked for. */
export const canScheduleExactAlarms = async (): Promise<boolean> => {
  if (!isNative()) return true;

  try {
    const result = await bridge.canScheduleExactAlarms();
    return result.allowed === true;
  } catch (error) {
    // Older builds without the bridge method: assume it is fine rather than
    // nagging the user with a warning we cannot verify.
    logger.warn('reminders', 'exact-alarm capability unknown', {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
};

/** Opens the system screen where exact alarms can be allowed. */
export const openExactAlarmSettings = async (): Promise<boolean> => {
  if (!isNative()) return false;

  try {
    await bridge.openExactAlarmSettings();
    return true;
  } catch (error) {
    logger.error('reminders', 'could not open exact-alarm settings', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

/** Logged once at startup so a diagnostic log shows the cause of late reminders. */
export const logExactAlarmState = async (): Promise<void> => {
  if (!isNative()) return;
  const allowed = await canScheduleExactAlarms();
  logger[allowed ? 'info' : 'warn'](
    'reminders',
    allowed
      ? 'exact alarms allowed; reminders fire on time'
      : 'exact alarms BLOCKED; Android batches reminders, so they arrive late. Allow "Alarms & reminders" in system settings.',
  );
};
