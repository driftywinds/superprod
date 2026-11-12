import type { GlobalConfig } from '../../domain/config';
import { DEFAULT_KEYBOARD } from '../../domain/config';

/**
 * Declarative settings schema. One renderer turns this into the whole Settings
 * screen, so every upstream option can be covered without bespoke components.
 */

export type SelectOption = { value: string | number | null; label: string };

export interface BaseField {
  key: string;
  section: keyof GlobalConfig;
  label: string;
  help?: string;
}

export type SettingsField =
  | (BaseField & { kind: 'toggle' })
  | (BaseField & {
      kind: 'number';
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
      /** Divide on display, multiply on input (e.g. ms -> min). */
      scale?: number;
    })
  | (BaseField & { kind: 'text'; placeholder?: string })
  | (BaseField & { kind: 'textarea'; placeholder?: string })
  | (BaseField & { kind: 'time' })
  | (BaseField & { kind: 'select'; options: SelectOption[] })
  | (BaseField & { kind: 'keyboard' })
  | (BaseField & { kind: 'color' });

export type SettingsCategoryId =
  | 'preferences'
  | 'tasks'
  | 'time'
  | 'notifications'
  | 'data'
  | 'advanced';

export interface SettingsCategory {
  id: SettingsCategoryId;
  title: string;
}

export interface SettingsSection {
  id: string;
  title: string;
  description?: string;
  /** Icon name from `src/ui/Icon.tsx`. */
  icon: string;
  category: SettingsCategoryId;
  /** One-line summary shown under the title in the grouped list. */
  summary: string;
  fields: SettingsField[];
  /** Extra content rendered at the end of the section (e.g. sync setup). */
  extra?: 'sync' | 'notifications' | 'backup' | 'debug';
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: 'preferences', title: 'Preferences' },
  { id: 'tasks', title: 'Tasks & planning' },
  { id: 'time', title: 'Time & focus' },
  { id: 'notifications', title: 'Notifications' },
  { id: 'data', title: 'Data & sync' },
  { id: 'advanced', title: 'Advanced' },
];

const toggle = (
  section: keyof GlobalConfig,
  key: string,
  label: string,
  help?: string,
): SettingsField => ({ kind: 'toggle', section, key, label, help });

const number = (
  section: keyof GlobalConfig,
  key: string,
  label: string,
  opts: { unit?: string; min?: number; max?: number; step?: number; help?: string; scale?: number } = {},
): SettingsField => ({ kind: 'number', section, key, label, ...opts });

const text = (
  section: keyof GlobalConfig,
  key: string,
  label: string,
  opts: { placeholder?: string; help?: string } = {},
): SettingsField => ({ kind: 'text', section, key, label, ...opts });

const select = (
  section: keyof GlobalConfig,
  key: string,
  label: string,
  options: SelectOption[],
  help?: string,
): SettingsField => ({ kind: 'select', section, key, label, options, help });

const keyboardFields = (): SettingsField[] =>
  Object.keys(DEFAULT_KEYBOARD).map((key) => ({
    kind: 'keyboard' as const,
    section: 'keyboard' as const,
    key,
    label: key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (c) => c.toUpperCase())
      .trim(),
  }));

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'app-features',
    title: 'App features',
    icon: 'sliders',
    category: 'advanced',
    summary: 'Turn whole subsystems on or off',
    description: 'Turn whole subsystems on or off. Defaults are never synced.',
    fields: [
      toggle('appFeatures', 'isTimeTrackingEnabled', 'Time tracking'),
      toggle('appFeatures', 'isFocusModeEnabled', 'Focus mode'),
      toggle('appFeatures', 'isPlannerEnabled', 'Planner'),
      toggle('appFeatures', 'isSchedulerEnabled', 'Schedule'),
      toggle('appFeatures', 'isScheduleDayPanelEnabled', 'Schedule day panel'),
      toggle('appFeatures', 'isBoardsEnabled', 'Boards'),
      toggle('appFeatures', 'isHabitsEnabled', 'Habits'),
      toggle('appFeatures', 'isIssuesPanelEnabled', 'Issues panel'),
      toggle('appFeatures', 'isProjectNotesEnabled', 'Project notes'),
      toggle('appFeatures', 'isSearchEnabled', 'Search'),
      toggle('appFeatures', 'isSyncIconEnabled', 'Sync button'),
      toggle('appFeatures', 'isFinishDayEnabled', 'Finish day'),
      toggle('appFeatures', 'isDonatePageEnabled', 'Support us page'),
    ],
  },
  {
    id: 'general',
    title: 'General',
    icon: 'settings',
    category: 'preferences',
    summary: 'Day boundary and app behaviour',
    description: 'The logical day boundary and app-wide behaviour.',
    fields: [
      {
        kind: 'time',
        section: 'misc',
        key: 'startOfNextDayTime',
        label: 'Start of next day',
        help: 'Tasks due before this time still count as the previous day.',
      },
      number('misc', 'startOfNextDay', 'Start of next day (hour only, legacy)', { min: 0, max: 23 }),
      select('misc', 'defaultStartPage', 'Start page', [
        { value: 0, label: 'Today' },
        { value: 1, label: 'Inbox' },
        { value: 2, label: 'Planner' },
      ]),
      toggle('misc', 'isDisableAnimations', 'Disable animations'),
      toggle('misc', 'isDisableCelebration', 'Disable celebration confetti'),
      toggle('misc', 'isShowProductivityTipLonger', 'Show productivity tips for longer'),
      toggle('misc', 'isConfirmBeforeExit', 'Confirm before exit'),
      toggle(
        'misc',
        'isConfirmBeforeExitWithoutFinishDay',
        'Confirm before exit if the day is not finished',
      ),
    ],
  },
  {
    id: 'appearance',
    title: 'Appearance',
    icon: 'palette',
    category: 'preferences',
    summary: 'Theme, accent colour, backgrounds',
    fields: [
      {
        kind: 'color',
        section: 'ui',
        key: 'accentColor',
        label: 'Accent colour',
        help: 'Highlights, selection and active states. Backgrounds stay black.',
      },
      number('ui', 'uiScale', 'Interface size', {
        min: 90,
        max: 160,
        step: 5,
        unit: '%',
        help: 'Scales text, buttons and spacing together. 100% is the original compact size.',
      }),
      select('misc', 'customTheme', 'Theme', [
        { value: 'default', label: 'Default' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ]),
      text('misc', 'backgroundImageDark', 'Background image (dark)', {
        placeholder: 'https://… or data URL',
      }),
      text('misc', 'backgroundImageLight', 'Background image (light)', {
        placeholder: 'https://… or data URL',
      }),
      number('misc', 'backgroundOverlayOpacity', 'Background overlay opacity', {
        min: 0,
        max: 100,
        unit: '%',
      }),
      number('misc', 'backgroundImageBlur', 'Background blur', { min: 0, max: 40, unit: 'px' }),
      text('misc', 'unsplashApiKey', 'Unsplash API key', {
        help: 'Used by the background image picker.',
      }),
    ],
  },
  {
    id: 'localization',
    title: 'Language & format',
    icon: 'globe',
    category: 'preferences',
    summary: 'Language, date and time format',
    fields: [
      text('localization', 'lng', 'Language', { placeholder: 'en' }),
      select('localization', 'dateTimeLocale', 'Date & time format', [
        { value: null, label: 'System default' },
        { value: 'en-GB', label: 'en-GB (day first)' },
        { value: 'en-US', label: 'en-US (month first)' },
        { value: 'ISO', label: 'ISO 8601 (YYYY-MM-DD, 24h)' },
      ]),
      select('localization', 'firstDayOfWeek', 'First day of week', [
        { value: null, label: 'System default' },
        { value: 1, label: 'Monday' },
        { value: 0, label: 'Sunday' },
      ]),
    ],
  },
  {
    id: 'tasks',
    title: 'Tasks',
    icon: 'check',
    category: 'tasks',
    summary: 'Defaults for new tasks and notes',
    fields: [
      text('tasks', 'defaultProjectId', 'Default project for new tasks'),
      text('tasks', 'notesTemplate', 'Notes template'),
      toggle('tasks', 'isMarkdownFormattingInNotesEnabled', 'Markdown formatting in notes'),
      toggle('tasks', 'isAutoMarkParentAsDone', 'Mark parent as done when all subtasks are done'),
      toggle('tasks', 'isAutoAddWorkedOnToToday', 'Add worked-on tasks to Today automatically'),
      toggle('tasks', 'isConfirmBeforeDelete', 'Confirm before deleting a task'),
      toggle('tasks', 'isTrayShowCurrent', 'Show current task in the tray'),
      select('tasks', 'priorityIconPreset', 'Priority icon style', [
        { value: 'chevrons', label: 'Chevrons' },
        { value: 'numbers', label: 'Numbers' },
      ]),
    ],
  },
  {
    id: 'time-tracking',
    title: 'Time tracking',
    icon: 'clock',
    category: 'time',
    summary: 'Estimates, reminders, auto-start',
    fields: [
      number('timeTracking', 'defaultEstimate', 'Default estimate for new tasks', {
        unit: 'min',
        min: 0,
        scale: 60_000,
      }),
      number('timeTracking', 'defaultEstimateSubTasks', 'Default estimate for subtasks', {
        unit: 'min',
        min: 0,
        scale: 60_000,
      }),
      toggle('timeTracking', 'isAutoStartNextTask', 'Auto-start the next task'),
      toggle(
        'timeTracking',
        'isNotifyWhenTimeEstimateExceeded',
        'Notify when the time estimate is exceeded',
      ),
      toggle('timeTracking', 'isTrackingReminderEnabled', 'Tracking reminder'),
      number('timeTracking', 'trackingReminderMinTime', 'Remind after', {
        unit: 'min',
        min: 1,
        scale: 60_000,
      }),
      toggle('timeTracking', 'isTrackingReminderShowOnMobile', 'Show tracking reminder on mobile'),
      toggle('timeTracking', 'isTrackingReminderNotify', 'Send a notification for the reminder'),
      toggle('timeTracking', 'isTrackingReminderFocusWindow', 'Focus the window for the reminder'),
    ],
  },
  {
    id: 'focus-mode',
    title: 'Focus mode',
    icon: 'sparkle',
    category: 'time',
    summary: 'Pomodoro, Flowtime and break rules',
    fields: [
      toggle('focusMode', 'isShowPreparation', 'Show the full-screen preparation countdown'),
      select('focusMode', 'focusModeSound', 'Focus sound', [
        { value: 'off', label: 'Off' },
        { value: 'tick', label: 'Tick' },
        { value: 'whiteNoise', label: 'White noise' },
      ]),
      number('focusMode', 'focusModeSoundVolume', 'Focus sound volume', {
        min: 0,
        max: 100,
        unit: '%',
      }),
      toggle('focusMode', 'isPauseTrackingDuringBreak', 'Pause tracking during breaks'),
      toggle('focusMode', 'autoStartFocusOnPlay', 'Pressing play also starts a focus session'),
      toggle('focusMode', 'isManualBreakStart', 'Pomodoro overtime (break starts manually)'),
      number('pomodoro', 'duration', 'Pomodoro duration', { unit: 'min', min: 1, scale: 60_000 }),
      number('pomodoro', 'breakDuration', 'Short break', { unit: 'min', min: 1, scale: 60_000 }),
      number('pomodoro', 'longerBreakDuration', 'Long break', { unit: 'min', min: 1, scale: 60_000 }),
      number('pomodoro', 'cyclesBeforeLongerBreak', 'Cycles before a long break', { min: 1 }),
      toggle('flowtime', 'isBreakEnabled', 'Flowtime auto-breaks'),
      select('flowtime', 'breakMode', 'Break calculation', [
        { value: 'ratio', label: 'Percentage of work time' },
        { value: 'rule', label: 'Rules' },
      ]),
      number('flowtime', 'breakPercentage', 'Flowtime break percentage', {
        min: 0,
        max: 100,
        unit: '%',
      }),
    ],
  },
  {
    id: 'reminders',
    title: 'Reminders & notifications',
    icon: 'bell',
    category: 'notifications',
    summary: 'Lead times, countdown, delivery',
    description: 'Reminders stay opt-in and are off entirely with one switch.',
    fields: [
      toggle('reminder', 'disableReminders', 'Disable all reminders'),
      select('reminder', 'defaultTaskRemindOption', 'Default lead time', [
        { value: 'DoNotRemind', label: 'Do not remind' },
        { value: 'AtStart', label: 'At start time' },
        { value: 'm5', label: '5 minutes before' },
        { value: 'm10', label: '10 minutes before' },
        { value: 'm15', label: '15 minutes before' },
        { value: 'm30', label: '30 minutes before' },
        { value: 'h1', label: '1 hour before' },
        { value: 'd1', label: '1 day before' },
        { value: 'd3', label: '3 days before' },
        { value: 'w1', label: '1 week before' },
      ]),
      toggle('reminder', 'isCountdownBannerEnabled', 'Countdown banner before a scheduled task'),
      number('reminder', 'countdownDuration', 'Countdown duration', { unit: 'min', min: 1, scale: 60_000 }),
      toggle('reminder', 'notifyOnDueDate', 'Notify on the due date'),
      number('reminder', 'dueDateNotificationHour', 'Due-date notification hour', {
        min: 0,
        max: 23,
      }),
      toggle('reminder', 'useAlarmStyleReminders', 'Alarm-style reminders (Android)'),
      toggle('reminder', 'isFocusWindow', 'Focus the app window when a reminder fires'),
    ],
    extra: 'notifications',
  },
  {
    id: 'schedule',
    title: 'Schedule',
    icon: 'calendar',
    category: 'tasks',
    summary: 'Work hours and lunch break',
    fields: [
      toggle('schedule', 'isWorkStartEndEnabled', 'Show work start and end'),
      { kind: 'time', section: 'schedule', key: 'workStart', label: 'Work starts' },
      { kind: 'time', section: 'schedule', key: 'workEnd', label: 'Work ends' },
      toggle('schedule', 'isLunchBreakEnabled', 'Lunch break'),
      { kind: 'time', section: 'schedule', key: 'lunchBreakStart', label: 'Lunch starts' },
      { kind: 'time', section: 'schedule', key: 'lunchBreakEnd', label: 'Lunch ends' },
    ],
  },
  {
    id: 'idle',
    title: 'Idle time',
    icon: 'pause',
    category: 'time',
    summary: 'Idle detection and suppression',
    fields: [
      toggle('idle', 'isEnableIdleTimeTracking', 'Detect idle time'),
      number('idle', 'minIdleTime', 'Idle after', { unit: 'min', min: 1, scale: 60_000 }),
      toggle('idle', 'isOnlyOpenIdleWhenCurrentTask', 'Only when a task is being tracked'),
      toggle('idle', 'isSuppressIdleDuringFocusMode', 'Suppress during focus mode'),
    ],
  },
  {
    id: 'breaks',
    title: 'Take a break',
    icon: 'sparkle',
    category: 'time',
    summary: 'Break reminders and snooze',
    fields: [
      toggle('takeABreak', 'isTakeABreakEnabled', 'Enable break reminders'),
      number('takeABreak', 'takeABreakMinWorkingTime', 'Remind after working', {
        unit: 'min',
        min: 1,
        scale: 60_000,
      }),
      number('takeABreak', 'takeABreakSnoozeTime', 'Snooze length', { unit: 'min', min: 1, scale: 60_000 }),
      {
        kind: 'textarea',
        section: 'takeABreak',
        key: 'takeABreakMessage',
        label: 'Break message',
        help: '${duration} is replaced with the time worked.',
      },
      toggle('takeABreak', 'isTimedFullScreenBlocker', 'Timed full-screen blocker'),
      number('takeABreak', 'timedFullScreenBlockerDuration', 'Blocker duration', {
        unit: 'ms',
        min: 0,
      }),
      toggle('takeABreak', 'isLockScreen', 'Lock the screen during the break'),
      toggle('takeABreak', 'isFocusWindow', 'Focus the window when the reminder fires'),
    ],
  },
  {
    id: 'sound',
    title: 'Sound',
    icon: 'music',
    category: 'notifications',
    summary: 'Volume and completion sounds',
    fields: [
      number('sound', 'volume', 'Volume', { min: 0, max: 100, unit: '%' }),
      text('sound', 'doneSound', 'Done sound', { placeholder: 'ding-small-bell.mp3' }),
      text('sound', 'breakReminderSound', 'Break reminder sound'),
      text('sound', 'trackTimeSound', 'Track time sound'),
      toggle('sound', 'isIncreaseDoneSoundPitch', 'Increase done sound pitch with progress'),
    ],
  },
  {
    id: 'short-syntax',
    title: 'Short syntax',
    icon: 'keyboard',
    category: 'tasks',
    summary: 'Quick-add forms recognised in titles',
    description: 'Which quick-add forms are recognised in task titles.',
    fields: [
      toggle('shortSyntax', 'isEnableTag', 'Tag syntax (#tag)'),
      toggle('shortSyntax', 'isEnableProject', 'Project syntax (+project)'),
      toggle('shortSyntax', 'isEnableDue', 'Due date syntax (@friday)'),
      toggle('shortSyntax', 'isEnableDeadline', 'Deadline syntax (!tomorrow)'),
      toggle('shortSyntax', 'isEnablePriority', 'Priority syntax (p1–p3)'),
      select('shortSyntax', 'urlBehavior', 'URLs in titles', [
        { value: 'keep', label: 'Keep in the title' },
        { value: 'extract', label: 'Extract to an attachment' },
        { value: 'keep-and-attach', label: 'Keep and attach' },
      ]),
    ],
  },
  {
    id: 'evaluation',
    title: 'Evaluation',
    icon: 'chart',
    category: 'preferences',
    summary: 'Daily evaluation sheet',
    fields: [toggle('evaluation', 'isHideEvaluationSheet', 'Hide the daily evaluation sheet')],
  },
  {
    id: 'backup',
    title: 'Backups',
    icon: 'database',
    category: 'data',
    summary: 'Automatic local backups',
    description: 'Local automatic backups protect against device loss.',
    fields: [
      toggle('localBackup', 'isEnabled', 'Automatic local backups'),
      number('localBackup', 'maxBackupFiles', 'Maximum backup files', { min: 1 }),
    ],
    extra: 'backup',
  },
  {
    id: 'sync',
    title: 'Sync',
    icon: 'sync',
    category: 'data',
    summary: 'Self-hosted server and encryption',
    description: 'Self-hosted first. Nothing is uploaded unless you configure it.',
    fields: [
      toggle('sync', 'isEnabled', 'Enable sync'),
      select('sync', 'syncProvider', 'Provider', [
        { value: null, label: 'None' },
        { value: 'SuperSync', label: 'SuperSync (self-hosted)' },
      ]),
      number('sync', 'syncInterval', 'Sync interval', { unit: 's', min: 10, scale: 1000 }),
      toggle('sync', 'isManualSyncOnly', 'Manual sync only'),
      toggle('sync', 'isEncryptionEnabled', 'End-to-end encryption'),
      toggle('sync', 'isCompressionEnabled', 'Compress uploads'),
    ],
    extra: 'sync',
  },
  {
    id: 'debug',
    title: 'Debug',
    icon: 'bug',
    category: 'advanced',
    summary: 'Session log and diagnostics',
    description: 'Export the session log when something goes wrong.',
    fields: [],
    extra: 'debug',
  },
  {
    id: 'keyboard',
    title: 'Keyboard shortcuts',
    icon: 'keyboard',
    category: 'advanced',
    summary: 'Rebind any shortcut',
    description: 'Click a shortcut and press the keys to rebind it. Esc clears it.',
    fields: keyboardFields(),
  },
];
