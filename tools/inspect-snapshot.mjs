#!/usr/bin/env node
/**
 * Decrypts the account's SYNC_IMPORT snapshot and reports its shape.
 * Read-only. Used to map upstream state into the superprod model.
 *
 *   SYNC_BASE_URL=… SYNC_TOKEN=… SYNC_PASSWORD=… node tools/inspect-snapshot.mjs [out.json]
 */
import { writeFileSync } from 'node:fs';
import { argon2id } from 'hash-wasm';

const baseUrl = process.env.SYNC_BASE_URL?.replace(/\/+$/, '');
const token = process.env.SYNC_TOKEN;
const password = process.env.SYNC_PASSWORD;

if (!baseUrl || !token || !password) {
  console.error('Set SYNC_BASE_URL, SYNC_TOKEN and SYNC_PASSWORD');
  process.exit(1);
}

const res = await fetch(`${baseUrl}/api/sync/ops?sinceSeq=0&limit=200`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
});
const body = await res.json();
const encryptedOps = (body.ops ?? []).filter((entry) => entry.op?.isPayloadEncrypted);
const snapshotOp = encryptedOps.find((entry) => entry.op.entityType === 'ALL') ?? encryptedOps[0];

if (!snapshotOp) {
  console.log('No encrypted operations found.');
  process.exit(1);
}

const bytes = Buffer.from(snapshotOp.op.payload, 'base64');
const keyBytes = await argon2id({
  password,
  salt: bytes.subarray(0, 16),
  hashLength: 32,
  parallelism: 1,
  iterations: 3,
  memorySize: 65536,
  outputType: 'binary',
});
const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
const plain = await crypto.subtle.decrypt(
  { name: 'AES-GCM', iv: bytes.subarray(16, 28) },
  key,
  bytes.subarray(28),
);
const text = new TextDecoder().decode(plain);
const state = JSON.parse(text);

console.log(`snapshot seq=${snapshotOp.serverSeq} entity=${snapshotOp.op.entityType}`);
console.log(`top-level keys: ${Object.keys(state).join(', ')}`);

const describe = (value) => {
  if (value === null || typeof value !== 'object') return typeof value;
  if (Array.isArray(value)) return `array(${value.length})`;
  const keys = Object.keys(value);
  if (keys.includes('ids') && keys.includes('entities')) {
    return `entityState(${value.ids.length}) entityKeys=${Object.keys(value.entities ?? {}).length}`;
  }
  return `object{${keys.slice(0, 12).join(',')}${keys.length > 12 ? ',…' : ''}}`;
};

for (const [key, value] of Object.entries(state)) {
  console.log(`  ${key}: ${describe(value)}`);
}

const sampleTask = state.task?.entities?.[state.task.ids?.[0]];
if (sampleTask) {
  console.log('\nsample task fields:', Object.keys(sampleTask).join(', '));
  console.log('sample task:', JSON.stringify(sampleTask, null, 2).slice(0, 1200));
}

const sampleProject = state.project?.entities?.[state.project.ids?.[0]];
if (sampleProject) console.log('\nsample project:', JSON.stringify(sampleProject, null, 2).slice(0, 600));

const out = process.argv[2];
if (out) {
  writeFileSync(out, JSON.stringify(state, null, 2), 'utf8');
  console.log(`\nwrote ${out}`);
}
