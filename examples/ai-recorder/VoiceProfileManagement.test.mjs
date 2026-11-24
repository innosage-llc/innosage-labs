import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { VoiceProfileIntents } from './VoiceProfileIntents.ts';
import { voiceProfileManagement } from './VoiceProfileManagement.ts';

const workerURL = 'https://worker.test';
const scope = { workerURL, accountScope: 'a'.repeat(64) };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const audio = { bytes: Uint8Array.from([17, 18, 19]), mimeType: 'audio/wav' };
const profileId = 'vp_' + 'p'.repeat(24);
const profile = { profileId, displayName: 'Example', revision: 1, status: 'active' };
const enrollment = { audio, displayName: 'Example', participantConfirmed: true };

function fixture() {
  let persisted;
  const store = {
    getItemAsync: async () => persisted ?? null,
    setItemAsync: async (_, value) => { persisted = value; },
  };
  const journal = () => new VoiceProfileIntents(store, scope, randomUUID);
  const calls = { enroll: [], delete: [] };
  const client = {
    async listVoiceProfiles() { return []; },
    async enrollVoiceProfile(input) {
      assert.equal((await journal().restore()).enrollment.mutationKey, input.mutationKey);
      assert.equal(input.workerURL, scope.workerURL);
      assert.equal(input.accountScope, scope.accountScope);
      calls.enroll.push(input.mutationKey);
      if (calls.enroll.length === 1) throw new Error('response lost');
      return profile;
    },
    async deleteVoiceProfile(targetScope, id, key) {
      assert.deepEqual(targetScope, scope);
      assert.deepEqual((await journal().restore()).deletions, [{ profileId: id, mutationKey: key }]);
      calls.delete.push(key);
      return calls.delete.length === 1 ? 'pending' : 'deleted';
    },
  };
  const open = () => voiceProfileManagement(client, scope, journal(), digest);
  return { calls, client, open, read: () => persisted };
}

test('enrollment persists before send and only resends the exact original after restart', async () => {
  const f = fixture();
  await assert.rejects(f.open().enroll({ ...enrollment, participantConfirmed:false }));
  assert.equal(f.read(), undefined);
  await assert.rejects(f.open().enroll(enrollment), /response lost/);
  assert.equal((await f.open().restore()).pendingEnrollment, true);
  assert.doesNotMatch(f.read(), /Example|filename|file:|\[17,18,19\]/);
  assert.deepEqual(await f.open().list(), []);
  assert.equal((await f.open().restore()).pendingEnrollment, true);
  await assert.rejects(f.open().enroll({ ...enrollment, displayName:'Different' }), /verified first/);
  assert.equal(f.calls.enroll.length, 1);
  assert.deepEqual(await f.open().enroll(enrollment), profile);
  assert.equal(f.calls.enroll[0], f.calls.enroll[1]);
  assert.equal((await f.open().restore()).pendingEnrollment, false);
});

test('deletion stays pending after blank list or restart and clears only after exact receipt', async () => {
  const f = fixture();
  assert.equal(await f.open().delete(profileId), 'pending');
  assert.deepEqual(await f.open().restore(), { pendingEnrollment:false, pendingDeletes:[profileId] });
  assert.deepEqual(await f.open().list(), []);
  assert.equal(await f.open().delete(profileId), 'deleted');
  assert.equal(f.calls.delete[0], f.calls.delete[1]);
  assert.deepEqual((await f.open().restore()).pendingDeletes, []);
});

test('only a definite sample refusal releases the same enrollment intent', async () => {
  const f = fixture();
  f.client.enrollVoiceProfile = async () => { throw Object.assign(new Error('Sample did not qualify'), { code:'voice_sample_rejected' }); };
  await assert.rejects(f.open().enroll(enrollment), /qualify/);
  assert.equal((await f.open().restore()).pendingEnrollment, false);
  f.client.enrollVoiceProfile = async () => { throw Object.assign(new Error('Could not verify'), { code:'voice_unavailable' }); };
  await assert.rejects(f.open().enroll(enrollment), /verify/);
  assert.equal((await f.open().restore()).pendingEnrollment, true);
});

test('caller mutation during the journal write cannot alter hashed or uploaded audio', async () => {
  const bytes = Uint8Array.of(3, 5, 7);
  const original = bytes.slice();
  let unblock;
  const release = new Promise(resolve => { unblock = resolve; });
  const journal = {
    async beginEnrollment(input) {
      assert.equal(input.clipDigest, digest(original));
      await release;
      return 'synthetic-enrollment-id';
    },
    async finalizeEnrollment() { return true; },
  };
  const client = {
    async enrollVoiceProfile({ audio }) {
      assert.notEqual(audio.bytes, bytes);
      assert.deepEqual(audio.bytes, original);
      return profile;
    },
  };
  const opened = voiceProfileManagement(client, scope, journal, digest);
  const pending = opened.enroll({...enrollment, audio:{...audio, bytes}});
  bytes.fill(77);
  unblock();
  assert.deepEqual(await pending, profile);
});
