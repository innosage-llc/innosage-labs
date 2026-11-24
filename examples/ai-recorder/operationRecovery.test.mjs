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
  const planEligibility = component.match(/const canChangeInnoSagePlan = ([^;]+);/)[1];
  const canChangePlan = new Function('canUseFree', 'canChooseSpeakers', 'proAvailable', 'proDenied', `return ${planEligibility};`);
  const legacyId = '113e4567-e89b-42d3-a456-426614174000';
  const denied = { lane: 'pro', id: 'synthetic-pro-operation', workerURL: 'https://worker.test', authorizationDeniedBeforeUpload: true };
  for (const saved of [null, legacyId, JSON.stringify(denied)]) {
    const services = [];
    const restored = {};
    let hasProProfile;
    const dependencies = {
      active: true, committedResult: async () => undefined, operationKey: 'synthetic-operation-key',
      SecureStore: { getItemAsync: async () => saved }, readFreeOperation,
      selectedService: async () => 'production',
      serviceForWorker: url => { assert.equal(url, denied.workerURL); return 'staging'; },
      clientForService: () => ({ profile: async () => undefined }), supportsProUpload: true,
      setService: service => services.push(service),
      setIdentifySpeakers() {}, setOperation() {}, setPaidOperation() {}, setFreeOperation() {},
      setUsePro() {}, setProAvailable: value => { hasProProfile = value; }, setServiceReady() {},
      setJob: job => { restored.job = job; },
      setProDenied: value => { restored.proDenied = value; },
      setMessage() {},
    };
    const restore = new Function(...Object.keys(dependencies), 'return (' + stripTypeScriptTypes(body) + ')')(...Object.values(dependencies));
    await restore();
    assert.deepEqual(services, [saved ? 'staging' : 'production']);
    const deniedBeforeTransfer = saved?.startsWith('{') === true;
    assert.deepEqual(restored, deniedBeforeTransfer ? { job: { state: 'FAILED' }, proDenied: true } : {});
    assert.equal(hasProProfile, false);
    assert.equal(canChangePlan(true, true, hasProProfile, restored.proDenied === true), deniedBeforeTransfer);
    assert.equal(canChangePlan(false, true, hasProProfile, restored.proDenied === true), false);
    assert.equal(canChangePlan(true, false, hasProProfile, restored.proDenied === true), false);
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

test('Pro denial offers Free only before transfer on a fresh attempt', async () => {
  const component = await readFile(new URL('./Transcript.tsx', import.meta.url), 'utf8');
  const body = stripTypeScriptTypes(component.slice(component.indexOf('async function submit() {'), component.indexOf('\n  async function save() {')));
  const denied = new ProServiceError('Pro authorization is unavailable.', 'authorization');
  const cases = [
    { stage: 'identity' },
    { stage: 'identity', previous: 'FAILED' },
    { stage: 'missing-profile', previous: 'FAILED' },
    { stage: 'before-transfer' },
    { stage: 'after-transfer' },
    { stage: 'before-transfer', previous: 'RESERVED' },
  ];
  for (const { stage, previous } of cases) {
    const saved = [];
    let proDenied = stage === 'missing-profile';
    let statusUnknown;
    let job = previous ? { state: previous } : undefined;
    let message;
    const prior = previous ? { lane: 'pro', id: 'original-operation' } : undefined;
    const dependencies = {
      connecting: false, supportsProUpload: true, usePro: true, serviceReady: true,
      submission: { current: null }, busy: false, isOpenAI: false, statusUnknown: false,
      operation: prior?.id, paidOperation: prior, job, identifySpeakers: false,
      canOfferVoiceProfiles: false, matchVoiceProfiles: false, setMatchVoiceProfiles() {},
      committedResult: async () => undefined, recording: { size: 1234 },
      terminal: new Set(['FAILED', 'CANCELLED', 'CLEANED', 'EXPIRED']),
      proClient: {
        workerURL: 'https://worker.test',
        profile: async () => stage === 'missing-profile' ? undefined : { key: 'synthetic' },
        identity: async () => { if (stage === 'identity') throw denied; return 'a'.repeat(64); },
      },
      randomUUID: () => 'new-operation', operationKey: 'synthetic-operation-key',
      SecureStore: { setItemAsync: async (_key, value) => { saved.push(JSON.parse(value)); } },
      request: async (_free, upload, _signal, paid, onTransfer) => {
        assert.equal(upload, true);
        assert.equal(paid.id, saved.at(-1).id);
        if (stage === 'after-transfer') onTransfer();
        throw denied;
      },
      setBusy() {}, setOperation() {}, setFreeOperation() {}, setPaidOperation() {},
      setJob: value => { job = value; },
      setProDenied: value => { proDenied = value; },
      setStatusUnknown: value => { statusUnknown = value; },
      setMessage: value => { message = value; },
      KnownServiceFailure, ProServiceError, speakerUnavailable: () => false,
    };
    const submit = new Function(...Object.keys(dependencies), 'return (' + body + ')')(...Object.values(dependencies));
    await submit();
    if (stage === 'identity') {
      assert.equal(proDenied, true);
      assert.equal(statusUnknown, false);
      assert.equal(saved.length, 0);
      assert.equal(job?.state, previous);
    } else if (stage === 'missing-profile') {
      assert.equal(proDenied, true);
      assert.equal(statusUnknown, false);
      assert.equal(saved.length, 0);
      assert.equal(job?.state, 'FAILED');
      assert.match(message, /Configure your InnoSage Pro API key/);
    } else if (!previous && stage === 'before-transfer') {
      assert.equal(proDenied, true);
      assert.equal(statusUnknown, false);
      assert.equal(saved.length, 2);
      assert.deepEqual(saved[1], { ...saved[0], authorizationDeniedBeforeUpload: true });
      assert.equal(job?.state, 'FAILED');
    } else {
      assert.equal(proDenied, false);
      assert.equal(statusUnknown, true);
      assert.equal(saved.length, 1);
      assert.equal(saved[0].authorizationDeniedBeforeUpload, undefined);
      if (previous) assert.equal(saved[0].id, prior.id);
      assert.match(message, /check the same operation before retrying/);
    }
  }
});
