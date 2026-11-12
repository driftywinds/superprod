#!/usr/bin/env node
/**
 * Diagnoses a SuperSync server: auth, encryption mode, and whether this client
 * can upload an operation. Prints raw server responses — no secrets.
 *
 * Usage:
 *   SYNC_BASE_URL=https://… SYNC_TOKEN=… node tools/diagnose-sync.mjs
 *   … node tools/diagnose-sync.mjs --upload   (also attempts one probe upload)
 */

const baseUrl = process.env.SYNC_BASE_URL;
const token = process.env.SYNC_TOKEN;
const doUpload = process.argv.includes('--upload');

if (!baseUrl || !token) {
  console.error('Set SYNC_BASE_URL and SYNC_TOKEN');
  process.exit(1);
}

const root = baseUrl.replace(/\/+$/, '');
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

const j = (value) => JSON.stringify(value, null, 2);
const mask = (value) => (typeof value === 'string' && value.length > 12 ? `${value.slice(0, 6)}…` : value);

const call = async (path, init = {}) => {
  const response = await fetch(`${root}/api${path}`, { ...init, headers });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 500);
  }
  return { status: response.status, ok: response.ok, body };
};

console.log(`server: ${root}`);
console.log(`token:  ${mask(token)}\n`);

// 1. Auth + status
{
  const res = await call('/sync/status');
  console.log(`GET /sync/status -> ${res.status}`);
  console.log(j(res.body), '\n');
  if (!res.ok) {
    console.log('Auth failed. Nothing else can work until this passes.');
    process.exit(1);
  }
}

// 2. Are stored ops encrypted? That tells us whether the account is E2EE.
{
  const res = await call('/sync/ops?sinceSeq=0&limit=20');
  console.log(`GET /sync/ops -> ${res.status}`);
  if (res.ok && Array.isArray(res.body?.ops)) {
    const ops = res.body.ops;
    const encrypted = ops.filter((entry) => entry.op?.isPayloadEncrypted).length;
    console.log(`ops returned: ${ops.length}, encrypted: ${encrypted}`);
    for (const entry of ops.slice(0, 5)) {
      const op = entry.op ?? {};
      console.log(
        `  seq=${entry.serverSeq} type=${op.opType} entity=${op.entityType} encrypted=${op.isPayloadEncrypted ?? false} keys=${Object.keys(op).join(',')}`,
      );
    }
    console.log(
      encrypted > 0
        ? '\nACCOUNT IS END-TO-END ENCRYPTED: uploads must be sealed with the encryption password.'
        : '\nStored ops are plaintext: the account is not E2EE (or encryption was off when they were written).',
      '\n',
    );
  } else {
    console.log(j(res.body), '\n');
  }
}

// 3. Upload probe — the only way to learn whether writes are accepted.
// 3b. Decrypt a real stored operation — the definitive compatibility test.
const passwordArgIndex = process.argv.indexOf('--password');
const password = passwordArgIndex >= 0 ? process.argv[passwordArgIndex + 1] : process.env.SYNC_PASSWORD;

if (password) {
  const { argon2id } = await import('hash-wasm');
  const res = await call('/sync/ops?sinceSeq=0&limit=5');
  const encryptedOp = res.body?.ops?.find((entry) => entry.op?.isPayloadEncrypted);

  if (!encryptedOp) {
    console.log('No encrypted op found to test against.\n');
  } else {
    const bytes = Buffer.from(encryptedOp.op.payload, 'base64');
    const salt = bytes.subarray(0, 16);
    const iv = bytes.subarray(16, 28);
    const cipher = bytes.subarray(28);
    console.log(`Decrypting seq=${encryptedOp.serverSeq} (${encryptedOp.op.entityType})…`);

    try {
      const keyBytes = await argon2id({
        password,
        salt,
        hashLength: 32,
        parallelism: 1,
        iterations: 3,
        memorySize: 65536,
        outputType: 'binary',
      });
      const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
        'decrypt',
      ]);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
      const text = new TextDecoder().decode(plain);
      console.log('DECRYPTED OK. Plaintext preview:');
      console.log(text.slice(0, 600), '\n');
    } catch (error) {
      console.log(`DECRYPT FAILED: ${error?.message ?? error}`);
      console.log('Wrong password, or the account uses a different KDF.\n');
    }
  }
} else if (!doUpload) {
  console.log('Add --password <e2e password> to test decryption against real data.');
  console.log('Add --upload to test the write path.');
  process.exit(0);
}

const probe = {
  id: crypto.randomUUID(),
  clientId: 'probe_superprod',
  actionType: '[Probe] Connectivity check',
  opType: 'CRT',
  entityType: 'TASK',
  entityId: `probe-${Date.now()}`,
  payload: { probe: true },
  vectorClock: { probe_superprod: 1 },
  timestamp: Date.now(),
  schemaVersion: 1,
};

{
  const res = await call('/sync/ops', {
    method: 'POST',
    body: JSON.stringify({ ops: [probe], clientId: 'probe_superprod', lastKnownServerSeq: 0 }),
  });
  console.log(`POST /sync/ops -> ${res.status}`);
  console.log(j(res.body), '\n');

  const result = res.body?.results?.[0];
  if (result && !result.accepted) {
    console.log(`UPLOAD REJECTED: ${result.errorCode ?? '(no code)'} — ${result.error ?? ''}`);
  } else if (result?.accepted) {
    console.log(`Upload accepted at serverSeq ${result.serverSeq}. The write path works.`);
  }
}
