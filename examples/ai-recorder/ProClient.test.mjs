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
      state.reservations++;
      state.mode = JSON.parse(init.body).diarization.enabled;
      return Response.json({ decision: 'created', sessionId: 'tx_synthetic', state: state.phase,
        routerBaseUrl: state.wrongRouter ? 'https://other.test' : router,
        uploadCapability: 'u'.repeat(32), controlCapability: 'c'.repeat(32),
        uploadExpiresAt: Math.floor(Date.now() / 1000) + 900,
        controlExpiresAt: Math.floor(Date.now() / 1000) + 86400, maxBytes: 4 * 1024 ** 3,
        allowedContentTypes: ['audio/mp4'],
        ...(state.mode ? { diarization: { enabled: true }, speakerResultContract: 'draft-speaker-attribution/v1' } : {}),
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
  f.state.loseUploadResponse = true;
  await assert.rejects(f.client.upload(f.operation, 'synthetic.m4a', f.file, async () => 'b'.repeat(64)));
  assert.equal(f.state.uploads, 1);
  const recovered = await f.client.upload(f.operation, 'synthetic.m4a', f.file, async () => { throw new Error('Must not hash/upload accepted work again'); });
  assert.equal(recovered.state, 'PROCESSING');
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
  await assert.rejects(f.client.read(f.operation, 'synthetic.m4a'));
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
