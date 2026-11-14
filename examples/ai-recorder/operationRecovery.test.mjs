import test from 'node:test';
import assert from 'node:assert/strict';
import { ProServiceError } from './ProClient.ts';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
// Resolve the app's extensionless import for Node without changing Expo/Metro settings.
const source = (await readFile(new URL('./operationRecovery.ts', import.meta.url), 'utf8'))
  .replace("'./ProClient'", JSON.stringify(new URL('./ProClient.ts', import.meta.url).href));
const { KnownServiceFailure, readOperationWithDeadline, statusRecoveryMessage } = await import(
  'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);

test('a stalled status read aborts at its deadline so the UI can release busy/Back', async () => {
  // Keep the loop alive: AbortSignal.timeout itself uses an unref'ed timer in Node.
  const keepAlive = setTimeout(() => {}, 1000);
  const owner = new AbortController();
  try {
    await assert.rejects(readOperationWithDeadline(signal => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }), owner.signal, 5), { name: 'TimeoutError' });
    assert.equal(owner.signal.aborted, false);
  } finally { clearTimeout(keepAlive); }
});

test('owner cancellation aborts the same status read', async () => {
  const owner = new AbortController();
  const pending = readOperationWithDeadline(signal => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }), owner.signal);
  owner.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('known access/service failures retain actionable messages; connection failures keep status uncertain', () => {
  const denied = new ProServiceError('Pro authorization is unavailable or expired. Check your API key.', 'authorization');
  assert.equal(statusRecoveryMessage(denied), denied.message);
  assert.equal(statusRecoveryMessage(new KnownServiceFailure('This recording exceeds the Free upload limit.')), 'This recording exceeds the Free upload limit.');
  assert.match(statusRecoveryMessage(new TypeError('Network request failed')), /status is still unknown/);
  assert.doesNotMatch(statusRecoveryMessage(denied), /offline/);
});

test('a completed same-operation read returns its result without cancelling its owner', async () => {
  const owner = new AbortController();
  const result = { state: 'COMPLETED', transcript: 'Synthetic fixture' };
  let reads = 0;
  assert.equal(await readOperationWithDeadline(async signal => { reads++; assert.equal(signal.aborted, false); return result; }, owner.signal), result);
  assert.equal(reads, 1);
  assert.equal(owner.signal.aborted, false);
});
