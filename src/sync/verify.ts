import { SuperSyncClient } from './client';
import { decryptPayload } from './encryption';

/**
 * Proves an encryption password before it is saved.
 *
 * Downloads a few operations and attempts to decrypt the first encrypted one.
 * A wrong password fails AES-GCM authentication, so this is a real check, not
 * a length heuristic. An account with no encrypted operations cannot be
 * verified — that is reported as `no-data` rather than a success.
 */

export interface VerifyResult {
  ok: boolean;
  outcome: 'ok' | 'wrong-password' | 'no-data' | 'network' | 'not-encrypted';
  message: string;
}

export const verifyEncryptionPassword = async (options: {
  baseUrl: string;
  token: string;
  password: string;
}): Promise<VerifyResult> => {
  if (!options.password) {
    return { ok: false, outcome: 'wrong-password', message: 'Enter an encryption password.' };
  }

  try {
    const client = new SuperSyncClient({ baseUrl: options.baseUrl, token: options.token });
    const page = await client.downloadOps(0, { limit: 20 });
    const encrypted = page.ops.find((entry) => entry.op.isPayloadEncrypted);

    if (!encrypted) {
      return {
        ok: true,
        outcome: 'no-data',
        message:
          'Connected. This account has no encrypted data yet, so the password could not be verified — it will be used for everything uploaded from now on.',
      };
    }

    try {
      const plaintext = await decryptPayload(
        encrypted.op.payload as string,
        options.password,
      );
      JSON.parse(plaintext);
      return {
        ok: true,
        outcome: 'ok',
        message: `Verified against ${page.ops.length} remote operation(s).`,
      };
    } catch {
      return {
        ok: false,
        outcome: 'wrong-password',
        message:
          'That password does not decrypt this account. Use the SuperSync encryption password set in the desktop app.',
      };
    }
  } catch (error) {
    return {
      ok: false,
      outcome: 'network',
      message: `Could not reach the server: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
};
