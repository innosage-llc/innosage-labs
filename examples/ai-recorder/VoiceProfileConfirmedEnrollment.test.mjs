import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { VoiceProfileIntents } from './VoiceProfileIntents.ts';
const owner = new URL('./VoiceProfileConfirmedEnrollment.ts', import.meta.url).href;
// Match Expo's extensionless TS resolution only for the exact test import.
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL === owner && specifier === './VoiceProfileConfirmedSegment'
    ? specifier + '.ts' : specifier, context);
} });
const { enrollConfirmedVoiceProfile } = await import(owner);
hook.deregister();

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const scope = { workerURL:'https://api-staging.draft.innosage.co', accountScope:'b'.repeat(64) };
const original = { uri:'file:///synthetic/recordings/Recording-native.m4a', size:100, sha256:'a'.repeat(64) };
const segment = { segmentId:'seg_example', startMs:1000, endMs:3000, speakerId:'SPEAKER_01', disposition:'unknown', text:'Synthetic' };
const operation = { ...scope, id:'original_operation', lane:'pro', identifySpeakers:true, voiceIdentification:{}, sourceBytes:100 };
const profile = { profileId:'vp_' + 'p'.repeat(24), displayName:'Example', revision:1, status:'active' };

function makeWav() {
  const data = Buffer.alloc(44+64000);
  data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16);
  data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(16000,24); data.writeUInt32LE(32000,28);
  data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(64000,40);
  data[100] = 12;
  return data;
}
function fixture() {
  let storage;
  let seq = 0;
  let authorizedSubmissions = 0;
  let nativeCalls = 0;
  const keys = [];
  const store = { getItemAsync:async () => storage ?? null, setItemAsync:async (_,value) => { storage = value; } };
  const journalFor = forScope => new VoiceProfileIntents(store, forScope, () => 'fixture-key-' + ++seq);
  const options = {
    provenance: {
      stageEnabled:true, operation:{ ...operation }, original:{ ...original },
      observed:{ operationId:operation.id, scope:{...scope}, sourceSha256:original.sha256,
        result:{ contract:'recorder-voice-profile/v1',status:'completed',segments:[{ ...segment }] } },
      confirmation:{ operationId:operation.id, scope:{...scope}, participantConfirmed:true,segmentId:segment.segmentId },
      localNamespace:'d'.repeat(64), hash:digest, readCurrentOriginal:async () => ({ ...original }),
      nativeClip:async () => { nativeCalls++; return { bytes:makeWav(), mimeType:'audio/wav' }; },
    },
    displayName:'  Example ', journalFor, digest,
    clientFor: (actualScope, clipper) => ({
      async enrollVoiceProfile(input, name) {
        assert.deepEqual(actualScope,scope);
        assert.equal(input.accountScope,scope.accountScope);
        assert.equal(input.workerURL,scope.workerURL);
        assert.equal(input.audio,undefined);
        assert.equal(name,'Example');
        assert.equal(input.participantConfirmed,true);
        assert.doesNotMatch(JSON.stringify(input.source), /file:|original_operation|aaaaaaaa|synthetic/);
        assert.equal((await journalFor(scope).restore()).enrollment.mutationKey,input.mutationKey);
        keys.push(input.mutationKey);
        await assert.rejects(clipper({ ...input.source, endMs:3200 }), /different/);
        assert.equal((await clipper(input.source)).bytes[100],12);
        await assert.rejects(clipper(input.source), /repeated/);
        if (++authorizedSubmissions === 1) throw new Error('lost response');
        return profile;
      },
    }),
  };
  return { options, journalFor, keys, persisted:()=>storage, nativeCalls:()=>nativeCalls };
}

test('retry keeps the same exact journal entry; direct-equal bytes and different provenance cannot retry it', async () => {
  const f = fixture();
  await assert.rejects(enrollConfirmedVoiceProfile(f.options), /lost response/);
  assert.doesNotMatch(f.persisted(), /file:|Example|seg_example|original_operation|aaaaaaaa/);
  const sameBytes = digest(makeWav());
  await assert.rejects(f.journalFor(scope).beginEnrollment({ clipDigest:sameBytes, nameDigest:digest('Example'),mime:'audio/wav' }), /verified first/);
  const next = structuredClone({ operation:f.options.provenance.operation, observed:f.options.provenance.observed, confirmation:f.options.provenance.confirmation });
  next.operation.id = next.observed.operationId = next.confirmation.operationId = 'different_operation';
  await assert.rejects(enrollConfirmedVoiceProfile({ ...f.options, provenance:{ ...f.options.provenance,...next } }), /verified first/);
  assert.deepEqual(await enrollConfirmedVoiceProfile(f.options), profile);
  assert.deepEqual(f.keys,['fixture-key-1','fixture-key-1']);
  assert.equal((await f.journalFor(scope).restore()).enrollment,undefined);
});

test('missing consent, cross-account binding and stale digest make no native/journal/transport call', async () => {
  for (const update of [
    p => p.confirmation.participantConfirmed = false,
    p => p.confirmation.scope.accountScope = 'f'.repeat(64),
    p => p.observed.sourceSha256 = 'e'.repeat(64),
  ]) {
    const f = fixture(); update(f.options.provenance);
    await assert.rejects(enrollConfirmedVoiceProfile(f.options), /bound/);
    assert.equal(f.nativeCalls(), 0);
    assert.equal(f.persisted(),undefined);
    assert.deepEqual(f.keys,[]);
  }
});

test('native bytes are isolated before journal/backend awaits, and an unconsumed clip cannot finalize', async () => {
  const f = fixture(), nativeBytes = makeWav();
  f.options.provenance.nativeClip = async () => ({ bytes:nativeBytes, mimeType:'audio/wav' });
  const real = f.options.journalFor;
  f.options.journalFor = forScope => {
    const journal = real(forScope);
    return { beginEnrollment:async sample => { nativeBytes[100] = 99; return journal.beginEnrollment(sample); },
      finalizeEnrollment:key => journal.finalizeEnrollment(key) };
  };
  f.options.clientFor = (_, clipper) => ({ enrollVoiceProfile: async input => {
    assert.equal((await clipper(input.source)).bytes[100],12);
    return profile;
  } });
  assert.deepEqual(await enrollConfirmedVoiceProfile(f.options),profile);
  f.options.clientFor = () => ({ enrollVoiceProfile:async () => profile });
  await assert.rejects(enrollConfirmedVoiceProfile(f.options), /verify/);
  assert.ok((await f.journalFor(scope).restore()).enrollment);
});
