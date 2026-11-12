/**
 * Global configuration, mirroring upstream `GlobalConfigState`
 * (`src/app/features/config/global-config.model.ts`) and its defaults
 * (`default-global-config.const.ts`).
 *
 * Rules inherited from upstream:
 * - `undefined` means "not set yet" and falls back to the default.
 * - New fields must be optional with a runtime default, because already-synced
 *   config from older clients lacks them.
 * - Unknown enum-ish strings are tolerated on read and normalised to the default.
 */

export type TaskReminderOptionId =
  | 'DoNotRemind'
  | 'AtStart'
  | 'm5'
  | 'm10'
  | 'm15'
  | 'm30'
  | 'h1'
  | 'd1'
  | 'd3'
  | 'w1';

export type FocusModeSound = 'off' | 'tick' | 'whiteNoise';
export type PriorityIconPreset = 'chevrons' | 'numbers';
export type UrlBehavior = 'keep' | 'extract' | 'keep-and-attach';
export type FlowtimeBreakMode = 'ratio' | 'rule';
export type SyncProviderId =
  | 'SuperSync'
  | 'WebDAV'
  | 'Dropbox'
  | 'OneDrive'
  | 'Nextcloud'
  | 'LocalFile';

export interface AppFeaturesConfig {
  isTimeTrackingEnabled: boolean;
  isFocusModeEnabled: boolean;
  isSchedulerEnabled: boolean;
  isPlannerEnabled: boolean;
  isBoardsEnabled: boolean;
  isScheduleDayPanelEnabled: boolean;
  isIssuesPanelEnabled: boolean;
  isProjectNotesEnabled: boolean;
  isSyncIconEnabled: boolean;
  isSearchEnabled: boolean;
  isDonatePageEnabled: boolean;
  isHabitsEnabled: boolean;
  isFinishDayEnabled: boolean;
}

export interface MiscConfig {
  isConfirmBeforeExit: boolean;
  isConfirmBeforeExitWithoutFinishDay: boolean;
  isMinimizeToTray: boolean;
  isCheckForUpdates?: boolean;
  startOfNextDay: number;
  startOfNextDayTime?: string;
  isDisableAnimations: boolean;
  isVerticalActionBar?: boolean;
  isDisableCelebration?: boolean;
  isShowProductivityTipLonger?: boolean;
  isTrayShowCurrentCountdown?: boolean;
  isUseCustomWindowTitleBar?: boolean;
  customTheme?: string;
  defaultStartPage?: number | string;
  unsplashApiKey?: string | null;
  backgroundImageDark?: string | null;
  backgroundImageLight?: string | null;
  backgroundOverlayOpacity?: number;
  backgroundImageBlur?: number;
}

export interface TasksConfig {
  isAutoMarkParentAsDone: boolean;
  isAutoAddWorkedOnToToday: boolean;
  isConfirmBeforeDelete?: boolean;
  isTrayShowCurrent: boolean;
  isMarkdownFormattingInNotesEnabled: boolean;
  defaultProjectId?: string | null;
  notesTemplate: string;
  priorityIconPreset?: string;
}

export interface ShortSyntaxConfig {
  isEnableProject: boolean;
  isEnableDue: boolean;
  isEnableDeadline?: boolean;
  isEnablePriority?: boolean;
  isEnableTag: boolean;
  urlBehavior?: UrlBehavior;
}

export interface TimeTrackingConfig {
  defaultEstimate?: number | null;
  defaultEstimateSubTasks?: number | null;
  isAutoStartNextTask: boolean;
  isNotifyWhenTimeEstimateExceeded: boolean;
  isTrackingReminderEnabled: boolean;
  isTrackingReminderShowOnMobile: boolean;
  trackingReminderMinTime: number;
  isTrackingReminderNotify?: boolean;
  isTrackingReminderFocusWindow?: boolean;
}

export interface LocalizationConfig {
  lng?: string | null;
  firstDayOfWeek?: number | null;
  dateTimeLocale?: string | null;
}

export interface SoundConfig {
  isIncreaseDoneSoundPitch: boolean;
  doneSound: string | null;
  breakReminderSound: string | null;
  trackTimeSound?: string | null;
  volume: number;
}

export interface ReminderConfig {
  isCountdownBannerEnabled: boolean;
  countdownDuration: number;
  defaultTaskRemindOption?: TaskReminderOptionId;
  disableReminders?: boolean;
  isFocusWindow?: boolean;
  useAlarmStyleReminders?: boolean;
  notifyOnDueDate?: boolean;
  dueDateNotificationHour?: number;
}

export interface ScheduleConfig {
  isWorkStartEndEnabled: boolean;
  workStart: string;
  workEnd: string;
  isLunchBreakEnabled: boolean;
  lunchBreakStart: string;
  lunchBreakEnd: string;
}

export interface IdleConfig {
  isEnableIdleTimeTracking: boolean;
  minIdleTime: number;
  isOnlyOpenIdleWhenCurrentTask: boolean;
  isSuppressIdleDuringFocusMode: boolean;
}

export interface TakeABreakConfig {
  isTakeABreakEnabled: boolean;
  isLockScreen: boolean;
  isTimedFullScreenBlocker: boolean;
  timedFullScreenBlockerDuration: number;
  isFocusWindow: boolean;
  takeABreakMessage: string;
  takeABreakMinWorkingTime: number;
  takeABreakSnoozeTime: number;
  motivationalImgs: (string | null | undefined)[];
}

export interface PomodoroConfig {
  duration: number;
  breakDuration: number;
  longerBreakDuration: number;
  cyclesBeforeLongerBreak: number;
}

export interface FlowtimeBreakRule {
  minDuration: number;
  maxDuration: number | null;
  breakDuration: number;
}

export interface FlowtimeConfig {
  isBreakEnabled: boolean;
  breakMode: FlowtimeBreakMode;
  breakPercentage: number;
  breakRules: FlowtimeBreakRule[];
}

export interface FocusModeConfig {
  isShowPreparation: boolean;
  focusModeSound: FocusModeSound;
  focusModeSoundVolume: number;
  isPauseTrackingDuringBreak: boolean;
  autoStartFocusOnPlay: boolean;
  isManualBreakStart: boolean;
}

export interface FocusModeLocalConfig {
  isLoopBreakEndAlarm?: boolean;
}

export interface LocalBackupConfig {
  isEnabled: boolean;
  maxBackupFiles?: number | null;
}

export interface EvaluationConfig {
  isHideEvaluationSheet: boolean;
}

export interface TasksWidgetConfig {
  isEnabled?: boolean;
  isAlwaysShow?: boolean;
  opacity?: number;
}

export interface SyncConfig {
  isEnabled: boolean;
  isEncryptionEnabled?: boolean;
  isCompressionEnabled?: boolean;
  syncProvider: SyncProviderId | null;
  syncInterval: number;
  isManualSyncOnly?: boolean;
  superSync: {
    baseUrl: string;
    userName?: string | null;
    accessToken?: string | null;
  };
}

export type KeyboardConfig = Record<string, string | null>;

/**
 * superprod-only extension (not in upstream). Accent colour for highlights,
 * selection and the active state. Upstream has no such setting, so it is kept
 * out of every mirrored section and marked as an extension in PARITY.md.
 */
export interface UiConfig {
  accentColor?: string;
}

export const DEFAULT_ACCENT_COLOR = '#3094de';

export interface GlobalConfig {
  appFeatures: AppFeaturesConfig;
  localization: LocalizationConfig;
  misc: MiscConfig;
  tasks: TasksConfig;
  shortSyntax: ShortSyntaxConfig;
  evaluation: EvaluationConfig;
  idle: IdleConfig;
  takeABreak: TakeABreakConfig;
  pomodoro: PomodoroConfig;
  flowtime: FlowtimeConfig;
  keyboard: KeyboardConfig;
  localBackup: LocalBackupConfig;
  sound: SoundConfig;
  timeTracking: TimeTrackingConfig;
  reminder: ReminderConfig;
  schedule: ScheduleConfig;
  focusMode: FocusModeConfig;
  taskWidget?: TasksWidgetConfig;
  sync: SyncConfig;
  ui: UiConfig;
}

const minute = 60 * 1000;

const DEFAULT_NOTES_TEMPLATE = `**How can I best achieve it now?**

**What do I want?**

**Why do I want it?**
`;

/** Keyboard defaults, copied from upstream so muscle memory carries over. */
export const DEFAULT_KEYBOARD: KeyboardConfig = {
  globalShowHide: 'Ctrl+Shift+X',
  globalToggleTaskStart: null,
  globalAddNote: null,
  globalAddTask: null,
  globalToggleTaskWidget: null,
  addNewTask: 'Shift+A',
  addNewProject: 'Shift+P',
  addNewNote: 'Alt+N',
  openProjectNotes: 'Shift+N',
  toggleTaskViewCustomizerPanel: 'C',
  toggleIssuePanel: 'P',
  focusSideNav: 'Shift+D',
  toggleSideNavMode: 'Ctrl+B',
  showHelp: '?',
  showSearchBar: 'Shift+F',
  toggleBacklog: 'B',
  goToFocusMode: 'F',
  goToWorkView: 'W',
  goToScheduledView: 'Shift+S',
  goToTimeline: 'Shift+T',
  goToSettings: null,
  zoomIn: 'Ctrl++',
  zoomOut: 'Ctrl+-',
  zoomDefault: 'Ctrl+0',
  triggerSync: 'Ctrl+S',
  taskEditTitle: null,
  taskToggleDetailPanelOpen: 'I',
  taskOpenNotesPanel: 'N',
  taskOpenNotesFullscreen: null,
  taskOpenEstimationDialog: 'T',
  taskSchedule: 'S',
  taskScheduleToday: 'Shift+T',
  taskScheduleTomorrow: null,
  taskScheduleNextWeek: null,
  taskScheduleNextMonth: null,
  taskScheduleDeadline: 'Shift+S',
  taskUnschedule: 'U',
  taskToggleDone: 'D',
  taskAddSubTask: 'A',
  taskDuplicate: 'Ctrl+D',
  taskAddAttachment: 'L',
  taskDelete: 'Backspace',
  taskMoveToProject: 'E',
  taskOpenContextMenu: 'Q',
  selectPreviousTask: 'K',
  selectNextTask: 'J',
  moveTaskUp: 'Ctrl+Shift+ArrowUp',
  moveTaskDown: 'Ctrl+Shift+ArrowDown',
  moveTaskToTop: 'Ctrl+Alt+ArrowUp',
  moveTaskToBottom: 'Ctrl+Alt+ArrowDown',
  moveToBacklog: 'Shift+B',
  expandSubTasks: null,
  collapseSubTasks: null,
  togglePlay: 'Y',
  taskEditTags: 'G',
  taskToggleSelect: 'X',
};

export const DEFAULT_CONFIG: GlobalConfig = {
  appFeatures: {
    isTimeTrackingEnabled: true,
    isFocusModeEnabled: true,
    isSchedulerEnabled: true,
    isPlannerEnabled: true,
    isBoardsEnabled: true,
    isScheduleDayPanelEnabled: true,
    isIssuesPanelEnabled: true,
    isProjectNotesEnabled: true,
    isSyncIconEnabled: true,
    isSearchEnabled: true,
    isDonatePageEnabled: true,
    isHabitsEnabled: true,
    isFinishDayEnabled: true,
  },
  localization: { lng: undefined, dateTimeLocale: undefined, firstDayOfWeek: undefined },
  tasks: {
    isConfirmBeforeDelete: true,
    isAutoAddWorkedOnToToday: true,
    isAutoMarkParentAsDone: false,
    isTrayShowCurrent: true,
    defaultProjectId: 'INBOX',
    isMarkdownFormattingInNotesEnabled: true,
    notesTemplate: DEFAULT_NOTES_TEMPLATE,
    priorityIconPreset: 'chevrons',
  },
  misc: {
    isConfirmBeforeExit: false,
    isConfirmBeforeExitWithoutFinishDay: true,
    isMinimizeToTray: false,
    isCheckForUpdates: true,
    isTrayShowCurrentCountdown: true,
    startOfNextDay: 0,
    startOfNextDayTime: '00:00',
    isDisableAnimations: false,
    isVerticalActionBar: false,
    isDisableCelebration: true,
    isShowProductivityTipLonger: false,
    customTheme: 'default',
    defaultStartPage: 0,
    backgroundImageDark: null,
    backgroundImageLight: null,
  },
  shortSyntax: {
    isEnableProject: true,
    isEnableDue: true,
    isEnableDeadline: false,
    isEnablePriority: true,
    isEnableTag: true,
    urlBehavior: 'keep',
  },
  evaluation: { isHideEvaluationSheet: false },
  idle: {
    isOnlyOpenIdleWhenCurrentTask: false,
    isSuppressIdleDuringFocusMode: true,
    isEnableIdleTimeTracking: true,
    minIdleTime: 5 * minute,
  },
  takeABreak: {
    isTakeABreakEnabled: true,
    isLockScreen: false,
    isTimedFullScreenBlocker: false,
    timedFullScreenBlockerDuration: 8000,
    isFocusWindow: false,
    takeABreakMessage:
      'You have been working for ${duration} without one. Go away from the computer! Take a short walk! Makes you more productive in the long run!',
    takeABreakMinWorkingTime: 60 * minute,
    takeABreakSnoozeTime: 15 * minute,
    motivationalImgs: [],
  },
  focusMode: {
    isShowPreparation: false,
    focusModeSound: 'off',
    focusModeSoundVolume: 40,
    isPauseTrackingDuringBreak: true,
    autoStartFocusOnPlay: false,
    isManualBreakStart: false,
  },
  flowtime: { isBreakEnabled: false, breakMode: 'ratio', breakPercentage: 20, breakRules: [] },
  pomodoro: {
    duration: 25 * minute,
    breakDuration: 5 * minute,
    longerBreakDuration: 15 * minute,
    cyclesBeforeLongerBreak: 4,
  },
  keyboard: DEFAULT_KEYBOARD,
  localBackup: { isEnabled: true, maxBackupFiles: 30 },
  sound: {
    volume: 75,
    isIncreaseDoneSoundPitch: true,
    doneSound: 'ding-small-bell.mp3',
    breakReminderSound: null,
    trackTimeSound: null,
  },
  timeTracking: {
    defaultEstimate: 0,
    defaultEstimateSubTasks: 0,
    isNotifyWhenTimeEstimateExceeded: true,
    isAutoStartNextTask: false,
    isTrackingReminderEnabled: false,
    isTrackingReminderShowOnMobile: false,
    trackingReminderMinTime: 5 * minute,
    isTrackingReminderNotify: false,
    isTrackingReminderFocusWindow: false,
  },
  reminder: {
    isCountdownBannerEnabled: true,
    countdownDuration: 10 * minute,
    defaultTaskRemindOption: 'AtStart',
    disableReminders: false,
    isFocusWindow: false,
    useAlarmStyleReminders: false,
    notifyOnDueDate: true,
    dueDateNotificationHour: 9,
  },
  schedule: {
    isWorkStartEndEnabled: true,
    workStart: '9:00',
    workEnd: '17:00',
    isLunchBreakEnabled: false,
    lunchBreakStart: '13:00',
    lunchBreakEnd: '14:00',
  },
  taskWidget: { isEnabled: false, isAlwaysShow: false, opacity: 100 },
  ui: { accentColor: DEFAULT_ACCENT_COLOR },
  sync: {
    isEnabled: false,
    isEncryptionEnabled: false,
    isCompressionEnabled: false,
    syncProvider: null,
    syncInterval: minute,
    isManualSyncOnly: false,
    superSync: { baseUrl: '', userName: null, accessToken: null },
  },
};

/**
 * Merge persisted config over defaults, section by section.
 *
 * Upstream semantics: a missing key means "use the default", never "absent".
 * Unknown values are dropped rather than trusted.
 */
export const normalizeConfig = (raw: unknown): GlobalConfig => {
  if (typeof raw !== 'object' || raw === null) return structuredClone(DEFAULT_CONFIG);
  const input = raw as Record<string, unknown>;
  const config = structuredClone(DEFAULT_CONFIG);

  for (const key of Object.keys(config) as (keyof GlobalConfig)[]) {
    const stored = input[key];
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) continue;
    Object.assign(config[key] as object, stored);
  }

  // Guard the values the app relies on being well-formed.
  config.misc.startOfNextDayTime =
    typeof config.misc.startOfNextDayTime === 'string' ? config.misc.startOfNextDayTime : '00:00';
  config.sound.volume = clamp(Number(config.sound.volume), 0, 100, 75);
  config.focusMode.focusModeSoundVolume = clamp(
    Number(config.focusMode.focusModeSoundVolume),
    0,
    100,
    40,
  );
  config.timeTracking.trackingReminderMinTime = Math.max(
    0,
    Number(config.timeTracking.trackingReminderMinTime) || 5 * minute,
  );
  if (!['off', 'tick', 'whiteNoise'].includes(config.focusMode.focusModeSound)) {
    config.focusMode.focusModeSound = 'off';
  }
  config.sync.syncProvider = config.sync.syncProvider ?? null;

  return config;
};

const clamp = (value: number, min: number, max: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

/** "What day is it?" respects `startOfNextDayTime` (upstream rule). */
export const logicalDayStr = (now: Date, startOfNextDayTime: string): string => {
  const [hoursRaw, minutesRaw] = startOfNextDayTime.split(':');
  const hours = Number(hoursRaw ?? 0) || 0;
  const minutes = Number(minutesRaw ?? 0) || 0;
  const shifted = new Date(now);
  shifted.setHours(shifted.getHours() - hours, shifted.getMinutes() - minutes, 0, 0);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
