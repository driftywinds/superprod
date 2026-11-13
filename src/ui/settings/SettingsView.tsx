import { For, Show, createEffect, createSignal, onCleanup, type JSX } from 'solid-js';
import { Icon } from '../Icon';
import { config, resetConfig, setKeyboardShortcut, updateConfig } from '../../state/config-store';
import type { GlobalConfig } from '../../domain/config';
import {
  SETTINGS_CATEGORIES,
  SETTINGS_SECTIONS,
  type SettingsField,
  type SettingsSection,
} from './settings-schema';
import { notifications } from '../../services/notifications';
import {
  canScheduleExactAlarms,
  isNative,
  openExactAlarmSettings,
} from '../../services/exact-alarms';
import { syncCredentials } from '../../sync/auth';
import { APP_VERSION } from '../../app-version';
import { DebugPanel } from './DebugPanel';
import { registerBackHandler } from '../../services/back';
import {
  lastSyncedAt,
  reimportFromServer,
  restartAutoSync,
  syncMessage,
  syncNow,
  syncState,
} from '../../sync/runner';
import { verifyEncryptionPassword } from '../../sync/verify';

/** The store is strongly typed per section; fields carry a string key. */
const readValue = (section: keyof GlobalConfig, key: string): unknown =>
  (config[section] as Record<string, unknown>)[key];

const writeValue = (section: keyof GlobalConfig, key: string, value: unknown): void => {
  updateConfig(section, key as never, value as never);
};

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asNumber = (value: unknown): number | null => (typeof value === 'number' ? value : null);

const formatBinding = (event: KeyboardEvent): string | null => {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');

  const key = event.key;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null;
  if (key === ' ') parts.push('Space');
  else if (key.length === 1) parts.push(key.toUpperCase());
  else parts.push(key);

  return parts.join('+');
};

/* ------------------------------------------------------------- field render */

const FieldControl = (props: { field: SettingsField }): JSX.Element => {
  const field = () => props.field;
  const value = () => readValue(field().section, field().key);

  switch (field().kind) {
    case 'toggle':
      return (
        <label class="setting-row">
          <span class="setting-text">
            <span class="setting-label">{field().label}</span>
            <Show when={field().help}>
              <span class="setting-help">{field().help}</span>
            </Show>
          </span>
          <input
            type="checkbox"
            class="switch"
            checked={value() === true}
            onChange={(event) =>
              writeValue(field().section, field().key, event.currentTarget.checked)
            }
          />
        </label>
      );

    case 'number':
      return (
        <label class="setting-row">
          <span class="setting-text">
            <span class="setting-label">{field().label}</span>
            <Show when={field().help}>
              <span class="setting-help">{field().help}</span>
            </Show>
          </span>
          <span class="setting-input">
            <input
              type="number"
              class="input"
              min={(field() as { min?: number }).min ?? undefined}
              max={(field() as { max?: number }).max ?? undefined}
              step={(field() as { step?: number }).step ?? undefined}
              value={
                asNumber(value()) === null
                  ? ''
                  : String(
                      (field() as { scale?: number }).scale
                        ? Math.round(asNumber(value())! / (field() as { scale?: number }).scale!)
                        : asNumber(value()),
                    )
              }
              onChange={(event) => {
                const raw = event.currentTarget.value;
                const scale = (field() as { scale?: number }).scale ?? 1;
                writeValue(
                  field().section,
                  field().key,
                  raw === '' ? null : Number(raw) * scale,
                );
              }}
            />
            <Show when={(field() as { unit?: string }).unit}>
              <span class="setting-unit">{(field() as { unit?: string }).unit}</span>
            </Show>
          </span>
        </label>
      );

    case 'textarea':
      return (
        <label class="setting-block">
          <span class="setting-label">{field().label}</span>
          <Show when={field().help}>
            <span class="setting-help">{field().help}</span>
          </Show>
          <textarea
            class="textarea setting-textarea"
            placeholder={(field() as { placeholder?: string }).placeholder}
            value={asString(value())}
            onInput={(event) => writeValue(field().section, field().key, event.currentTarget.value)}
          />
        </label>
      );

    case 'select':
      return (
        <label class="setting-row">
          <span class="setting-text">
            <span class="setting-label">{field().label}</span>
            <Show when={field().help}>
              <span class="setting-help">{field().help}</span>
            </Show>
          </span>
          <select
            class="select setting-select"
            value={String(value() ?? 'null')}
            onChange={(event) => {
              const raw = event.currentTarget.value;
              const matched = (field() as { options: { value: unknown }[] }).options.find(
                (option) => String(option.value ?? 'null') === raw,
              );
              writeValue(field().section, field().key, matched ? matched.value : null);
            }}
          >
            <For each={(field() as { options: { value: unknown; label: string }[] }).options}>
              {(option) => <option value={String(option.value ?? 'null')}>{option.label}</option>}
            </For>
          </select>
        </label>
      );

    case 'time':
      return (
        <label class="setting-row">
          <span class="setting-label">{field().label}</span>
          <input
            type="time"
            class="input setting-time"
            value={asString(value())}
            onInput={(event) => writeValue(field().section, field().key, event.currentTarget.value)}
          />
        </label>
      );

    case 'color':
      return (
        <label class="setting-row">
          <span class="setting-text">
            <span class="setting-label">{field().label}</span>
            <Show when={field().help}>
              <span class="setting-help">{field().help}</span>
            </Show>
          </span>
          <span class="setting-input">
            <input
              type="color"
              class="color-input"
              aria-label={field().label}
              value={asString(value()) || '#3094de'}
              onInput={(event) =>
                writeValue(field().section, field().key, event.currentTarget.value)
              }
            />
          </span>
        </label>
      );

    case 'keyboard':
      return (
        <label class="setting-row">
          <span class="setting-label">{field().label}</span>
          <input
            class="input setting-keybinding"
            readOnly
            placeholder="Not set"
            value={asString(value())}
            onKeyDown={(event) => {
              event.preventDefault();
              if (event.key === 'Escape') {
                setKeyboardShortcut(field().key, null);
                return;
              }
              const binding = formatBinding(event);
              if (binding) setKeyboardShortcut(field().key, binding);
            }}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      );

    default:
      return (
        <label class="setting-row">
          <span class="setting-label">{field().label}</span>
          <input
            class="input setting-textfield"
            placeholder={(field() as { placeholder?: string }).placeholder}
            value={asString(value())}
            onInput={(event) => writeValue(field().section, field().key, event.currentTarget.value)}
          />
        </label>
      );
  }
};

/* ------------------------------------------------------------------ extras */

const NotificationExtra = (): JSX.Element => {
  const [status, setStatus] = createSignal('');
  const [tone, setTone] = createSignal<'ok' | 'bad'>('ok');
  const [exactAllowed, setExactAllowed] = createSignal<boolean | null>(null);

  // Checked on mount: without exact alarms Android batches reminders and they
  // arrive minutes late, which looks like a bug in the app.
  void (async () => {
    if (!isNative()) return;
    setExactAllowed(await canScheduleExactAlarms());
  })();

  const report = (outcome: string, detail: string) => {
    setTone(outcome === 'granted' ? 'ok' : 'bad');
    setStatus(detail);
  };

  return (
    <div class="settings-extra">
      <div class="settings-extra-title">Notifications on this device</div>
      <p class="setting-help">
        Reminders arrive with two buttons: <strong>Done</strong> completes the task and{' '}
        <strong>Snooze</strong> re-fires it in 10 minutes. Delivery uses the native
        notification service on Android and a service worker in the browser.
      </p>
      <Show when={isNative() && exactAllowed() === false}>
        <div class="settings-warning">
          <div>
            <strong>Reminders arrive late.</strong> Android only fires them on time when
            “Alarms &amp; reminders” is allowed for superprod. Without it the system batches
            alarms, so a reminder set for 11:20 can arrive at 11:21 or later.
          </div>
          <button
            class="btn small"
            onClick={async () => {
              const opened = await openExactAlarmSettings();
              setTone('ok');
              setStatus(
                opened
                  ? 'Allow “Alarms & reminders” for superprod, then come back.'
                  : 'Could not open the system screen; allow it in Android settings → Apps → superprod → Alarms & reminders.',
              );
            }}
          >
            Allow exact alarms
          </button>
        </div>
      </Show>

      <div class="btn-row">
        <button
          class="btn"
          onClick={async () => {
            const result = await notifications.ensurePermission();
            report(result.outcome, `${result.detail} (via ${result.transport})`);
          }}
        >
          Request permission
        </button>
        <button
          class="btn primary"
          onClick={async () => {
            const permission = await notifications.ensurePermission();
            if (permission.outcome !== 'granted') {
              report(permission.outcome, `${permission.detail} (via ${permission.transport})`);
              return;
            }
            const sent = await notifications.notify({
              tag: 'superprod-test',
              title: 'superprod test notification',
              body: 'Press Done to complete a task, or Snooze to be reminded again.',
              data: { taskId: '', url: '/' },
              actions: [
                { action: 'done', title: 'Done' },
                { action: 'snooze', title: 'Snooze' },
              ],
            });
            setTone(sent ? 'ok' : 'bad');
            setStatus(
              sent
                ? `Sent via ${permission.transport}. Check your notification shade.`
                : 'The notification service rejected the request.',
            );
          }}
        >
          Send test notification
        </button>
      </div>
      <Show when={status()}>
        <p class={tone() === 'ok' ? 'setting-help ok-text' : 'setting-help bad-text'}>{status()}</p>
      </Show>
    </div>
  );
};

const SyncExtra = (): JSX.Element => {
  const stored = syncCredentials.load();
  const [baseUrl, setBaseUrl] = createSignal(stored.baseUrl ?? '');
  const [token, setToken] = createSignal(stored.token ?? '');
  const [encryptPassword, setEncryptPassword] = createSignal(stored.encryptPassword ?? '');
  const [status, setStatus] = createSignal('');

  const lastSync = () => {
    const at = lastSyncedAt();
    return at ? new Date(at).toLocaleTimeString() : 'never';
  };

  return (
    <div class="settings-extra">
      <div class="settings-extra-title">Self-hosted server</div>
      <label class="setting-block">
        <span class="setting-label">Server URL</span>
        <input
          class="input"
          placeholder="https://sync.example.com"
          value={baseUrl()}
          onInput={(event) => setBaseUrl(event.currentTarget.value)}
        />
      </label>
      <label class="setting-block">
        <span class="setting-label">Access token</span>
        <input
          class="input"
          type="password"
          placeholder="JWT from the server"
          value={token()}
          onInput={(event) => setToken(event.currentTarget.value)}
        />
      </label>
      <label class="setting-block">
        <span class="setting-label">Encryption password</span>
        <span class="setting-help">
          Required for end-to-end encrypted accounts. It is tested before saving.
        </span>
        <input
          class="input"
          type="password"
          placeholder="Same password as in the desktop app"
          value={encryptPassword()}
          onInput={(event) => setEncryptPassword(event.currentTarget.value)}
        />
      </label>
      <div class="btn-row">
        <button
          class="btn primary"
          disabled={syncState() === 'syncing'}
          onClick={async () => {
            if (!baseUrl().trim() || !token().trim()) {
              setStatus('Enter a server URL and token first.');
              return;
            }

            if (encryptPassword().length > 0) {
              setStatus('Verifying encryption password…');
              const verification = await verifyEncryptionPassword({
                baseUrl: baseUrl().trim(),
                token: token().trim(),
                password: encryptPassword(),
              });
              if (!verification.ok) {
                setStatus(`Not saved — ${verification.message}`);
                return;
              }
              setStatus(`${verification.message} Saving…`);
            }

            syncCredentials.save(baseUrl().trim(), token().trim(), encryptPassword());
            updateConfig('sync', 'isEncryptionEnabled', encryptPassword().length > 0);
            updateConfig('sync', 'isEnabled', true);
            updateConfig('sync', 'syncProvider', 'SuperSync');
            restartAutoSync();

            const outcome = await syncNow();
            setStatus(outcome.message);
          }}
        >
          {syncState() === 'syncing' ? 'Syncing…' : 'Test, save & sync now'}
        </button>
        <button
          class="btn"
          disabled={syncState() === 'syncing'}
          onClick={async () => {
            syncCredentials.save(baseUrl().trim(), token().trim(), encryptPassword());
            updateConfig('sync', 'isEncryptionEnabled', encryptPassword().length > 0);
            restartAutoSync();
            const outcome = await syncNow();
            setStatus(outcome.message);
          }}
        >
          Sync now
        </button>
        <button
          class="btn"
          disabled={syncState() === 'syncing'}
          title="Forget the sync position and download everything from the server again"
          onClick={async () => {
            if (!confirm('Download everything from the server again? Local data is replaced by what the server holds.')) return;
            syncCredentials.save(baseUrl().trim(), token().trim(), encryptPassword());
            const outcome = await reimportFromServer();
            setStatus(outcome.message);
          }}
        >
          Re-download all
        </button>
      </div>
      <p class="setting-help">
        Status: <strong>{syncState()}</strong> · {syncMessage() || 'no sync yet'} · last synced{' '}
        {lastSync()}
      </p>
      <Show when={status()}>
        <p class="setting-help">{status()}</p>
      </Show>
    </div>
  );
};

const BackupExtra = (): JSX.Element => {
  const [status, setStatus] = createSignal('');

  const download = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      config: JSON.parse(JSON.stringify(config)),
      state: JSON.parse(localStorage.getItem('superprod.state.v1') ?? '{}'),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `superprod-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Backup downloaded.');
  };

  return (
    <div class="settings-extra">
      <div class="settings-extra-title">Manual backup</div>
      <p class="setting-help">
        Exports tasks, projects, tags and settings as one JSON file. Import is not implemented yet
        (PARITY.md §11).
      </p>
      <div class="btn-row">
        <button class="btn" onClick={download}>
          Download backup
        </button>
      </div>
      <Show when={status()}>
        <p class="setting-help">{status()}</p>
      </Show>
    </div>
  );
};

/* ------------------------------------------------------------------ screens */

const SectionPage = (props: {
  section: SettingsSection;
  onBack: () => void;
}): JSX.Element => (
  <div class="settings-page">
    <button class="settings-back" onClick={props.onBack}>
      <Icon name="chevronLeft" size={16} />
      Settings
    </button>

    <div class="settings-page-head">
      <span class="settings-icon large">
        <Icon name={props.section.icon} size={18} />
      </span>
      <div>
        <h2 class="settings-title">{props.section.title}</h2>
        <Show when={props.section.description}>
          <p class="settings-desc">{props.section.description}</p>
        </Show>
      </div>
    </div>

    <div class="settings-fields">
      <For each={props.section.fields}>{(field) => <FieldControl field={field} />}</For>
    </div>

    <Show when={props.section.extra === 'notifications'}>
      <NotificationExtra />
    </Show>
    <Show when={props.section.extra === 'sync'}>
      <SyncExtra />
    </Show>
    <Show when={props.section.extra === 'backup'}>
      <BackupExtra />
    </Show>
    <Show when={props.section.extra === 'debug'}>
      <DebugPanel />
    </Show>
  </div>
);

const SettingsIndex = (props: {
  query: string;
  onOpen: (id: string) => void;
}): JSX.Element => {
  const visible = () => {
    const query = props.query.trim().toLowerCase();
    if (!query) return SETTINGS_SECTIONS;
    return SETTINGS_SECTIONS.filter(
      (section) =>
        section.title.toLowerCase().includes(query) ||
        section.summary.toLowerCase().includes(query) ||
        section.fields.some((field) => field.label.toLowerCase().includes(query)),
    );
  };

  return (
    <div class="settings-index">
      <For each={SETTINGS_CATEGORIES}>
        {(category) => {
          const sections = () => visible().filter((section) => section.category === category.id);
          return (
            <Show when={sections().length > 0}>
              <div class="settings-group">
                <div class="settings-group-title">{category.title}</div>
                <div class="settings-card">
                  <For each={sections()}>
                    {(section) => (
                      <button class="settings-item" onClick={() => props.onOpen(section.id)}>
                        <span class="settings-icon">
                          <Icon name={section.icon} size={17} />
                        </span>
                        <span class="settings-item-text">
                          <span class="settings-item-title">{section.title}</span>
                          <span class="settings-item-summary">{section.summary}</span>
                        </span>
                        <Icon name="chevronRight" size={16} class="settings-item-chevron" />
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          );
        }}
      </For>
    </div>
  );
};

export const SettingsView = (): JSX.Element => {
  const requested = new URLSearchParams(location.search).get('section');
  const initial = SETTINGS_SECTIONS.find((section) => section.id === requested)?.id ?? null;

  const [activeId, setActiveId] = createSignal<string | null>(initial);

  // Back leaves a settings page before it leaves Settings.
  createEffect(() => {
    if (!activeId()) return;
    onCleanup(
      registerBackHandler('settings-page', () => {
        setActiveId(null);
        return true;
      }),
    );
  });
  const [query, setQuery] = createSignal('');

  const active = () => SETTINGS_SECTIONS.find((section) => section.id === activeId());

  /** Opening or leaving a section starts at the top, not wherever the last page was scrolled. */
  const open = (id: string | null): void => {
    setActiveId(id);
    document.querySelector('.content')?.scrollTo({ top: 0 });
  };

  return (
    <div class="settings">
      <Show
        when={active()}
        fallback={
          <>
            <input
              class="input settings-search"
              type="search"
              placeholder="Search settings…"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
            />
            <SettingsIndex query={query()} onOpen={(id) => open(id)} />
            <Show when={query().trim() && SETTINGS_SECTIONS.every((section) => !section.title.toLowerCase().includes(query().trim().toLowerCase()))}>
              <div class="empty">No setting matches “{query()}”.</div>
            </Show>

            <div class="settings-footer">
              <p class="setting-help" style={{ 'margin-bottom': '12px' }}>
                superprod v{APP_VERSION}
              </p>
              <button
                class="btn danger"
                onClick={() => {
                  if (confirm('Reset every setting to its default?')) resetConfig();
                }}
              >
                <Icon name="trash" size={13} /> Reset all settings
              </button>
            </div>
          </>
        }
      >
        {(section) => (
          <SectionPage section={section()} onBack={() => open(null)} />
        )}
      </Show>
    </div>
  );
};
