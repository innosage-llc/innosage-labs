import test from 'node:test';
import assert from 'node:assert/strict';
import { ProServiceError } from './ProClient.ts';
import { freeRecordingLimit, readFreeOperation } from './GatewayGuest.ts';
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

test('status reads retain authorization guidance and treat speaker denial as terminal', async () => {
  // Exercise the real component handlers without mounting native React views.
  const component = await readFile(new URL('./Transcript.tsx', import.meta.url), 'utf8');
  const manual = component.slice(component.indexOf('async function checkOperationStatus() {'), component.indexOf('\n  async function submit() {'));
  const poll = component.slice(component.indexOf('async function poll() {'), component.indexOf('\n    void poll();'));
  const cases = [
    new ProServiceError('Pro authorization is unavailable or expired. Check your API key.', 'authorization'),
    new ProServiceError('Speaker identification is unavailable.', 'speaker_unavailable'),
  ];
  for (const denied of cases) {
    const state = { busy: false, message: '', unknown: false, job: undefined };
    const dependencies = {
      freeOperation: undefined, paidOperation: { id: 'synthetic-operation' },
      busy: false, submission: { current: null },
      request: async () => { throw denied; }, pending: new Set(),
      setBusy: value => { state.busy = value; },
      setMessage: value => { state.message = value; },
      setStatusUnknown: value => { state.unknown = value; },
      setJob: value => { state.job = value; },
      readOperationWithDeadline, statusRecoveryMessage,
      speakerUnavailable: error => error.code === 'speaker_unavailable',
      controller: new AbortController(),
    };
    const bind = source => new Function(...Object.keys(dependencies), 'return (' + stripTypeScriptTypes(source) + ')')(...Object.values(dependencies));
    await bind(manual)();
    assert.equal(state.busy, false);
    assert.equal(state.message, denied.message);
    await bind(poll)();
    assert.equal(state.message, denied.message);
    assert.equal(state.unknown, denied.code === 'authorization');
    assert.deepEqual(state.job, denied.code === 'speaker_unavailable' ? { state: 'FAILED' } : undefined);
  }
});

test('opening Transcript reads local state and does not activate a guest', async () => {
  const component = await readFile(new URL('./Transcript.tsx', import.meta.url), 'utf8');
  const body = component.slice(component.indexOf('async function restore() {'), component.indexOf('\n    void restore().catch'));
  const legacyId = '113e4567-e89b-42d3-a456-426614174000';
  const denied = { lane: 'pro', id: 'synthetic-pro-operation', workerURL: 'https://worker.test', authorizationDeniedBeforeUpload: true };
  for (const saved of [null, legacyId, JSON.stringify(denied)]) {
    const services = [];
    const restored = {};
    const dependencies = {
      active: true, committedResult: async () => undefined, operationKey: 'synthetic-operation-key',
      SecureStore: { getItemAsync: async () => saved }, readFreeOperation,
      selectedService: async () => 'production',
      serviceForWorker: url => { assert.equal(url, denied.workerURL); return 'staging'; },
      clientForService: () => ({ profile: async () => undefined }), supportsProUpload: true,
      setService: service => services.push(service),
      setIdentifySpeakers() {}, setOperation() {}, setPaidOperation() {}, setFreeOperation() {},
      setUsePro() {}, setProAvailable() {}, setServiceReady() {},
      setJob: job => { restored.job = job; },
      setProDenied: value => { restored.proDenied = value; },
      setMessage() {},
    };
    const restore = new Function(...Object.keys(dependencies), 'return (' + stripTypeScriptTypes(body) + ')')(...Object.values(dependencies));
    await restore();
    assert.deepEqual(services, [saved ? 'staging' : 'production']);
    assert.deepEqual(restored, saved?.startsWith('{') ? { job: { state: 'FAILED' }, proDenied: true } : {});
  }
});

test('Free submission checks known limits and binds access before upload', async () => {
  const component = await readFile(new URL('./Transcript.tsx', import.meta.url), 'utf8');
  const body = component.slice(component.indexOf('async function submit() {'), component.indexOf('\n  async function save() {'));
  const run = async ({ service, state, resumed, size = 50_000_000, duration = 900_000, available = true }) => {
    const events = [];
    const operationId = 'original-operation';
    const guest = { service, accountScope: 'a'.repeat(64) };
    const prior = { lane: 'free', id: operationId, identifySpeakers: true, ...guest };
    const dependencies = {
      service, connecting: false, supportsProUpload: true, usePro: false, serviceReady: true,
      submission: { current: null }, busy: false, isOpenAI: false, statusUnknown: false,
      operation: resumed ? operationId : undefined, freeOperation: resumed ? prior : undefined,
      paidOperation: undefined, job: state ? { state } : undefined, identifySpeakers: false,
      committedResult: async () => undefined, recording: { size },
      terminal: new Set(['FAILED', 'CANCELLED', 'CLEANED', 'EXPIRED']),
      gatewayAvailable: id => id === service && available, freeRecordingLimit,
      recordingDurationMillis: async () => duration,
      connectGateway: async id => { assert.equal(id, service); events.push('guest'); return guest; },
      restoreGateway: async existing => { assert.deepEqual(existing, prior); events.push('restore'); return guest; },
      randomUUID: () => 'new-operation', operationKey: 'synthetic-operation-key',
      SecureStore: { setItemAsync: async (_key, value) => { events.push(['save', JSON.parse(value)]); } },
      request: async (operation, upload) => { assert.equal(upload, true); events.push(['upload', operation]); },
      setBusy() {}, setOperation() {}, setFreeOperation() {}, setPaidOperation() {}, setJob() {}, setStatusUnknown() {},
      setMessage: message => { if (message) events.push(message); },
      KnownServiceFailure, ProServiceError, speakerUnavailable: () => false,
    };
    const submit = new Function(...Object.keys(dependencies), 'return (' + stripTypeScriptTypes(body) + ')')(...Object.values(dependencies));
    await submit();
    return { events, prior, guest };
  };
  for (const service of ['staging', 'production']) {
    for (const state of [undefined, 'UPLOADING', 'QUEUED', 'COMPLETED']) {
      assert.deepEqual((await run({ service, state, resumed: true })).events, []);
    }
    assert.deepEqual((await run({ service, size: 50_000_001 })).events, ['This recording is larger than the Free limit of 50 MB.']);
    assert.deepEqual((await run({ service, duration: 900_001 })).events, ['This recording is longer than the Free limit of 15 minutes.']);
    assert.deepEqual((await run({ service, available: false })).events, ['Free transcription is unavailable for this environment in this build.']);
    const fresh = await run({ service });
    const freshOperation = { lane: 'free', id: 'new-operation', identifySpeakers: false, ...fresh.guest };
    assert.deepEqual(fresh.events, ['guest', ['save', freshOperation], ['upload', freshOperation]]);
    const retry = await run({ service, state: 'RESERVED', resumed: true });
    assert.deepEqual(retry.events, ['restore', ['save', retry.prior], ['upload', retry.prior]]);
  }
});
