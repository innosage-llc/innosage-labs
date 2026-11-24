import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { ProClient } from './ProClient.ts';
import { VoiceProfileIntents } from './VoiceProfileIntents.ts';
import { voiceProfileManagement } from './VoiceProfileManagement.ts';

function fixture(clipVoiceSample) {
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
          const form = init.body instanceof ArrayBuffer
            ? await new Request(url, {method: 'POST', headers: init.headers, body: init.body}).formData()
            : init.body;
          const audio = form.get('audio');
          state.enrollment = { key: init.headers['Idempotency-Key'],
            metadata: JSON.parse(form.get('metadata')), bytes: audio.size };
          if (init.body instanceof ArrayBuffer)
            state.binaryPart = {name: audio.name, mime: audio.type,
              bytes: new Uint8Array(await audio.arrayBuffer()), wireLength: init.body.byteLength,
              boundary: init.headers['Content-Type'].split('boundary=')[1]};
          return Response.json({ contract: 'recorder-voice-profile/v1', profile: state.voiceProfile,
            ...state.extraEnrollmentReceipt }, { status: state.enrollmentStatus ?? 201 });
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
      if (state.reserveHold) await state.reserveHold;
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
      const status = state.voiceHttpStatus ?? (payload.status === 'pending' ? 202 : 200);
      return Response.json(payload, { status, ...(status === 202 ? { headers: {'Retry-After':'2'} } : {}) });
    }
    if (url.endsWith('/transcript')) return new Response('[00:00.000 - 00:01.000] Synthetic original.');
    if (url.endsWith('/cleanup')) { state.cleanup++; return Response.json({ state: 'CLEANED' }); }
    if (state.rejectStatusOnce) { state.rejectStatusOnce = false; return Response.json({ error: 'capability_denied' }, { status: 401 }); }
    return Response.json({ state: state.phase });
  }
  const client = new ProClient(worker, router, http, store, async (url, file, headers, signal) => { await http(url, { headers, signal, body: file }); }, clipVoiceSample);
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
  assert.deepEqual(await f.client.readVoiceIdentification(optIn, 'synthetic.m4a'), {
    result: { contract: 'recorder-voice-profile/v1', status: 'pending' }, retryAfterSeconds: 2,
  });
  const reordered = { ...optIn, voiceIdentification: { candidateProfileIds: ['vp_a', 'vp_b'] } };
  f.state.voiceResult = { contract: 'recorder-voice-profile/v1', status: 'completed', segments: [] };
  assert.deepEqual(await f.client.readVoiceIdentification(reordered, 'synthetic.m4a'), {result:f.state.voiceResult});
  f.state.voiceHttpStatus = 202;
  await assert.rejects(f.client.readVoiceIdentification(reordered, 'synthetic.m4a'), {code:'voice_unavailable'});
  f.state.voiceHttpStatus = undefined;
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
  const clip = new Blob(['example WAV bytes'], { type: 'audio/wav' });
  const capture = [];
  const f = fixture(async request => {
    capture.push(request);
    return clip;
  });
  await f.client.configure('synthetic-pro-key');
  const scope = { workerURL:f.operation.workerURL, accountScope:f.operation.accountScope };
  f.state.voiceProfile = { profileId: 'vp_fake', displayName: 'Example', revision: 1, status: 'active' };
  const source = { source: 'confirmed_segment', recordingRef:'rec_a', segmentId:'seg_1', startMs:500, endMs:3500 };
  const request = { mutationKey: 'example-enrollment', source, ...scope };
  const before = f.calls.length;
  await assert.rejects(f.client.enrollVoiceProfile({ ...request, participantConfirmed:false }, 'Example'),
    { code:'voice_options_invalid' });
  assert.equal(f.calls.length, before);
  await assert.rejects(f.client.enrollVoiceProfile({ ...request, audio:clip, participantConfirmed:true }, 'Example'),
    {code:'voice_options_invalid'});
  assert.equal(f.calls.length, before);
  assert.deepEqual(await f.client.enrollVoiceProfile({ ...request, participantConfirmed:true }, 'Example'), f.state.voiceProfile);
  assert.deepEqual(capture, [source]);
  assert.deepEqual(f.state.enrollment, { key:request.mutationKey, bytes:clip.size, metadata:{
    displayName: 'Example', sample:source, consent:{scope:'voice_profile_enrollment',participantConfirmed:true},
  } });
  assert.deepEqual(await f.client.listVoiceProfiles(scope), [f.state.voiceProfile]);
  await f.client.updateVoiceProfileSample('vp_fake', {
    ...request, mutationKey:'example-replace', participantConfirmed:true, audio:clip,
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
  const beforeWrongOrigin = f.calls.length;
  await assert.rejects(f.client.enrollVoiceProfile({
    ...request, workerURL:'https://other.test', participantConfirmed:true,
  }, 'Example'), {code:'authorization'});
  assert.equal(f.calls.length, beforeWrongOrigin);
});

test('bounded native bytes round-trip as multipart, only with permitted consent and account', async () => {
  const f = fixture();
  await f.client.configure('synthetic-pro-key');
  f.state.voiceProfile = { profileId: 'vp_fake', displayName: 'Fixture', revision: 1, status: 'active' };
  const scope = { workerURL: f.operation.workerURL, accountScope: f.operation.accountScope };
  const bytes = new Uint8Array([0, 255, 10, 13, 7, 0, 33]);
  const request = {...scope, participantConfirmed:true, mutationKey:'fixture-clip',
    source:{source:'direct', localPath:'/private/excluded'}, audio:{bytes, mimeType:'audio/wav'}};
  const before = f.calls.length;
  for (const input of [
    {...request, participantConfirmed:false},
    {...request, audio:{bytes, mimeType:'audio/wav\r\nX-Extra: nope'}},
    {...request, audio:{...request.audio, bytes:new Uint8Array(10*1024*1024)}},
    {...request, audio:{...request.audio, bytes:new TextEncoder().encode('a--RecorderVoice-fixture-clip')}},
    {...request, mutationKey:'fixture-key with spaces'},
  ]) await assert.rejects(f.client.enrollVoiceProfile(input, 'Fixture'), {code:'voice_options_invalid'});
  assert.equal(f.calls.length, before);
  f.state.authorized = false;
  await assert.rejects(f.client.enrollVoiceProfile(request, 'Fixture'), {code:'authorization'});
  assert.deepEqual(f.calls.slice(before).map(call => call.url), [f.operation.workerURL+'/api/transcriptions/identity']);
  f.state.authorized = true;
  assert.deepEqual(await f.client.enrollVoiceProfile(request, 'Fixture'), f.state.voiceProfile);
  assert.deepEqual(f.state.enrollment, {key:'fixture-clip',bytes:bytes.length,metadata:{
    displayName:'Fixture', sample:{source:'direct'},
    consent:{scope:'voice_profile_enrollment',participantConfirmed:true},
  }});
  assert.deepEqual(f.state.binaryPart.bytes, bytes);
  assert.equal(f.state.binaryPart.mime, 'audio/wav');
  assert.equal(f.state.binaryPart.name, 'sample.wav');
  assert.ok(f.state.binaryPart.wireLength <= 10*1024*1024);
  await f.client.updateVoiceProfileSample('vp_fake',
    {...request, mutationKey:'fixture-update', audio:{bytes,mimeType:'audio/mp4'}}, 1, 'replace');
  assert.deepEqual(f.state.binaryPart.bytes, bytes);
  assert.equal(f.state.binaryPart.mime, 'audio/mp4');
  assert.equal(f.state.binaryPart.name, 'sample.m4a');
  const longKey = 'k'.repeat(128);
  await f.client.enrollVoiceProfile({...request, mutationKey:longKey}, 'Fixture');
  assert.equal(f.state.enrollment.key, longKey);
  assert.equal(f.state.binaryPart.boundary.length, 70);
  const beforeCollision = f.calls.length;
  const clash = new TextEncoder().encode('--' + f.state.binaryPart.boundary);
  await assert.rejects(f.client.enrollVoiceProfile(
    {...request, mutationKey:longKey, audio:{bytes:clash, mimeType:'audio/wav'}}, 'Fixture'),
    {code:'voice_options_invalid'});
  assert.equal(f.calls.length, beforeCollision);
});

test('concurrent first reservation cannot reuse a different opt-in or account binding', async () => {
  const f = fixture();
  await f.client.configure('synthetic-pro-key');
  let release;
  f.state.reserveHold = new Promise(ok => { release = ok; });
  const intended = f.client.read(f.operation, 'synthetic.m4a');
  try {
    await assert.rejects(f.client.upload({ ...f.operation, identifySpeakers:true, voiceIdentification:{} },
      'synthetic.m4a', f.file, async () => 'b'.repeat(64)), /another operation/);
    await assert.rejects(f.client.read({ ...f.operation, accountScope:'d'.repeat(64) }, 'synthetic.m4a'),
      /another operation/);
    assert.equal(f.state.uploads, 0);
  } finally {
    release();
  }
  assert.equal((await intended).state, 'RESERVED');
  assert.equal(f.state.reservations, 1);
});

test('202 and malformed terminal receipts cannot clear the persisted enrollment intent', async () => {
  const f = fixture();
  await f.client.configure('synthetic-pro-key');
  f.state.voiceProfile = { profileId:'vp_' + 'q'.repeat(20), displayName:'Example', revision:1, status:'active' };
  const scope = { workerURL:f.operation.workerURL, accountScope:f.operation.accountScope };
  const entries = new Map();
  const store = { getItemAsync:async key => entries.get(key) ?? null,
    setItemAsync:async (key, value) => { entries.set(key, value); } };
  const journal = () => new VoiceProfileIntents(store, scope, randomUUID);
  const open = () => voiceProfileManagement(f.client, scope, journal(), bytes =>
    createHash('sha256').update(bytes).digest('hex'));
  const input = { participantConfirmed:true, displayName:'Example',
    audio:{bytes:Uint8Array.of(1, 2, 3), mimeType:'audio/wav'} };
  f.state.enrollmentStatus = 202;
  await assert.rejects(open().enroll(input), {code:'voice_unavailable'});
  assert.equal((await open().restore()).pendingEnrollment, true);
  const key = (await journal().restore()).enrollment.mutationKey;
  f.state.enrollmentStatus = 201;
  f.state.extraEnrollmentReceipt = {unexpected:true};
  await assert.rejects(open().enroll(input), {code:'voice_unavailable'});
  assert.equal((await journal().restore()).enrollment.mutationKey, key);
  f.state.extraEnrollmentReceipt = undefined;
  f.state.enrollmentStatus = 200;
  assert.deepEqual(await open().enroll(input), f.state.voiceProfile);
  assert.equal(f.state.enrollment.key, key);
  assert.equal((await open().restore()).pendingEnrollment, false);
});
