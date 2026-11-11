import test from 'node:test';
import assert from 'node:assert/strict';
import { services, serviceId, serviceForWorker } from './ServiceConfig.ts';
import { ProClient } from './ProClient.ts';

test('new-job default preserves staging; saved jobs resolve their own environment', () => {
  assert.equal(serviceId(null), 'staging');
  assert.equal(serviceId('production'), 'production');
  assert.equal(serviceId('openai'), 'openai');
  assert.throws(() => serviceId('unknown'));
  assert.equal(serviceForWorker(services.staging.workerURL), 'staging');
  assert.equal(serviceForWorker(services.production.workerURL), 'production');
  assert.throws(() => serviceForWorker('https://untrusted.test'));
});

test('service profiles remain isolated through save, wrong-environment validation and removal', async () => {
  const values = new Map();
  const store = { getItemAsync: async key => values.get(key) ?? null,
    setItemAsync: async (key, value) => { values.set(key, value); },
    deleteItemAsync: async key => { values.delete(key); } };
  const calls = [];
  const clients = Object.fromEntries(Object.entries({ staging: services.staging, production: services.production }).map(([id, config]) => [id,
    new ProClient(config.workerURL, config.routerURL, async (url, init) => {
      calls.push({ id, url });
      assert.equal(url, config.workerURL + '/api/transcriptions/identity');
      return init.headers.Authorization === `Bearer synthetic-${id}-key`
        ? Response.json({ success: true, accountScope: (id === 'staging' ? 'a' : 'b').repeat(64) })
        : Response.json({}, { status: 401 });
    }, store, async () => { throw new Error('No uploads in this test'); })]));
  await clients.staging.configure('synthetic-staging-key');
  assert.equal(await clients.production.profile(), undefined);
  await assert.rejects(clients.production.configure('synthetic-staging-key'));
  assert.equal(await clients.production.profile(), undefined);
  await clients.production.configure('synthetic-production-key');
  assert.equal((await clients.staging.profile()).key, 'synthetic-staging-key');
  await clients.production.remove();
  assert.equal(await clients.production.profile(), undefined);
  assert.equal((await clients.staging.profile()).key, 'synthetic-staging-key');
  assert.equal(calls.length, 3); // No automatic retry or other-environment fallback.
});
