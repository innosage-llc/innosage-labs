import assert from 'node:assert/strict';
import test from 'node:test';
import { finishVoiceAfterSavingOriginal, voiceProfileStageEnabled } from './VoiceProfileFlow.ts';

const operation = Object.freeze({
  id: 'recorder-transcription-v2-1999999999-12345678-1234-4123-8123-123456789abc',
  lane: 'pro',
  identifySpeakers: true,
  voiceIdentification: {},
  workerURL: 'https://synthetic.invalid',
  accountScope: 'a'.repeat(64),
  sourceBytes: 1,
});

test('stage rollout is explicit and cannot enable production or OpenAI', () => {
  assert.equal(voiceProfileStageEnabled('staging', 'true'), true);
  assert.equal(voiceProfileStageEnabled('staging', 'false'), false);
  assert.equal(voiceProfileStageEnabled('production', 'true'), false);
  assert.equal(voiceProfileStageEnabled('openai', 'true'), false);
});

test('does not contact VoiceProfiles before confirming the local original', async () => {
  let reads = 0;
  const outcome = await finishVoiceAfterSavingOriginal({
    client: { readVoiceIdentification: async () => { reads++; } }, operation,
    recording: 'fixture', originalSaved: false, signal: new AbortController().signal,
  });
  assert.equal(reads, 0);
  assert.equal(outcome.status, 'unavailable');
});

test('pending polls the same operation only, then exposes a separate result', async () => {
  let reads = 0;
  let time = 0;
  const finished = { contract: 'recorder-voice-profile/v1', status: 'completed', segments: [] };
  const outcome = await finishVoiceAfterSavingOriginal({
    client: { readVoiceIdentification: async (saved, recording) => {
      assert.strictEqual(saved, operation);
      assert.equal(recording, 'fixture');
      return ++reads === 1
        ? { result: { contract: 'recorder-voice-profile/v1', status: 'pending' }, retryAfterSeconds: 2 }
        : { result: finished };
    } }, operation, recording: 'fixture', originalSaved: true, signal: new AbortController().signal,
    clock: () => time, delay: async duration => { time += duration; },
  });
  assert.deepEqual(outcome, { status: 'ready', result: finished });
  assert.equal(reads, 2);
  assert.equal(time, 2000);
});
