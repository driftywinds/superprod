import './styles.css';
import { IndexedDbOpLogStorage, OpLog } from './core/op-log';
import { SuperSyncClient, SuperSyncError } from './sync/client';
import { syncCredentials } from './sync/auth';

/**
 * Engine-first shell: proves the op log and the self-hosted sync client work
 * against a real SuperSync server. The real UI replaces this file once a
 * renderer is chosen (see FRAMEWORK_OPTIONS.md).
 */

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
};

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app missing');

const stored = syncCredentials.load();

const baseUrlInput = el('input', {
  id: 'baseUrl',
  type: 'url',
  placeholder: 'https://sync.example.com',
  autocomplete: 'url',
  value: stored.baseUrl ?? '',
});
const tokenInput = el('input', {
  id: 'token',
  type: 'password',
  placeholder: 'Bearer token',
  autocomplete: 'off',
  value: stored.token ?? '',
});
const output = el('pre', {}, 'Not connected yet.');

const log = (message: string) => {
  output.textContent = message;
};

const saveCredentials = () => {
  syncCredentials.save(baseUrlInput.value.trim(), tokenInput.value.trim());
};

const connect = async (): Promise<SuperSyncClient | null> => {
  const baseUrl = baseUrlInput.value.trim();
  const token = tokenInput.value.trim();
  if (!baseUrl || !token) {
    log('Enter a server URL and a token first.');
    return null;
  }
  saveCredentials();
  return new SuperSyncClient({ baseUrl, token, appVersion: '0.1.0' });
};

const showStatus = async () => {
  const client = await connect();
  if (!client) return;
  log('Checking server…');
  try {
    const status = await client.getStatus();
    const devices = await client.getDevices();
    const used = (status.storageUsedBytes / 1024 / 1024).toFixed(1);
    const quota = (status.storageQuotaBytes / 1024 / 1024).toFixed(0);
    log(
      [
        `server reachable`,
        `latestSeq: ${status.latestSeq}`,
        `devices online: ${status.devicesOnline}`,
        `storage: ${used} MB / ${quota} MB`,
        '',
        'devices:',
        ...devices.map(
          (d) => `  ${d.clientId} — last seen ${new Date(d.lastSeenAt).toLocaleString()}`,
        ),
      ].join('\n'),
    );
  } catch (error) {
    reportError(error);
  }
};

const localOpCount = async () => {
  const opLog = new OpLog(new IndexedDbOpLogStorage());
  await opLog.load();
  log(
    [
      `local op log`,
      `operations: ${opLog.operations.length}`,
      `pending upload: ${opLog.getPending().length}`,
      `server cursor: ${opLog.cursor}`,
    ].join('\n'),
  );
};

const clearLocal = async () => {
  const opLog = new OpLog(new IndexedDbOpLogStorage());
  await opLog.load();
  await opLog.clear();
  log('Local op log cleared.');
};

const reportError = (error: unknown) => {
  if (error instanceof SuperSyncError) {
    const hint = error.isAuthFailure
      ? '\n\nThe token is invalid or was replaced on another device — sign in again.'
      : error.isRateLimited
        ? '\n\nRate limited by the server; retry in a moment.'
        : '';
    log(`Sync error (HTTP ${error.status}${error.errorCode ? `, ${error.errorCode}` : ''}): ${error.message}${hint}`);
    return;
  }
  log(`Error: ${error instanceof Error ? error.message : String(error)}`);
};

app.append(
  el('h1', {}, 'superprod'),
  el('p', { class: 'sub' }, 'Engine shell — self-hosted sync smoke test.'),

  el(
    'fieldset',
    {},
    el('legend', {}, 'Self-hosted server'),
    el('label', { for: 'baseUrl' }, 'Server URL'),
    baseUrlInput,
    el('label', { for: 'token' }, 'Access token'),
    tokenInput,
    el(
      'div',
      { class: 'row' },
      el('button', { type: 'button', id: 'status' }, 'Check connection'),
      el('button', { type: 'button', class: 'ghost', id: 'ops' }, 'Local op log'),
      el('button', { type: 'button', class: 'ghost', id: 'clear' }, 'Clear local'),
    ),
  ),

  el('fieldset', {}, el('legend', {}, 'Result'), output),
);

document.querySelector('#status')?.addEventListener('click', showStatus);
document.querySelector('#ops')?.addEventListener('click', localOpCount);
document.querySelector('#clear')?.addEventListener('click', clearLocal);
