import { For, Show, createSignal, type JSX } from 'solid-js';
import { Icon } from '../Icon';
import { config, resetConfig, setKeyboardShortcut, updateConfig } from '../../state/config-store';
import type { GlobalConfig } from '../../domain/config';
import { SETTINGS_SECTIONS, type SettingsField } from './settings-schema';
import { notifications } from '../../services/notifications';
import { syncCredentials } from '../../sync/auth';
import { APP_VERSION } from '../../app-version';
import { lastSyncedAt, restartAutoSync, syncMessage, syncNow, syncState } from '../../sync/runner';

/** The store is strongly typed per section; fields carry a string key. */
const readValue = (section: keyof GlobalConfig, key: string): unknown =>
  (config[section] as Record<string, unknown>)[key];

const writeValue = (section: keyof GlobalConfig, key: string, value: unknown): void => {
  updateConfig(section, key as never, value as never);
};

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asNumber = (value: unknown): number | null =>
  typeof value === 'number' ? value : null;

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
              value={asNumber(value()) === null ? '' : String(asNumber(value()))}
              onChange={(event) => {
                const raw = event.currentTarget.value;
                writeValue(field().section, field().key, raw === '' ? null : Number(raw));
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
              value={asString(value()) || '#4f9cf9'}
              onInput={(event) =>
                writeValue(field().section, field().key, event.currentTarget.value)
              }
            />
            <button
              class="btn"
              onClick={() => writeValue(field().section, field().key, '#4f9cf9')}
            >
              Reset
            </button>
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
            class="input setting-text"
            placeholder={(field() as { placeholder?: string }).placeholder}
            value={asString(value())}
            onInput={(event) => writeValue(field().section, field().key, event.currentTarget.value)}
          />
        </label>
      );
  }
};

const NotificationExtra = (): JSX.Element => {
  const [status, setStatus] = createSignal<string>('');
  const [tone, setTone] = createSignal<'ok' | 'bad'>('ok');

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
            if (sent) {
              setTone('ok');
              setStatus(
                `Sent via ${permission.transport}. Check your notification shade — press Done or Snooze to test the actions.`,
              );
            } else {
              setTone('bad');
              setStatus('The notification service rejected the request.');
            }
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
          Required for end-to-end encrypted accounts. Without it the server rejects uploads and
          downloaded data cannot be read.
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
            syncCredentials.save(baseUrl().trim(), token().trim(), encryptPassword());
            updateConfig('sync', 'isEncryptionEnabled', encryptPassword().length > 0);
            updateConfig('sync', 'isEnabled', true);
            updateConfig('sync', 'syncProvider', 'SuperSync');
            restartAutoSync();

            setStatus('Connecting…');
            const outcome = await syncNow();
            setStatus(outcome.message);
          }}
        >
          {syncState() === 'syncing' ? 'Syncing…' : 'Save, enable & sync now'}
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

export const SettingsView = (): JSX.Element => {
  const [query, setQuery] = createSignal('');
  // `?section=sync` deep-links a section — used by QA and screenshots.
  const requestedSection = new URLSearchParams(location.search).get('section');
  const initialSection =
    SETTINGS_SECTIONS.find((section) => section.id === requestedSection)?.id ??
    SETTINGS_SECTIONS[0]?.id ??
    '';
  const [activeId, setActiveId] = createSignal(initialSection);

  const matches = (text: string) => text.toLowerCase().includes(query().trim().toLowerCase());

  const visibleSections = () => {
    const search = query().trim();
    if (!search) {
      const active = SETTINGS_SECTIONS.find((section) => section.id === activeId());
      return active ? [active] : [];
    }
    return SETTINGS_SECTIONS.filter(
      (section) =>
        matches(section.title) ||
        matches(section.description ?? '') ||
        section.fields.some((field) => matches(field.label)),
    );
  };

  const visibleFields = (section: (typeof SETTINGS_SECTIONS)[number]) => {
    const search = query().trim();
    if (!search || matches(section.title)) return section.fields;
    return section.fields.filter((field) => matches(field.label));
  };

  return (
    <div class="settings">
      <div class="settings-layout">
        <nav class="settings-nav" aria-label="Settings sections">
          <input
            class="input settings-search"
            type="search"
            placeholder="Search settings…"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <For each={SETTINGS_SECTIONS}>
            {(section) => (
              <button
                class="settings-nav-item"
                classList={{ active: section.id === activeId() && !query() }}
                onClick={() => {
                  setActiveId(section.id);
                  setQuery('');
                }}
              >
                {section.title}
              </button>
            )}
          </For>
        </nav>

        <div class="settings-body">
          <Show
            when={visibleSections().length > 0}
            fallback={<div class="empty">No setting matches “{query()}”.</div>}
          >
            <For each={visibleSections()}>
              {(section) => (
                <section class="settings-section">
                  <h2 class="settings-title">{section.title}</h2>
                  <Show when={section.description}>
                    <p class="settings-desc">{section.description}</p>
                  </Show>

                  <div class="settings-fields">
                    <For each={visibleFields(section)}>
                      {(field) => <FieldControl field={field} />}
                    </For>
                  </div>

                  <Show when={section.extra === 'notifications'}>
                    <NotificationExtra />
                  </Show>
                  <Show when={section.extra === 'sync'}>
                    <SyncExtra />
                  </Show>
                  <Show when={section.extra === 'backup'}>
                    <BackupExtra />
                  </Show>
                </section>
              )}
            </For>
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
        </div>
      </div>
    </div>
  );
};
