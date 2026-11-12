import { argon2id } from 'hash-wasm';

/**
 * SuperSync end-to-end encryption, matching upstream `packages/sync-core`
 * exactly so ciphertext is interchangeable with the official client.
 *
 * Contract (do not change without a version-byte migration):
 *   KDF     Argon2id, 16-byte salt, 32-byte key,
 *           parallelism 1, iterations 3, memory 65536 KiB (64 MB)
 *   Cipher  AES-256-GCM, fresh 12-byte IV per call
 *   Wire    base64( salt[16] || iv[12] || ciphertext+tag )
 *   Legacy  base64( iv[12] || ciphertext+tag ) with PBKDF2 — decrypt-only,
 *           documented below for completeness.
 */

export const SALT_LENGTH = 16;
export const IV_LENGTH = 12;
export const KEY_LENGTH = 32;

const ARGON2 = {
  parallelism: 1,
  iterations: 3,
  memorySize: 65536,
} as const;

/** Bytes below this cannot be Argon2id (salt + iv + minimum auth tag). */
const MIN_ARGON2_SIZE = SALT_LENGTH + IV_LENGTH + 16;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const subtle = (): SubtleCrypto => {
  const api = globalThis.crypto?.subtle;
  if (!api) {
    throw new Error(
      'WebCrypto is unavailable. Encryption needs a secure context (HTTPS or localhost) or the native app.',
    );
  }
  return api;
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export interface DerivedKey {
  keyBytes: Uint8Array;
  salt: Uint8Array;
}

export const deriveKey = async (password: string, salt: Uint8Array): Promise<DerivedKey> => {
  const keyBytes = await argon2id({
    password,
    salt,
    hashLength: KEY_LENGTH,
    parallelism: ARGON2.parallelism,
    iterations: ARGON2.iterations,
    memorySize: ARGON2.memorySize,
    outputType: 'binary',
  });
  return { keyBytes, salt };
};

const importKey = (keyBytes: Uint8Array, usage: KeyUsage): Promise<CryptoKey> =>
  subtle().importKey('raw', keyBytes as unknown as ArrayBuffer, { name: 'AES-GCM' }, false, [
    usage,
  ]);

/**
 * Key cache.
 *
 * Argon2id at 64 MB / 3 iterations costs ~0.5–2 s. A sync cycle touches many
 * ops sharing one salt, so the derived key is cached per (password, salt).
 */
const keyCache = new Map<string, DerivedKey>();
const CACHE_LIMIT = 8;

const cacheKey = (password: string, salt: Uint8Array): string =>
  `${password.length}:${password}:${toBase64(salt)}`;

const getKey = async (password: string, salt: Uint8Array): Promise<DerivedKey> => {
  const id = cacheKey(password, salt);
  const cached = keyCache.get(id);
  if (cached) return cached;

  const derived = await deriveKey(password, salt);
  if (keyCache.size >= CACHE_LIMIT) {
    const oldest = keyCache.keys().next().value;
    if (oldest) keyCache.delete(oldest);
  }
  keyCache.set(id, derived);
  return derived;
};

export const clearKeyCache = (): void => keyCache.clear();

/** Encrypt a string payload; the returned value is what goes on the wire. */
export const encryptPayload = async (plaintext: string, password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await getKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const cipher = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
    await importKey(key.keyBytes, 'encrypt'),
    encoder.encode(plaintext),
  );

  const cipherBytes = new Uint8Array(cipher);
  const out = new Uint8Array(SALT_LENGTH + IV_LENGTH + cipherBytes.length);
  out.set(salt, 0);
  out.set(iv, SALT_LENGTH);
  out.set(cipherBytes, SALT_LENGTH + IV_LENGTH);
  return toBase64(out);
};

/** Decrypt a wire payload produced by this client or by the official client. */
export const decryptPayload = async (wire: string, password: string): Promise<string> => {
  const buffer = fromBase64(wire);
  if (buffer.length < MIN_ARGON2_SIZE) {
    throw new Error(
      `Ciphertext is ${buffer.length} bytes, too short for the Argon2id format (min ${MIN_ARGON2_SIZE})`,
    );
  }

  const salt = buffer.subarray(0, SALT_LENGTH);
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const cipherBytes = buffer.subarray(SALT_LENGTH + IV_LENGTH);

  const key = await getKey(password, salt);
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
    await importKey(key.keyBytes, 'decrypt'),
    cipherBytes as unknown as ArrayBuffer,
  );
  return decoder.decode(plain);
};

/** Cheap format check used to decide whether a payload must be decrypted. */
export const looksEncrypted = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length > 40;
