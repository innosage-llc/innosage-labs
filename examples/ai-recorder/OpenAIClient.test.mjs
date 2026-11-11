import assert from 'node:assert/strict';
import test from 'node:test';
import { openAIMaxBytes, transcribeOpenAI, verifyOpenAI } from './OpenAIClient.ts';

test('preflight only checks model access and refuses redirects', async () => {
  await verifyOpenAI(async (url, request) => {
    assert.equal(url, 'https://api.openai.com/v1/models/gpt-transcribe');
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.Authorization, 'Bearer synthetic-key');
    assert.equal(request.redirect, 'error');
    assert.equal(request.body, undefined);
    return Response.json({ id: 'gpt-transcribe' });
  }, ' synthetic-key ');
});

test('a direct multipart request submits the recording once and returns original text', async () => {
  let calls = 0;
  const transcript = await transcribeOpenAI(async (url, request) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'error');
    assert.equal(request.body.get('model'), 'gpt-transcribe');
    assert.equal(request.body.get('file').name, 'recording.m4a');
    assert.equal(await request.body.get('file').text(), 'fixture');
    return Response.json({ text: 'Synthetic transcript.' });
  }, 'synthetic-key', new Blob(['fixture'], { type: 'audio/mp4' }), new AbortController().signal);
  assert.equal(calls, 1);
  assert.equal(transcript, 'Synthetic transcript.');
});

test('oversize is rejected locally and quota errors are neither retried nor echoed', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(transcribeOpenAI(assert.fail, 'synthetic-key', { size: openAIMaxBytes }, signal), /25 MB/);
  let calls = 0;
  await assert.rejects(transcribeOpenAI(async () => {
    calls++;
    return Response.json({ error: 'sensitive upstream diagnostic' }, { status: 429 });
  }, 'synthetic-key', new Blob(['fixture']), signal), /quota/);
  assert.equal(calls, 1);
});
