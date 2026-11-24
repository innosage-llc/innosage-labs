import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { prepareConfirmedRecordingSpan } from './VoiceProfileConfirmedSegment.ts';

const namespace = '0'.repeat(64);
const original = { uri:'file:///private-fixture/recordings/Recorder.m4a', size:14, sha256:'a'.repeat(64) };
const scope = { workerURL:'https://api-staging.draft.innosage.co', accountScope:'b'.repeat(64) };
const row = { segmentId:'seg_native_1', startMs:1000, endMs:5000, speakerId:'SPEAKER_01', disposition:'needs_review', text:'synthetic' };
function fixture() {
  const calls = [];
  const hashCalls = [];
  const operation = { ...scope, id:'opted_in', lane:'pro', identifySpeakers:true, voiceIdentification:{}, sourceBytes:original.size };
  const observed = { operationId:operation.id, scope:{...scope}, sourceSha256:original.sha256,
    result:{ contract:'recorder-voice-profile/v1', status:'completed', segments:[{...row}] } };
  const confirmation = { operationId:operation.id, scope:{...scope}, segmentId:row.segmentId, participantConfirmed:true };
  const ready = {
    stageEnabled:true, operation, original:{...original}, observed, confirmation, localNamespace:namespace,
    hash: async input => { hashCalls.push(input); return createHash('sha256').update(input).digest('hex'); },
    readCurrentOriginal:async () => ({...original}),
    nativeClip:async (source, startMs, endMs) => {
      calls.push({source,startMs,endMs});
      const sampleBytes = (endMs - startMs) * 32; // 16 kHz mono PCM16
      const bytes = Buffer.alloc(44 + sampleBytes);
      bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4);
      bytes.write('WAVEfmt ',8); bytes.writeUInt32LE(16,16); bytes.writeUInt16LE(1,20);
      bytes.writeUInt16LE(1,22); bytes.writeUInt32LE(16000,24); bytes.writeUInt32LE(32000,28);
      bytes.writeUInt16LE(2,32); bytes.writeUInt16LE(16,34); bytes.write('data',36);
      bytes.writeUInt32LE(sampleBytes,40);
      return { bytes, mimeType:'audio/wav' };
    },
  };
  return { ready, calls, hashCalls };
}

test('trusted local closure binds exact row, private source proof and caller-independent original', async () => {
  const f = fixture();
  const {span,clipper} = await prepareConfirmedRecordingSpan(f.ready);
  assert.match(span.recordingRef,/^rec_[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(span).sort(), ['endMs','recordingRef','segmentId','source','startMs']);
  assert.doesNotMatch(JSON.stringify(span), /private-fixture|https:|aaaaaaa|0000000|synthetic/);
  assert.doesNotMatch(f.hashCalls[0], /private-fixture|https:\/\/api.draft/);
  f.ready.original.uri = 'file:///substituted.m4a';
  f.ready.observed.result.segments[0].startMs = 1700;
  for (const changed of [{...span,startMs:2000},{...span,recordingRef:'rec_wrong'},{...span,accountScope:'x'},{...span,segmentId:'seg_2'}])
    await assert.rejects(clipper(changed), /bound/);
  assert.equal(f.calls.length, 0);
  const result = await clipper({...span});
  assert.equal(result.mimeType, 'audio/wav');
  assert.deepEqual(f.calls, [{source:{uri:original.uri,size:original.size},startMs:1000,endMs:5000}]);
  await assert.rejects(clipper(span), /bound/);
  assert.equal(f.calls.length, 1);
});

test('wrong account/source/operation, nonstage, absent consent, ambiguity and invalid windows fail closed', async () => {
  const mutations = [
    f => { f.ready.stageEnabled = false; },
    f => { f.ready.confirmation.participantConfirmed = false; },
    f => { f.ready.confirmation.operationId = 'unrelated'; },
    f => { f.ready.observed.operationId = 'unrelated'; },
    f => { f.ready.observed.sourceSha256 = 'c'.repeat(64); },
    f => { f.ready.original.size = 19; },
    f => { f.ready.confirmation.scope.accountScope = 'c'.repeat(64); },
    f => { f.ready.observed.scope.workerURL = 'https://api.draft.innosage.co'; },
    f => { f.ready.observed.result.segments[0].endMs = 2500; },
    f => { f.ready.observed.result.segments[0].speakerId = null; },
    f => { f.ready.observed.result.segments.push({...row}); },
    f => { f.ready.observed.result.segments.push({...row, segmentId:'other', speakerId:'SPEAKER_02'}); },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    await assert.rejects(prepareConfirmedRecordingSpan(f.ready), /bound/);
    assert.equal(f.calls.length, 0);
    assert.equal(f.hashCalls.length, 0);
  }
});

test('changed or cancelled original never clips; valid one-shot fails closed on later use', async () => {
  const f = fixture();
  f.ready.readCurrentOriginal = async () => ({...original, sha256:'f'.repeat(64)});
  const {span,clipper} = await prepareConfirmedRecordingSpan(f.ready);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(clipper(span,aborted.signal), { name:'AbortError' });
  await assert.rejects(clipper(span), /bound/);
  await assert.rejects(clipper(span), /bound/);
  assert.equal(f.calls.length,0);
});

test('wrong native byte extent never reaches enrollment', async () => {
  const f = fixture();
  const native = f.ready.nativeClip;
  f.ready.nativeClip = async (...args) => {
    const result = await native(...args);
    return { ...result, bytes: result.bytes.subarray(0, result.bytes.length - 2) };
  };
  const {span,clipper} = await prepareConfirmedRecordingSpan(f.ready);
  await assert.rejects(clipper(span), /bound/);
  await assert.rejects(clipper(span), /bound/);
  assert.equal(f.calls.length,1);
});
