import { For, Show, createSignal, onCleanup, type JSX } from 'solid-js';
import { APP_VERSION } from '../../app-version';
import {
  buildLogExport,
  clearLog,
  downloadLog,
  getLogEntries,
  logCount,
  logger,
} from '../../services/logger';
import { httpTransport } from '../../sync/http';
import { Capacitor } from '@capacitor/core';

/**
 * Debug tools: export everything the app logged this session.
 *
 * The log is captured from startup (console, window errors, unhandled
 * rejections, and every HTTP request/response), so a failed sync can be
 * diagnosed from the file alone.
 */
export const DebugPanel = (): JSX.Element => {
  const [status, setStatus] = createSignal('');
  const [tick, setTick] = createSignal(0);
  const [preview, setPreview] = createSignal(false);

  const interval = setInterval(() => setTick((value) => value + 1), 2000);
  onCleanup(() => clearInterval(interval));

  const count = () => {
    void tick();
    return logCount();
  };

  const recent = () => {
    void tick();
    return getLogEntries().slice(-8).reverse();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildLogExport(APP_VERSION));
      setStatus('Log copied to the clipboard.');
      logger.info('debug', 'log copied');
    } catch (error) {
      setStatus(
        `Clipboard blocked (${error instanceof Error ? error.message : 'unknown'}). Use Export instead.`,
      );
    }
  };

  return (
    <div class="settings-extra">
      <div class="settings-extra-title">Diagnostics</div>
      <p class="setting-help">
        Everything the app does is logged from startup: console output, uncaught errors,
        unhandled rejections and every HTTP request. Export this when something fails.
      </p>

      <p class="setting-help">
        Transport: <strong>{httpTransport()}</strong>
        {Capacitor.isNativePlatform() ? ' (native HTTP, no CORS)' : ' (browser, subject to CORS)'} ·{' '}
        <strong>{count()}</strong> log entries this session.
      </p>

      <div class="btn-row">
        <button class="btn primary" onClick={() => downloadLog(APP_VERSION)}>
          Export log
        </button>
        <button class="btn" onClick={copy}>
          Copy to clipboard
        </button>
        <button class="btn" onClick={() => setPreview(!preview())}>
          {preview() ? 'Hide preview' : 'Preview'}
        </button>
        <button
          class="btn danger"
          onClick={() => {
            clearLog();
            setStatus('Log cleared.');
          }}
        >
          Clear
        </button>
      </div>

      <Show when={preview()}>
        <pre class="debug-preview">
          {getLogEntries()
            .slice(-60)
            .map(
              (entry) =>
                `${new Date(entry.at).toLocaleTimeString()} ${entry.level.toUpperCase()} ${entry.scope} ${entry.message}`,
            )
            .join('\n')}
        </pre>
      </Show>

      <Show when={!preview()}>
        <div class="debug-recent">
          <For each={recent()}>
            {(entry) => (
              <div class="debug-line">
                <span class="debug-level">{entry.level}</span>
                <span class="debug-scope">{entry.scope}</span>
                <span class="debug-msg">{entry.message}</span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={status()}>
        <p class="setting-help">{status()}</p>
      </Show>
    </div>
  );
};
