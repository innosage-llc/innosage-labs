import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceProfileIntents } from './VoiceProfileIntents.ts';

const stage = { workerURL: 'https://stage.test', accountScope: 'a'.repeat(64) };
const sample = { clipDigest: 'b'.repeat(64), nameDigest: 'c'.repeat(64), mime: 'audio/wav' };
const profile = 'vp_' + 's'.repeat(20);
function fixture() {
  const data = new Map();
  let seq = 0;
  const store = {
    getItemAsync: async key => data.get(key) ?? null,
    setItemAsync: async (key, value) => { data.set(key, value); },
  };
  return { store, data, journal: (scope = stage) => new VoiceProfileIntents(store, scope, () => 'fixture-key-' + ++seq) };
}

test('lost response restores exact upload and delete keys without storing raw names, paths, or audio', async () => {
  const f = fixture();
  const pending = f.journal();
  const e = await pending.beginEnrollment({...sample, displayName: 'private name', uri: '/private/path', audio: 'raw bytes'});
  const d = await pending.beginDelete(profile);
  const reopened = f.journal();
  assert.deepEqual(await reopened.restore(), {
    enrollment: {...sample, mutationKey: e}, deletions: [{profileId: profile, mutationKey: d}],
  });
  assert.doesNotMatch([...f.data.values()].join(''), /private name|private\/path|raw bytes/);
  assert.equal(await reopened.beginEnrollment(sample), e);
  assert.equal(await reopened.beginDelete(profile), d);
  await assert.rejects(reopened.beginEnrollment({...sample, nameDigest: 'd'.repeat(64)}), /verified first/);
  assert.equal(await reopened.finalizeEnrollment('another'), false);
  assert.equal(await reopened.finalizeDelete(profile, e), false);
  assert.equal(await reopened.finalizeDelete(profile, d), true);
  assert.equal(await reopened.finalizeEnrollment(e), true);
  assert.deepEqual(await f.journal().restore(), {deletions: []});
});

test('journals isolate accounts and worker environments; copied envelopes fail closed', async () => {
  const f = fixture();
  const account = f.journal({...stage, accountScope: '9'.repeat(64)});
  const production = f.journal({...stage, workerURL: 'https://prod.test'});
  const before = await f.journal().beginEnrollment(sample);
  assert.deepEqual(await account.restore(), {deletions: []});
  assert.deepEqual(await production.restore(), {deletions: []});
  const owned = [...f.data.values()][0];
  await account.beginDelete(profile);
  const accountKey = [...f.data.keys()][1];
  f.data.set(accountKey, owned);
  await assert.rejects(account.beginDelete(profile), /invalid/);
  assert.equal(f.data.get(accountKey), owned);
  assert.equal((await f.journal().restore()).enrollment.mutationKey, before);
});

test('read-modify-write serializes independent instances and does not publish keys before persistence', async () => {
  const f = fixture();
  const write = f.store.setItemAsync;
  let allow;
  const wait = new Promise(resolve => { allow = resolve; });
  f.store.setItemAsync = async (...args) => { await wait; return write(...args); };
  let obtained = false;
  const e = f.journal().beginEnrollment(sample).then(value => { obtained = true; return value; });
  const d = f.journal().beginDelete(profile);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(obtained, false);
  allow();
  const [enrollment, deletion] = await Promise.all([e, d]);
  const result = await f.journal().restore();
  assert.equal(result.enrollment.mutationKey, enrollment);
  assert.equal(result.deletions[0].mutationKey, deletion);
});

test('malformed or oversized state never gets replaced; storage failure blocks issuing a key', async () => {
  const f = fixture();
  f.store.setItemAsync = async () => { throw new Error('disk write failed'); };
  await assert.rejects(f.journal().beginEnrollment(sample), /disk write failed/);
  assert.deepEqual(await f.journal().restore(), {deletions: []});
  f.store.setItemAsync = async (key, value) => { f.data.set(key, value); };
  await f.journal().beginEnrollment(sample);
  const storageKey = [...f.data.keys()][0];
  for (const invalid of ['{oops', 'x'.repeat(2049), '{"enrollment":null,"deletions":[]}', '{}']) {
    f.data.set(storageKey, invalid);
    await assert.rejects(f.journal().restore(), /invalid/);
    await assert.rejects(f.journal().beginEnrollment(sample), /invalid/);
    assert.equal(f.data.get(storageKey), invalid);
  }
});

test('the atomic confirmed source record forbids extra, invalid or direct-equal metadata on recovery', async () => {
  const f = fixture();
  const confirmed = {operationId:'operation-a',sourceSha256:'f'.repeat(64),segmentId:'seg-1',
    speakerId:'SPEAKER_01', startMs:1000,endMs:3000};
  const k = await f.journal().beginEnrollment({...sample, confirmed});
  assert.deepEqual((await f.journal().restore()).enrollment.confirmed,confirmed);
  await assert.rejects(f.journal().beginEnrollment(sample), /verified first/);
  const [storageKey] = [...f.data.keys()];
  const snapshot = f.data.get(storageKey);
  for (const changes of [{sourceText:'private'}, {endMs:1500}, {sourceSha256:'A'.repeat(64)},
    {speakerId:'private-label'}, {segmentId:'a b'}]) {
    const modified = JSON.parse(snapshot);
    Object.assign(modified.enrollment.confirmed,changes);
    f.data.set(storageKey,JSON.stringify(modified));
    await assert.rejects(f.journal().restore(), /invalid/);
  }
  f.data.set(storageKey,snapshot);
  assert.equal(await f.journal().beginEnrollment({...sample,confirmed},k),k);
  assert.equal(await f.journal().finalizeEnrollment(k),true);
  await assert.rejects(f.journal().beginEnrollment({...sample,confirmed},k), /pending confirmed upload/);
});
