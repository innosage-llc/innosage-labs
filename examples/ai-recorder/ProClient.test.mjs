import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { ProClient } from './ProClient.ts';

function fixture() {
  const values = new Map();
  const store = { getItemAsync: async key => values.get(key) ?? null,
    setItemAsync: async (key, value) => { values.set(key, value); },
    deleteItemAsync: async key => { values.delete(key); } };
  const state = { scope: 'a'.repeat(64), authorized: true, reservations: 0, uploads: 0,
    cleanup: 0, phase: 'RESERVED', loseUploadResponse: false, wrongRouter: false, mode: false, rejectStatusOnce: false };
  const worker = 'https://worker.test';
  const router = 'https://router.test';
  const calls = [];
  async function http(url, init = {}) {
    calls.push({ url, auth: init.headers?.Authorization });
    if (url.startsWith(worker)) {
      assert.equal(init.headers.Authorization, 'Bearer synthetic-pro-key');
      if (!state.authorized) return Response.json({ error: 'unauthorized' }, { status: 401 });
      if (url.endsWith('/identity')) return Response.json({ success: true, accountScope: state.scope });
      if (url.includes('/api/voice-profiles/v1')) {
        if (init.method === 'POST') {
          state.enrollment = { key: init.headers['Idempotency-Key'],
            metadata: JSON.parse(init.body.get('metadata')), bytes: init.body.get('audio').size };
          return Response.json({ contract: 'recorder-voice-profile/v1', profile: state.voiceProfile }, { status: 201 });
        }
        if (init.method === 'PATCH') {
          state.edit = { key: init.headers['Idempotency-Key'], body: JSON.parse(init.body) };
          return Response.json({ contract: 'recorder-voice-profile/v1', profile: state.voiceProfile });
        }
        if (init.method === 'DELETE') {
          (state.deleteKeys ??= []).push(init.headers['Idempotency-Key']);
          return new Response(null, { status: state.deleteKeys.length === 1 ? 202 : 204 });
        }
        return Response.json({ contract: 'recorder-voice-profile/v1', profiles: [state.voiceProfile] });
      }
      state.reservations++;
      const reserve = JSON.parse(init.body);
      state.mode = reserve.diarization.enabled;
      state.voiceOptions = reserve.voiceIdentification;
      return Response.json({ decision: 'created', sessionId: 'tx_synthetic', state: state.phase,
        routerBaseUrl: state.wrongRouter ? 'https://other.test' : router,
        uploadCapability: 'u'.repeat(32), controlCapability: 'c'.repeat(32),
        uploadExpiresAt: Math.floor(Date.now() / 1000) + 900,
        controlExpiresAt: Math.floor(Date.now() / 1000) + 86400, maxBytes: 4 * 1024 ** 3,
        allowedContentTypes: ['audio/mp4'],
        ...(state.mode ? { diarization: { enabled: true }, speakerResultContract: 'draft-speaker-attribution/v1' } : {}),
        ...(state.voiceOptions && !state.omitVoiceAck ? { voiceIdentification: { contract: state.voiceOptions.contract } } : {}),
      });
    }
    assert.ok(url.startsWith(router));
    assert.notEqual(init.headers.Authorization, 'Bearer synthetic-pro-key');
    if (url.endsWith('/upload')) {
      assert.equal(init.headers.Authorization, 'Bearer ' + 'u'.repeat(32));
      assert.equal(init.headers['X-Content-SHA256'], 'b'.repeat(64));
      state.uploads++; state.phase = 'PROCESSING';
      if (state.loseUploadResponse) throw new Error('Synthetic lost response');
      return Response.json({ state: state.phase });
    }
    assert.equal(init.headers.Authorization, 'Bearer ' + 'c'.repeat(32));
    if (url.endsWith('/voice-identification')) {
      const payload = state.voiceResult ?? { contract: 'recorder-voice-profile/v1', status: 'pending' };
      return Response.json(payload, { status: payload.status === 'pending' ? 202 : 200 });
    }
    if (url.endsWith('/transcript')) return new Response('[00:00.000 - 00:01.000] Synthetic original.');
    if (url.endsWith('/cleanup')) { state.cleanup++; return Response.json({ state: 'CLEANED' }); }
    if (state.rejectStatusOnce) { state.rejectStatusOnce = false; return Response.json({ error: 'capability_denied' }, { status: 401 }); }
    return Response.json({ state: state.phase });
  }
  const client = new ProClient(worker, router, http, store, async (url, file, headers, signal) => { await http(url, { headers, signal, body: file }); });
  const operation = { id: `recorder-transcription-v2-${Math.floor(Date.now() / 1000) + 86400}-${randomUUID()}`, lane: 'pro',
    workerURL: worker, accountScope: state.scope, sourceBytes: 60_000_000, identifySpeakers: false };
  const file = { size: operation.sourceBytes };
  return { client, store, values, state, calls, operation, file };
}

test('canonical validation retains a saved key when a candidate is rejected', async () => {
  const f = fixture();
  await assert.rejects(f.client.configure('sk-proj-synthetic-key'), /Choose OpenAI/);
  assert.equal(f.calls.length, 0);
  await f.client.configure('synthetic-pro-key');
  f.state.authorized = false;
  await assert.rejects(f.client.configure('synthetic-pro-key'));
  assert.equal((await f.client.profile()).key, 'synthetic-pro-key');
  assert.equal(f.state.reservations, 0);
  await f.client.remove();
  assert.equal(await f.client.profile(), undefined);
});

test('paid file larger than Free limit uploads directly, and ambiguous retry does not resubmit', async () => {
  const f = fixture();
  await f.client.configure('synthetic-pro-key');
  let transferAttempts = 0;
  const onTransfer = () => { transferAttempts++; assert.equal(f.state.uploads, 0); };
  f.state.loseUploadResponse = true;
  await assert.rejects(f.client.upload(f.operation, 'synthetic.m4a', f.file, async () => 'b'.repeat(64), undefined, onTransfer));
  assert.equal(f.state.uploads, 1);
  const recovered = await f.client.upload(f.operation, 'synthetic.m4a', f.file, async () => { throw new Error('Must not hash/upload accepted work again'); }, undefined, onTransfer);
  assert.equal(recovered.state, 'PROCESSING');
  assert.equal(transferAttempts, 1);
  assert.equal(f.state.reservations, 1);
  assert.equal(f.state.uploads, 1);
  assert.equal(f.state.cleanup, 0);
  f.state.phase = 'COMPLETED';
  const completed = await f.client.read(f.operation, 'synthetic.m4a');
  assert.match(completed.transcript, /Synthetic original/);
  assert.equal(f.state.cleanup, 0, 'Reading must not clean up before the caller persists');
  await f.client.cleanup(f.operation, 'synthetic.m4a');
  assert.equal(f.state.cleanup, 1);
});

test('revoked access and different account deny admission before reserving a job', async () => {
  const f = fixture();
  await f.client.configure('synthetic-pro-key');
  f.state.authorized = false;
  await assert.rejects(f.client.upload(f.operation, 'synthetic.m4a', f.file, async () => 'b'.repeat(64), undefined,
    () => { throw new Error('Unauthorized attempt reached transfer'); }), { code: 'authorization' });
  assert.equal(f.state.reservations, 0);
  f.state.authorized = true; f.state.scope = 'd'.repeat(64);
  await assert.rejects(f.client.read(f.operation, 'synthetic.m4a'));
  assert.equal(f.state.reservations, 0);
});

test('untrusted Router response and environment mismatch never receive the Pro key', async () => {
  const f = fixture();
  await f.client.configure('synthetic-pro-key');
  f.state.wrongRouter = true;
  await assert.rejects(f.client.read(f.operation, 'synthetic.m4a'));
  assert.ok(f.calls.every(call => call.url.startsWith('https://worker.test')));
  await assert.rejects(f.client.read({ ...f.operation, workerURL: 'https://other.test' }, 'synthetic.m4a'));
});


test('confirmed terminal restart uses a separate operation session', async () => {
  const f = fixture();
  await f.client.configure('synthetic-pro-key');
  await f.client.read(f.operation, 'synthetic.m4a');
  const next = { ...f.operation, id: f.operation.id.slice(0, -36) + randomUUID() };
  await f.client.read(next, 'synthetic.m4a');
  assert.equal(f.state.reservations, 2);
  assert.equal([...f.values.keys()].filter(key => key.startsWith('pro.session.')).length, 2);
});

test('expired operation becomes terminal without a new reservation', async () => {
  const f = fixture();
  await f.client.configure('synthetic-pro-key');
  const old = { ...f.operation, id: `recorder-transcription-v2-1700000000-${randomUUID()}` };
  assert.deepEqual(await f.client.read(old, 'synthetic.m4a'), { state: 'EXPIRED' });
  assert.equal(f.state.reservations, 0);
});

test('cleanup retains intent on failed authorization and renews the same operation when restored', async () => {
  const f = fixture();
  await f.client.configure('synthetic-pro-key');
  await f.client.read(f.operation, 'synthetic.m4a');
  const key = [...f.values.keys()].find(key => key.startsWith('pro.session.'));
  const old = JSON.parse(f.values.get(key));
  old.controlExpiresAt = 1;
  old.controlCapability = 'stale'.repeat(8);
  old.uploadCapability = 'old'.repeat(12);
  f.values.set(key, JSON.stringify(old));
  f.state.authorized = false;
  await assert.rejects(f.client.cleanup(f.operation, 'synthetic.m4a'));
  assert.ok(f.values.has(key));
  f.state.authorized = true;
  await f.client.cleanup(f.operation, 'synthetic.m4a');
  assert.equal(f.state.reservations, 2);
  assert.equal(f.state.cleanup, 1);
  assert.equal(f.state.uploads, 0);
  assert.equal(f.values.has(key), false);
});


test('early Router capability rejection renews the same operation and surfaces terminal receipt', async () => {
  const f = fixture();
  await f.client.configure('synthetic-pro-key');
  await f.client.read(f.operation, 'synthetic.m4a');
  f.state.phase = 'CLEANED';
  f.state.rejectStatusOnce = true;
  const result = await f.client.read(f.operation, 'synthetic.m4a');
  assert.equal(result.state, 'CLEANED');
  assert.equal(f.state.reservations, 2);
  assert.equal(f.state.uploads, 0);
});


test('voice result is additive, uses the same reservation and never uploads a second time', async () => {
  const f = fixture();
  await f.client.configure('synthetic-pro-key');
  const optIn = { ...f.operation, identifySpeakers: true, voiceIdentification: { candidateProfileIds: ['vp_b', 'vp_a'] } };
  f.state.phase = 'COMPLETED';
  const original = await f.client.read(optIn, 'synthetic.m4a');
  assert.match(original.transcript, /Synthetic original/);
  assert.ok(!f.calls.some(call => call.url.endsWith('/voice-identification')));
  assert.deepEqual(f.state.voiceOptions, { contract: 'recorder-voice-profile/v1', candidateProfileIds: ['vp_a', 'vp_b'] });
  assert.equal((await f.client.readVoiceIdentification(optIn, 'synthetic.m4a')).status, 'pending');
  const reordered = { ...optIn, voiceIdentification: { candidateProfileIds: ['vp_a', 'vp_b'] } };
  f.state.voiceResult = { contract: 'recorder-voice-profile/v1', status: 'completed', segments: [] };
  assert.deepEqual(await f.client.readVoiceIdentification(reordered, 'synthetic.m4a'), f.state.voiceResult);
  assert.equal(f.state.reservations, 1);
  assert.equal(f.state.uploads, 0);
  assert.equal(f.state.cleanup, 0);
  await assert.rejects(f.client.readVoiceIdentification({ ...optIn, voiceIdentification: { candidateProfileIds: [] } }, 'synthetic.m4a'), /another operation/);
  await assert.rejects(f.client.cleanup({ ...optIn, voiceIdentification: { candidateProfileIds: [] } }, 'synthetic.m4a'), /Invalid cleanup binding/);
  assert.equal(f.state.cleanup, 0);
  const reads = f.calls.filter(c => c.url.endsWith('/voice-identification')).length;
  f.state.scope = 'd'.repeat(64);
  await assert.rejects(f.client.readVoiceIdentification(optIn, 'synthetic.m4a'), { code: 'authorization' });
  assert.equal(f.calls.filter(c => c.url.endsWith('/voice-identification')).length, reads);
});

test('selected identity profiles are never silently replaced by a plain upload', async () => {
  const f = fixture();
  await f.client.configure('synthetic-pro-key');
  const optIn = { ...f.operation, identifySpeakers: true, voiceIdentification: {} };
  f.state.omitVoiceAck = true;
  await assert.rejects(f.client.upload(optIn, 'synthetic.m4a', f.file, async () => 'b'.repeat(64)),
    { code: 'voice_unavailable' });
  assert.equal(f.state.uploads, 0);
  const before = f.calls.length;
  await assert.rejects(f.client.read({ ...optIn, voiceIdentification: { candidateProfileIds: ['vp_a','vp_a'] } }, 'synthetic.m4a'),
    { code: 'voice_options_invalid' });
  assert.equal(f.calls.length, before);
});

test('profile changes stay inside the original Pro worker, bind consent, and distinguish pending delete', async () => {
  const f = fixture();
  await f.client.configure('synthetic-pro-key');
  const scope = f.operation.accountScope;
  f.state.voiceProfile = { profileId: 'vp_fake', displayName: 'Example', revision: 1, status: 'active' };
  const clip = new Blob(['example WAV bytes'], { type: 'audio/wav' });
  const source = { source: 'confirmed_segment', recordingRef:'rec_a', segmentId:'seg_1', startMs:500, endMs:3500 };
  const request = { mutationKey: 'example-enrollment', audio: clip, source, accountScope: scope };
  const before = f.calls.length;
  await assert.rejects(f.client.enrollVoiceProfile({ ...request, participantConfirmed:false }, 'Example'),
    { code:'voice_options_invalid' });
  assert.equal(f.calls.length, before);
  assert.deepEqual(await f.client.enrollVoiceProfile({ ...request, participantConfirmed:true }, 'Example'), f.state.voiceProfile);
  assert.deepEqual(f.state.enrollment, { key:request.mutationKey, bytes:clip.size, metadata:{
    displayName: 'Example', sample:source, consent:{scope:'voice_profile_enrollment',participantConfirmed:true},
  } });
  assert.deepEqual(await f.client.listVoiceProfiles(scope), [f.state.voiceProfile]);
  await f.client.updateVoiceProfileSample('vp_fake', {
    ...request, mutationKey:'example-replace', participantConfirmed:true,
    source:{ source:'direct', filePath:'/private/not-forwarded' },
  }, 1, 'replace');
  assert.deepEqual(f.state.enrollment.metadata, {
    expectedRevision:1, mode:'replace', sample:{source:'direct'},
    consent:{scope:'voice_profile_enrollment', participantConfirmed:true},
  });
  await f.client.editVoiceProfile(scope, 'vp_fake', 'example-name', 2, { displayName:'  Example 2  ', status:'disabled' });
  assert.deepEqual(f.state.edit, {key:'example-name', body:{expectedRevision:2,status:'disabled',displayName:'Example 2'}});

  assert.equal(await f.client.deleteVoiceProfile(scope, 'vp_fake', 'example-delete'), 'pending');
  assert.equal(await f.client.deleteVoiceProfile(scope, 'vp_fake', 'example-delete'), 'deleted');
  assert.deepEqual(f.state.deleteKeys, ['example-delete','example-delete']);
  const count = f.calls.filter(c => c.url.includes('/voice-profiles/')).length;
  f.state.scope = 'f'.repeat(64);
  await assert.rejects(f.client.listVoiceProfiles(scope), { code:'authorization' });
  assert.equal(f.calls.filter(c => c.url.includes('/voice-profiles/')).length, count);
  assert.ok(f.calls.every(c => c.url.startsWith('https://worker.test')));
});
