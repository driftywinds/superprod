import { describe, expect, it } from 'vitest';
import {
  IV_LENGTH,
  SALT_LENGTH,
  decryptPayload,
  encryptPayload,
  looksEncrypted,
} from '../src/sync/encryption';

/**
 * These run the real Argon2id parameters (64 MB, 3 iterations), so each
 * derivation costs ~0.5–2 s. Kept to two cases on purpose.
 */
describe('sync encryption', () => {
  it('round-trips a payload and uses the upstream wire layout', async () => {
    const plaintext = JSON.stringify({ title: 'encrypted task', nested: { n: 1 } });
    const wire = await encryptPayload(plaintext, 'correct horse battery staple');

    expect(looksEncrypted(wire)).toBe(true);
    expect(await decryptPayload(wire, 'correct horse battery staple')).toBe(plaintext);

    // base64( salt[16] || iv[12] || ciphertext+tag )
    const bytes = Buffer.from(wire, 'base64');
    expect(bytes.length).toBeGreaterThanOrEqual(SALT_LENGTH + IV_LENGTH + 16);
    expect(bytes.length).toBe(
      SALT_LENGTH + IV_LENGTH + new TextEncoder().encode(plaintext).length + 16,
    );
  }, 60_000);

  it('produces a different ciphertext each time (fresh IV)', async () => {
    const first = await encryptPayload('same', 'pw-same');
    const second = await encryptPayload('same', 'pw-same');
    expect(first).not.toBe(second);
    expect(await decryptPayload(first, 'pw-same')).toBe('same');
    expect(await decryptPayload(second, 'pw-same')).toBe('same');
  }, 120_000);

  it('rejects a payload too short to be valid', async () => {
    await expect(decryptPayload('AAAA', 'pw')).rejects.toThrow(/too short/i);
  });
});
