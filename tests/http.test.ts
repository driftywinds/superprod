import { describe, expect, it, vi } from 'vitest';
import { NetworkError, httpJson } from '../src/sync/http';

/**
 * The web transport must turn an opaque fetch failure into a message that names
 * the real cause (CORS) instead of surfacing "Failed to fetch" to the user.
 */
describe('httpJson (browser transport)', () => {
  const failingFetch = vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;

  it('wraps a fetch failure in a NetworkError naming CORS', async () => {
    await expect(
      httpJson('https://sync.example.com/api/sync/status', {}, failingFetch),
    ).rejects.toBeInstanceOf(NetworkError);

    await httpJson('https://sync.example.com/api/sync/status', {}, failingFetch).catch(
      (error: NetworkError) => {
        expect(error.message).toMatch(/could not reach/i);
        expect(error.hint).toMatch(/CORS/i);
        expect(error.hint).toMatch(/CORS_ORIGINS/);
      },
    );
  });

  it('returns status and parsed body on success', async () => {
    const okFetch = vi.fn(async () =>
      new Response(JSON.stringify({ latestSeq: 7 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const result = await httpJson('https://sync.example.com/api/sync/status', {}, okFetch);
    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.body).toEqual({ latestSeq: 7 });
  });

  it('keeps non-JSON bodies readable', async () => {
    const textFetch = vi.fn(async () => new Response('upstream timeout', { status: 504 })) as
      unknown as typeof fetch;

    const result = await httpJson('https://sync.example.com/api/sync/status', {}, textFetch);
    expect(result.status).toBe(504);
    expect(result.ok).toBe(false);
    expect(result.body).toBe('upstream timeout');
  });
});
