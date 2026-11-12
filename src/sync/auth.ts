/**
 * Minimal self-hosted auth client.
 *
 * The server has no password login: accounts are created and signed in with
 * emailed magic links or passkeys (`packages/super-sync-server/src/api.ts`).
 * This module covers the magic-link path, which a self-hosted operator can run
 * with a local SMTP relay.
 *
 * Passkey (WebAuthn) endpoints exist upstream but are not wired here yet —
 * see PARITY.md §10 for the remaining work.
 */

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export interface MagicLinkRequestOptions {
  baseUrl: string;
  email: string;
  fetchImpl?: typeof fetch;
}

export interface MagicLinkRequestResult {
  message: string;
}

/** `POST /api/register/magic-link` or `/api/login/magic-link`. */
export const requestMagicLink = async (
  options: MagicLinkRequestOptions,
  mode: 'login' | 'register' = 'login',
): Promise<MagicLinkRequestResult> => {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const response = await doFetch(
    `${trimTrailingSlash(options.baseUrl)}/api/${mode}/magic-link`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: options.email }),
    },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Magic link request failed (HTTP ${response.status})`);
  }
  return (await response.json()) as MagicLinkRequestResult;
};

export interface VerifyMagicLinkOptions extends MagicLinkRequestOptions {
  token: string;
}

/** `POST /api/login/magic-link/verify` — returns the JWT used as a bearer token. */
export const verifyMagicLink = async (
  options: VerifyMagicLinkOptions,
): Promise<string> => {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const response = await doFetch(
    `${trimTrailingSlash(options.baseUrl)}/api/login/magic-link/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token: options.token }),
    },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Magic link verification failed (HTTP ${response.status})`);
  }

  const body = (await response.json()) as { token?: string };
  if (!body.token) throw new Error('Server returned no token');
  return body.token;
};

const TOKEN_KEY = 'superprod.sync.token';
const BASE_URL_KEY = 'superprod.sync.baseUrl';
const ENCRYPT_KEY = 'superprod.sync.encryptPassword';

/**
 * Token persistence.
 *
 * shortcut: localStorage, which is readable by any script on the origin and by
 * anyone with access to the device profile. Move to secure storage (Android
 * Keystore via a Capacitor plugin, OS keychain on desktop) before shipping —
 * this is the same trust level the upstream web build uses.
 */
export interface SyncCredentials {
  baseUrl: string | null;
  token: string | null;
  /** SuperSync end-to-end encryption password, when the account uses it. */
  encryptPassword: string | null;
}

export const syncCredentials = {
  load(): SyncCredentials {
    try {
      return {
        baseUrl: localStorage.getItem(BASE_URL_KEY),
        token: localStorage.getItem(TOKEN_KEY),
        encryptPassword: localStorage.getItem(ENCRYPT_KEY),
      };
    } catch {
      return { baseUrl: null, token: null, encryptPassword: null };
    }
  },
  save(baseUrl: string, token: string, encryptPassword?: string | null): void {
    localStorage.setItem(BASE_URL_KEY, baseUrl);
    localStorage.setItem(TOKEN_KEY, token);
    if (encryptPassword !== undefined && encryptPassword !== null) {
      if (encryptPassword.length > 0) localStorage.setItem(ENCRYPT_KEY, encryptPassword);
      else localStorage.removeItem(ENCRYPT_KEY);
    }
  },
  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ENCRYPT_KEY);
  },
};
