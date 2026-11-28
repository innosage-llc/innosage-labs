import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createGatewayGuests, provisionedGuestToken, freeRecordingLimit, readFreeOperation } from './GatewayGuest.ts';

const require = createRequire(import.meta.url);
const configureApp = require('./app.config.js');
const approved = require('./recorder-free-targets.json');
const staging = 'https://staging.example.test/recorder';
const production = 'https://production.example.test/recorder';
const id = '113e4567-e89b-42d3-a456-426614174000';
const oldToken = 'legacy-token'.repeat(4);
const fingerprint = async token => createHash('sha256').update(token).digest('hex');

function fixture(targets = { staging, production }) {
  const calls = [];
  const storage = new Map();
  const guests = createGatewayGuests({
    targets, fingerprint,
    store: {
      getItemAsync: async key => storage.get(key) ?? null,
      setItemAsync: async (key, value) => { storage.set(key, value); },
    },
    provision: async url => {
      calls.push(url);
      return `synthetic-token-${new URL(url).hostname}`;
    },
  });
  return { ...guests, calls, storage };
}

test('distinct environments provision once each even with overlapping requests', async () => {
  const { connect, calls, storage } = fixture();
  const a = connect('staging');
  const b = connect('production');
  assert.equal(a, connect('staging'));
  assert.equal(b, connect('production'));
  const [staged, prod] = await Promise.all([a, b]);
  assert.notEqual(staged.accountScope, prod.accountScope);
  assert.deepEqual(calls.sort(), [production, staging]);
  assert.equal((await connect('staging')).accountScope, staged.accountScope);
  assert.equal(storage.size, 2);
  assert.equal(calls.length, 2);
});

test('legacy UUID and two JSON shapes recover only against their approved Staging identity', async () => {
  const { restore, connect, calls, storage } = fixture();
  const legacy = readFreeOperation(id);
  assert.deepEqual(legacy, { lane: 'free', service: 'staging', id, identifySpeakers: false });
  for (const shape of [{ id, identifySpeakers: true }, { id, identifySpeakers: true, lane: 'free', service: 'staging' }]) {
    assert.deepEqual(readFreeOperation(shape), { ...legacy, identifySpeakers: true });
  }
  await assert.rejects(restore(legacy), /original operation/);
  storage.set('recorder.gateway', JSON.stringify({ url: production, token: oldToken }));
  await assert.rejects(restore(legacy), /original operation/);
  storage.set('recorder.gateway', JSON.stringify({ url: 'https://unverified.example.test', token: oldToken }));
  await assert.rejects(restore(legacy), /original operation/);
  const existing = JSON.stringify({ url: `${staging}/`, token: oldToken });
  storage.set('recorder.gateway', existing);
  assert.equal((await restore(legacy)).url, staging);
  assert.equal((await connect('staging')).token, oldToken);
  assert.deepEqual(calls, []);
  assert.equal(storage.get('recorder.gateway'), existing);
});

test('bound recovery refuses missing, changed, and wrong-environment credentials without provisioning', async () => {
  const { connect, restore, calls, storage } = fixture();
  const guest = await connect('staging');
  const operation = readFreeOperation({ lane: 'free', service: 'staging', id, identifySpeakers: true, accountScope: guest.accountScope });
  assert.deepEqual(await restore(operation), guest);
  await assert.rejects(restore({ ...operation, service: 'production' }), /original operation/);
  await assert.rejects(restore({ ...operation, accountScope: 'a'.repeat(64) }), /original operation/);
  storage.set('recorder.gateway.production', storage.get('recorder.gateway.staging'));
  await assert.rejects(connect('production'), /different service/);
  await assert.rejects(restore({ ...operation, service: 'production' }), /different service/);
  assert.deepEqual(calls, [staging]);
  assert.throws(() => readFreeOperation({ ...operation, id: '../unknown' }));
  assert.throws(() => readFreeOperation({ lane: 'free', service: 'production', id, identifySpeakers: false }));
});

test('unconfigured services fail closed and a staging release rejects invalid build inputs', async () => {
  const { connect, restore, calls } = fixture({});
  await assert.rejects(connect('staging'), /unavailable/);
  await assert.rejects(restore(readFreeOperation(id)), /unavailable/);
  assert.deepEqual(calls, []);

  const stagingFlag = 'RECORDER_STAGING_ANDROID_RELEASE';
  const parityFlag = 'RECORDER_PARITY_ANDROID_RELEASE';
  const stagingInput = 'EXPO_PUBLIC_RECORDER_GATEWAY_URL';
  const productionInput = 'EXPO_PUBLIC_RECORDER_PRODUCTION_GATEWAY_URL';
  const iosFlag = 'RECORDER_STAGING_IOS_INTERNAL';
  const variables = [stagingFlag, parityFlag, iosFlag, stagingInput, productionInput];
  const prior = variables.map(variable => process.env[variable]);
  const config = { name: 'Recorder' };
  try {
    for (const variable of variables) delete process.env[variable];
    assert.equal(configureApp({ config }), config);
    const profileEnv = createRequire(import.meta.url)('./eas.json').build.testflight.env;
    assert.equal(profileEnv[iosFlag], '1');
    assert.equal(profileEnv[stagingInput], approved.staging);
    process.env[iosFlag] = profileEnv[iosFlag];
    assert.throws(() => configureApp({ config }), /approved Staging Free gateway/);
    process.env[stagingInput] = approved.staging;
    assert.equal(configureApp({ config }), config);
    process.env[productionInput] = approved.production;
    assert.throws(() => configureApp({ config }), /exclude the Production Free gateway/);
    delete process.env[iosFlag];
    delete process.env[stagingInput];
    delete process.env[productionInput];
    process.env[stagingFlag] = '1';
    assert.throws(() => configureApp({ config }), /approved Staging Free gateway/);
    process.env[stagingInput] = production;
    assert.throws(() => configureApp({ config }), /approved Staging Free gateway/);
    process.env[stagingInput] = approved.staging;
    assert.equal(configureApp({ config }), config);
    process.env[productionInput] = approved.production;
    assert.throws(() => configureApp({ config }), /must exclude the Production Free gateway/);
    delete process.env[stagingFlag];
    process.env[parityFlag] = '1';
    assert.equal(configureApp({ config }), config);
    delete process.env[productionInput];
    assert.throws(() => configureApp({ config }), /approved Production Free gateway/);
    process.env[productionInput] = approved.staging;
    assert.throws(() => configureApp({ config }), /approved Production Free gateway/);
    process.env[stagingInput] = approved.production;
    assert.throws(() => configureApp({ config }), /approved Staging Free gateway/);
  } finally {
    for (const [index, variable] of variables.entries()) {
      if (prior[index] === undefined) delete process.env[variable];
      else process.env[variable] = prior[index];
    }
  }
});

test('the same Free limits apply with exact inclusive decimal byte and duration boundaries', () => {
  assert.equal(freeRecordingLimit(50_000_000, 900_000), undefined);
  assert.match(freeRecordingLimit(50_000_001), /50 MB/);
  assert.match(freeRecordingLimit(50_000_000, 900_001), /15 minutes/);
  assert.match(freeRecordingLimit(0), /empty/);
  for (const duration of [undefined, 0, -1, NaN, Infinity]) {
    assert.match(freeRecordingLimit(1, duration), /Could not verify the recording duration/);
  }
});


test('Production provisioning requires an explicit matching environment', () => {
  const token = 'x'.repeat(43);
  assert.equal(provisionedGuestToken({ token }, 'staging'), token);
  assert.equal(provisionedGuestToken({ token }, 'production'), undefined);
  assert.equal(provisionedGuestToken({ token, environment: 'staging' }, 'production'), undefined);
  assert.equal(provisionedGuestToken({ token, environment: 'production' }, 'staging'), undefined);
  assert.equal(provisionedGuestToken({ token, environment: 'production' }, 'production'), token);
});
