import assert from 'node:assert/strict';
import test from 'node:test';
import { listSummaryModels, openAIMaxBytes, summarizeOpenAI, transcribeOpenAI, verifyOpenAI } from './OpenAIClient.ts';

test('preflight only checks model access and refuses redirects', async () => {
  await assert.rejects(verifyOpenAI(assert.fail, 'synthetic-pro-key'), /OpenAI Platform API key/);
  await verifyOpenAI(async (url, request) => {
    assert.equal(url, 'https://api.openai.com/v1/models/gpt-transcribe');
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.Authorization, 'Bearer sk-proj-synthetic-key');
    assert.equal(request.redirect, 'error');
    assert.equal(request.body, undefined);
    return Response.json({ id: 'gpt-transcribe' });
  }, ' sk-proj-synthetic-key ');
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
  }, 'sk-proj-synthetic-key', new Blob(['fixture'], { type: 'audio/mp4' }), new AbortController().signal);
  assert.equal(calls, 1);
  assert.equal(transcript, 'Synthetic transcript.');
});

test('oversize is rejected locally and quota errors are neither retried nor echoed', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(transcribeOpenAI(assert.fail, 'sk-proj-synthetic-key', { size: openAIMaxBytes }, signal), /25 MB/);
  let calls = 0;
  await assert.rejects(transcribeOpenAI(async () => {
    calls++;
    return Response.json({ error: 'sensitive upstream diagnostic' }, { status: 429 });
  }, 'sk-proj-synthetic-key', new Blob(['fixture']), signal), /quota/);
  assert.equal(calls, 1);
});

test('summary model selection uses the project list and excludes audio and embedding models', async () => {
  const models = await listSummaryModels(async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/models');
    assert.equal(init.method, 'GET');
    return Response.json({ data: ['gpt-5.6-luna', 'gpt-transcribe', 'gpt-6.1-sol', 'text-embedding-3-small', 'gpt-5.6-luna', 'gpt-4.1-mini'].map(id => ({ id })) });
  }, 'sk-proj-synthetic-key', new AbortController().signal);
  assert.deepEqual(models, ['gpt-5.6-luna', 'gpt-6.1-sol']);
});

test('summary sends the exact selected model and text, and extracts assistant output', async () => {
  const result = await summarizeOpenAI(async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.headers['Content-Type'], 'application/json');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gpt-5.6-luna');
    assert.deepEqual(body.reasoning, { effort: 'xhigh' });
    assert.deepEqual(body.tools, [{ type: 'web_search' }]);
    assert.equal(body.tool_choice, 'required');
    assert.equal(body.input, 'Kim agreed to ship Tuesday.');
    assert.equal(body.store, false);
    assert.match(body.instructions, /Fact check/);
    return Response.json({ status: 'completed', output: [
      { type: 'reasoning' },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Kim will ship Tuesday.', annotations: [{ type: 'url_citation', end_index: 4, url: 'https://example.com/source', title: 'Source' }] }] },
    ] });
  }, 'sk-proj-synthetic-key', 'gpt-5.6-luna', 'Kim agreed to ship Tuesday.', { effort: 'xhigh', instructions: 'Fact check', webSearch: true }, new AbortController().signal);
  assert.deepEqual(result, { text: 'Kim will ship Tuesday.', citations: [{ end: 4, url: 'https://example.com/source', title: 'Source' }] });
});
