// Local production export + real Chromium controls. Chrome generates the microphone signal.
// Every provider response is deterministic. No traffic to external origins is permitted.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveExport } from '../../../scripts/recorder-gate/web.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const stage = JSON.parse(await readFile(join(app, 'recorder-free-targets.json'), 'utf8')).staging;
const original = 'Synthetic original transcript.';
const revision = 'Synthetic saved revision.';
const summary = 'Synthetic summary of the saved revision.';
const fakeKey = ['sk', 'local-fixture-only'].join('-');
const label = 'Recorder parity test.m4a';
// 3 seconds of synthesized 478 Hz tone, mono AAC in an M4A container.
const audio = await readFile(new URL('./fixtures/recorder-test-tone.m4a', import.meta.url));
const temporary = process.argv[2] ? undefined : await mkdtemp(join(tmpdir(), 'recorder-browser-parity-'));
const directory = temporary ?? resolve(process.argv[2]);
let browser, server;
try {
  if (temporary) {
    const result = spawnSync(process.execPath, ['node_modules/expo/bin/cli', 'export', '--platform', 'web', '--output-dir', directory], {
      cwd: app, stdio: 'inherit', env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1',
        EXPO_PUBLIC_RECORDER_GATEWAY_URL: stage },
    });
    assert.equal(result.status, 0, 'Production Web export failed');
  }
  server = await serveExport(directory);
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: () => false }));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const calls = [];
  let operationURL;
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === new URL(server.url).origin || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
    const method = request.method();
    const reply = (json, status = 200) => route.fulfill({ json, status, headers: {
      'access-control-allow-origin': new URL(server.url).origin, 'access-control-allow-headers': 'authorization,content-type,x-identify-speakers',
      'access-control-allow-methods': 'GET,PUT,POST,OPTIONS' } });
    try {
      if (url.origin === new URL(stage).origin || url.origin === 'https://api.openai.com') {
        if (method === 'OPTIONS') return reply({});
      }
      if (url.href === stage + '/v1/guests' && method === 'POST') {
        calls.push('guest');
        return reply({ token: 'local-only-'.repeat(7), environment: 'staging' }, 201);
      }
      if (url.href.startsWith(stage + '/v1/jobs/') && method === 'PUT') {
        calls.push('upload');
        assert.equal(operationURL, undefined, 'Duplicate upload');
        assert.deepEqual(request.postDataBuffer(), audio);
        operationURL = url.href;
        return reply({ error: 'simulated temporary gateway outage' }, 503);
      }
      if (operationURL && url.href === operationURL && method === 'GET') {
        calls.push('recover');
        return reply({ state: 'COMPLETED', transcript: original });
      }
      if (url.origin === 'https://api.openai.com') {
        assert.equal(request.headers().authorization, 'Bearer ' + fakeKey);
        if (url.pathname === '/v1/models/gpt-transcribe' && method === 'GET') {
          calls.push('verify key');
          return reply({ id: 'gpt-transcribe' });
        }
        if (url.pathname === '/v1/models' && method === 'GET') {
          calls.push('list models');
          return reply({ data: [{ id: 'gpt-5.6' }] });
        }
        if (url.pathname === '/v1/responses' && method === 'POST') {
          calls.push('summary');
          const input = request.postDataJSON();
          assert.equal(input.input, revision);
          assert.equal(input.store, false);
          assert.equal(input.tools, undefined);
          return reply({ status: 'completed', output: [{ type: 'message', role: 'assistant',
            content: [{ type: 'output_text', text: summary }] }] });
        }
      }
      throw new Error('Unexpected outbound route: ' + method + ' ' + url.origin + url.pathname);
    } catch (error) { errors.push(error.message); return route.abort(); }
  });
  const button = name => page.getByRole('button', { name, exact: true });
  const click = name => button(name).click();
  const visible = text => page.getByText(text, { exact: true }).first().waitFor();
  const download = async name => {
    const event = page.waitForEvent('download');
    await click(name);
    const downloaded = await event;
    return readFile(await downloaded.path());
  };
  const openRecording = async () => {
    await click('Library');
    await page.getByText(label, { exact: true }).click();
  };
  try {
    await page.goto(server.url);
    await click('Start recording');
    await button('Stop & save').waitFor();
    await page.waitForTimeout(1200); // Let the synthetic input produce an encoded audio chunk.
    await click('Stop & save');
    await visible('Saved on this device');
    await click('Settings');
    await click('Choose service and manage keys');
    const service = page.getByRole('combobox', { name: 'Transcription service' });
    await service.selectOption('openai');
    await page.getByLabel('OpenAI API key', { exact: true }).fill(fakeKey);
    await click('Verify and save key');
    await visible('Key saved');
    await service.selectOption('staging');
    await visible('Default saved for new transcriptions. Existing jobs keep their service.');
    await click('Back to settings');
    await click('Library');
    const chooser = page.waitForEvent('filechooser');
    await click('Import audio');
    await (await chooser).setFiles({ name: label, mimeType: 'audio/mp4', buffer: audio });
    await page.getByText(label, { exact: true }).click();
    assert.deepEqual(await download('Share audio for ' + label), audio);
    await click('Play ' + label);
    await click('Pause ' + label);
    const slider = page.getByRole('slider');
    await slider.focus();
    await slider.press('End');
    assert.ok(Number(await slider.inputValue()) > 2, 'Could not seek the three-second file');
    await click('Transcript for ' + label);
    await button('Transcribe').waitFor();
    assert.deepEqual(calls, ['verify key']);
    await click('Transcribe');
    await click('Check status');
    await visible(original);
    await click('Edit transcript');
    await page.getByRole('textbox').fill(revision);
    await click('Save revision');
    await visible(revision);
    await click('View original');
    await visible(original);
    await click('Back to transcript');
    const markdown = (await download('Save Markdown file')).toString('utf8');
    assert.ok(markdown.includes(revision) && !markdown.includes(original));
    await click('Summarize');
    await click('Meeting Essentials');
    await click('Choose OpenAI model');
    await click('gpt-5.6');
    await click('Source: Original · Switch to saved revision');
    await click('Generate summary');
    await visible(summary);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload();
    await openRecording();
    assert.deepEqual(await download('Share audio for ' + label), audio);
    await click('Transcript for ' + label);
    await visible(revision);
    await click('View original');
    await visible(original);
    await click('Back to transcript');
    await click('Open summary');
    await visible(summary);
    assert.deepEqual(calls, ['verify key', 'guest', 'upload', 'recover', 'list models', 'summary']);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ runtime: 'Chromium ' + browser.version(), artifact: server.artifact.sha256,
      source: 'synthetic microphone and M4A', provider: 'local intercepted responses', passed: [
        'capture/save', 'service setting/key verification', 'file import', 'byte-exact share/download', 'play/pause/seek',
        'explicit upload and same-operation recovery', 'immutable original/edit', 'saved revision Markdown',
        'revision-sourced summary', 'offline audio, original, revision and summary reopen' ] }, null, 2));
  } catch (error) {
    console.error('Browser parity fixture failed:', await page.locator('body').innerText(), errors);
    throw error;
  }
} finally {
  await browser?.close();
  await server?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
