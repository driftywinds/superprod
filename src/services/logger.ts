/**
 * In-app logging, captured from the first line of startup.
 *
 * Everything is kept in a bounded ring buffer and can be exported from
 * Settings → Debug as one text file. Console output is mirrored so the browser
 * devtools still work.
 *
 * Secrets are never logged: the sync token is masked and the encryption
 * password is never passed to this module.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  at: number;
  level: LogLevel;
  scope: string;
  message: string;
  data?: string;
}

const MAX_ENTRIES = 3000;
const buffer: LogEntry[] = [];
const startedAt = Date.now();
const originalConsole = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  log: console.log.bind(console),
};

let installed = false;

const truncate = (value: string, limit = 2000): string =>
  value.length > limit ? `${value.slice(0, limit)}… (${value.length} chars)` : value;

/** JSON-safe, never throws, never logs functions/circular refs. */
export const serialize = (value: unknown): string => {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return `${value.name}: ${value.message}`;

  const seen = new WeakSet<object>();
  try {
    return truncate(
      JSON.stringify(
        value,
        (_key, inner) => {
          if (typeof inner === 'object' && inner !== null) {
            if (seen.has(inner)) return '[circular]';
            seen.add(inner);
          }
          if (typeof inner === 'function') return '[fn]';
          if (typeof inner === 'bigint') return String(inner);
          return inner;
        },
        2,
      ),
    );
  } catch {
    return String(value);
  }
};

export const log = (
  level: LogLevel,
  scope: string,
  message: string,
  data?: unknown,
): void => {
  const entry: LogEntry = {
    at: Date.now(),
    level,
    scope,
    message,
    data: data === undefined ? undefined : serialize(data),
  };

  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);

  const consoleFn = level === 'debug' ? originalConsole.debug : originalConsole[level];
  if (data === undefined) consoleFn(`[${scope}] ${message}`);
  else consoleFn(`[${scope}] ${message}`, data);
};

/** Convenience wrappers used across the app. */
export const logger = {
  debug: (scope: string, message: string, data?: unknown) => log('debug', scope, message, data),
  info: (scope: string, message: string, data?: unknown) => log('info', scope, message, data),
  warn: (scope: string, message: string, data?: unknown) => log('warn', scope, message, data),
  error: (scope: string, message: string, data?: unknown) => log('error', scope, message, data),
};

/** Mask anything that looks like a bearer token or long secret. */
export const maskSecret = (value: string | null | undefined): string => {
  if (!value) return '(none)';
  if (value.length <= 12) return '***';
  return `${value.slice(0, 6)}…${value.slice(-4)} (len ${value.length})`;
};

const installConsoleCapture = (): void => {
  const wrap = (level: LogLevel, original: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      original(...args);
      const [first, ...rest] = args;
      buffer.push({
        at: Date.now(),
        level,
        scope: 'console',
        message: serialize(first),
        data: rest.length > 0 ? serialize(rest.length === 1 ? rest[0] : rest) : undefined,
      });
      if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
    };

  console.debug = wrap('debug', originalConsole.debug);
  console.log = wrap('info', originalConsole.log);
  console.info = wrap('info', originalConsole.info);
  console.warn = wrap('warn', originalConsole.warn);
  console.error = wrap('error', originalConsole.error);
};

const installGlobalHandlers = (): void => {
  window.addEventListener('error', (event) => {
    log('error', 'window', event.message || 'Uncaught error', {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      error: event.error instanceof Error ? event.error.stack : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    log('error', 'promise', 'Unhandled rejection', {
      reason: event.reason instanceof Error ? event.reason.stack : event.reason,
    });
  });
};

const installFetchLogging = (): void => {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    // Only log the origin + path: query strings can carry identifiers.
    let label = url;
    try {
      const parsed = new URL(url, location.href);
      label = `${parsed.origin}${parsed.pathname}`;
    } catch {
      // leave as-is
    }

    const method = init?.method ?? 'GET';
    const started = performance.now();
    log('debug', 'http', `→ ${method} ${label}`);

    try {
      const response = await originalFetch(input, init);
      log('debug', 'http', `← ${response.status} ${label}`, {
        ms: Math.round(performance.now() - started),
      });
      return response;
    } catch (error) {
      log('error', 'http', `✕ ${label}`, {
        ms: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : String(error),
        hint: 'A TypeError here is usually CORS or an unreachable host.',
      });
      throw error;
    }
  };
};

export const installLogging = (): void => {
  if (installed) return;
  installed = true;

  installConsoleCapture();
  installGlobalHandlers();
  installFetchLogging();

  log('info', 'app', 'superprod starting', {
    href: location.href,
    origin: location.origin,
    secureContext: globalThis.isSecureContext,
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    serviceWorker: 'serviceWorker' in navigator,
  });
};

export const getLogEntries = (): readonly LogEntry[] => buffer;

export const logCount = (): number => buffer.length;

export const clearLog = (): void => {
  buffer.length = 0;
  log('info', 'app', 'log cleared');
};

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

export const formatEntry = (entry: LogEntry): string => {
  const date = new Date(entry.at);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(
    date.getMilliseconds(),
    3,
  )}`;
  const suffix = entry.data ? `\n    ${entry.data.replace(/\n/g, '\n    ')}` : '';
  return `${time} ${entry.level.toUpperCase().padEnd(5)} ${entry.scope.padEnd(10)} ${entry.message}${suffix}`;
};

/** Full export: header with environment facts, then every entry. */
export const buildLogExport = (appVersion: string): string => {
  const header = [
    '# superprod diagnostic log',
    `generated: ${new Date().toISOString()}`,
    `app version: ${appVersion}`,
    `session started: ${new Date(startedAt).toISOString()}`,
    `entries: ${buffer.length}`,
    `location: ${location.href}`,
    `secure context: ${globalThis.isSecureContext}`,
    `user agent: ${navigator.userAgent}`,
    `platform: ${navigator.platform ?? 'unknown'}`,
    `language: ${navigator.language}`,
    '',
    '---',
    '',
  ].join('\n');

  return `${header}${buffer.map(formatEntry).join('\n')}\n`;
};

const logFileName = (): string =>
  `superprod-log-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.txt`;

/**
 * Export the log.
 *
 * Android WebView ignores `<a download>`, so native builds write the file to
 * the app cache and open the system share sheet instead. The browser keeps the
 * download-link path.
 */
export const exportLog = async (appVersion: string): Promise<string> => {
  const text = buildLogExport(appVersion);
  const fileName = logFileName();

  const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  const isNative = capacitor?.isNativePlatform?.() === true;

  if (isNative) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');

      const written = await Filesystem.writeFile({
        path: fileName,
        data: text,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      await Share.share({
        title: 'superprod diagnostic log',
        text: 'superprod session log',
        url: written.uri,
        dialogTitle: 'Export log',
      });

      log('info', 'app', 'log exported via share sheet', { entries: buffer.length });
      return `Shared ${fileName}`;
    } catch (error) {
      log('error', 'app', 'log export failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return `Export failed: ${error instanceof Error ? error.message : 'unknown error'}. Use Copy instead.`;
    }
  }

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  log('info', 'app', 'log downloaded', { entries: buffer.length });
  return `Saved ${fileName}`;
};
