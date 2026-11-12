import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { logger, maskSecret } from '../services/logger';

/**
 * HTTP transport for the sync client.
 *
 * Browsers enforce CORS, and a self-hosted SuperSync server only allows the
 * origins listed in its `CORS_ORIGINS`. On Android the WebView would hit the
 * same wall, so native builds go through `CapacitorHttp`, which is a real
 * native request and is not subject to CORS at all.
 *
 * Web builds still need the server configured; the error message says so
 * instead of surfacing a bare "Failed to fetch".
 */

export interface HttpResult {
  status: number;
  /** Parsed JSON body, or a short raw string when the body is not JSON. */
  body: unknown;
  ok: boolean;
}

export class NetworkError extends Error {
  constructor(
    message: string,
    readonly hint: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

const isNative = (): boolean => Capacitor.isNativePlatform();

/** `location` does not exist in every runtime (tests, workers). */
const currentOrigin = (): string =>
  typeof location !== 'undefined' && location.origin ? location.origin : 'unknown origin';

const parseBody = (text: string): unknown => {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
};

export const httpJson = async (
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  fetchImpl?: typeof fetch,
): Promise<HttpResult> => {
  const method = init.method ?? 'GET';
  const redactedUrl = url.replace(/([?&](?:token|password)=)[^&]*/gi, '$1***');

  if (isNative() && !fetchImpl) {
    try {
      const response = await CapacitorHttp.request({
        url,
        method,
        headers: init.headers,
        data: init.body ? JSON.parse(init.body) : undefined,
        readTimeout: 30_000,
        connectTimeout: 15_000,
      });

      logger.debug('sync', `${method} ${redactedUrl} → ${response.status} (native)`);
      return {
        status: response.status,
        ok: response.status >= 200 && response.status < 300,
        body: typeof response.data === 'string' ? parseBody(response.data) : response.data,
      };
    } catch (error) {
      logger.error('sync', `${method} ${redactedUrl} failed (native)`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new NetworkError(
        'Could not reach the sync server.',
        'Check the URL, that the server is running, and that the device has network access.',
        error,
      );
    }
  }

  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);

  try {
    const response = await doFetch(url, {
      method,
      headers: init.headers,
      body: init.body,
    });
    const text = await response.text();
    logger.debug('sync', `${method} ${redactedUrl} → ${response.status}`);
    return { status: response.status, ok: response.ok, body: parseBody(text) };
  } catch (error) {
    // A TypeError from fetch is almost always CORS or DNS.
    logger.error('sync', `${method} ${redactedUrl} failed`, {
      error: error instanceof Error ? error.message : String(error),
      origin: currentOrigin(),
    });
    throw new NetworkError(
      'Could not reach the sync server from this browser.',
      `This is usually CORS. On the server, set CORS_ORIGINS to include ${currentOrigin()} and restart it. ` +
        'The Android app is not affected — it uses native HTTP.',
      error,
    );
  }
};

/** For diagnostics: report which transport a build will use. */
export const httpTransport = (): 'native' | 'browser' => (isNative() ? 'native' : 'browser');

export const describeAuth = (token: string | null): string => maskSecret(token);
