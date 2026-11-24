import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewLiveVoiceSegments, readManualVoiceCorrections, saveManualVoiceCorrection, editSavedVoiceCorrection } from './VoiceProfileReview.ts';

const row = (overrides={}) => ({ segmentId:'seg-1', startMs:2500, endMs:5500, text:'Private original',
  speakerId:'SPEAKER_01', disposition:'matched', matchedProfileId:'vp_a', ...overrides });
const profile = (overrides={}) => ({profileId:'vp_a', displayName:'Fixture participant', revision:5, status:'active', ...overrides});

test('display names are ephemeral, current eligible exact IDs only, and points remain untouched', () => {
  assert.deepEqual(reviewLiveVoiceSegments([row(),row({segmentId:'point',startMs:2500,endMs:2500})],[profile()]),
    [{speakerId:'SPEAKER_01',segmentId:'seg-1',startMs:2500,endMs:5500,disposition:'matched',liveName:'Fixture participant'}]);
  assert.equal(reviewLiveVoiceSegments([row()],[])[0].disposition, 'unknown');
  assert.equal(reviewLiveVoiceSegments([row()],[profile({status:'disabled'})])[0].disposition,'unknown');
  assert.equal(reviewLiveVoiceSegments([row()], [profile({status:'disabled'}),profile()])[0].disposition,'unknown');
  const evidence = [row(),row({segmentId:'seg-2',matchedProfileId:'vp_b'})];
  assert.equal(reviewLiveVoiceSegments(evidence,[profile()])[0].disposition,'needs_review');
  assert.equal(reviewLiveVoiceSegments([row(),row({disposition:'unknown',matchedProfileId:undefined})],[profile()])[0].liveName,undefined);
});

test('an explicit correction binds to exact source and contains no recognizer data or text', async () => {
  let saved=null;
  const store = {getItemAsync:async()=>saved,setItemAsync:async(_,value)=>{saved=value;}};
  const binding = {operationId:'tx_1',originalSha256:'a'.repeat(64)};
  const review = reviewLiveVoiceSegments([row()],[profile()]);
  await assert.rejects(saveManualVoiceCorrection(store,'local',binding,review,
    {speakerId:'SPEAKER_01',label:'Operator label',confirmedLocalOnly:false}),/Confirm/);
  assert.equal(saved,null);
  const choice = {speakerId:'SPEAKER_01',label:'  Operator label ',confirmedLocalOnly:true };
  const written = await saveManualVoiceCorrection(store,'local',binding,review,choice);
  assert.deepEqual(await readManualVoiceCorrections(store,'local',binding),written);
  assert.doesNotMatch(saved,/vp_a|Fixture participant|Private original|matched/);
  assert.equal(written[0].source.segmentId,'seg-1');
  assert.equal(written[0].label,'Operator label');
  await assert.rejects(readManualVoiceCorrections(store,'local',{...binding,originalSha256:'b'.repeat(64)}),/Invalid/);
});

test('an existing exact local annotation remains editable after the live result is gone', async () => {
  let value = null;
  const store = { getItemAsync:async()=>value, setItemAsync:async(_,current)=>{value=current;} };
  const binding = { operationId:'tx_1', originalSha256:'a'.repeat(64) };
  const review = reviewLiveVoiceSegments([row()],[profile()]);
  const created = await saveManualVoiceCorrection(store,'test',binding,review,
    {speakerId:'SPEAKER_01',label:'Original manual label',confirmedLocalOnly:true});
  const input = {source:created[0].source,label:'Updated manual label',confirmedLocalOnly:true};
  await assert.rejects(editSavedVoiceCorrection(store,'test',binding,
    {...input,source:{...input.source,segmentId:'not-original'}}),/no longer available/);
  await assert.rejects(editSavedVoiceCorrection(store,'test',{...binding,originalSha256:'b'.repeat(64)},input),/Invalid/);
  const edited = await editSavedVoiceCorrection(store,'test',binding,input);
  assert.equal(edited[0].label,'Updated manual label');
  assert.deepEqual(edited[0].source,created[0].source);
  assert.doesNotMatch(value,/Fixture participant|vp_a|Private original/);
});
