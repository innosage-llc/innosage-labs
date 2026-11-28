// Local production export + real Chromium controls. Chrome generates the microphone signal.
// Every provider response is deterministic. No traffic to external origins is permitted.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { verifyGuestOwnership } from './browser-guest-ownership.mjs';
import { verifyShellUpgrade } from './browser-shell-update.mjs';
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
        EXPO_PUBLIC_RECORDER_GATEWAY_URL: stage, EXPO_PUBLIC_RECORDER_PRODUCTION_GATEWAY_URL: '' },
    });
    assert.equal(result.status, 0, 'Production Web export failed');
  }
  server = await serveExport(directory);
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false });
    // Abort exactly the first finalized capture transaction. Preserve the
    // original fake-microphone Blob independently for a byte-for-byte readback.
    const add = IDBObjectStore.prototype.add;
    window.captureWrites = [];
    IDBObjectStore.prototype.add = function(value, key) {
      const request = add.call(this, value, key);
      if (this.name === 'files' && /^Recording-/.test(key) && value.content instanceof Blob) {
        window.captureWrites.push({ key, blob: value.content });
        if (window.captureWrites.length === 1) this.transaction.abort();
      }
      return request;
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const calls = [];
  let operationURL;
  let releaseUpload;
  const resume = new Promise(resolve => { releaseUpload = resolve; });
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
        assert.deepEqual(request.postDataBuffer(), audio);
        if (operationURL) {
          assert.equal(url.href, operationURL, 'Resumed upload changed operation');
          calls.push('resume upload');
          return reply({ state: 'COMPLETED', transcript: original });
        }
        calls.push('upload');
        operationURL = url.href;
        await resume;
        return reply({ error: 'simulated temporary gateway outage' }, 503);
      }
      if (operationURL && url.href === operationURL && method === 'GET') {
        calls.push('recover');
        return reply({ state: 'RESERVED' });
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
    await click('Retry saving recording');
    await visible('Saved on this device');
    const captured = await page.evaluate(async () => {
      const attempts = window.captureWrites;
      if (attempts.length !== 2 || attempts[0].key !== attempts[1].key) throw Error('Capture identity changed on retry');
      return Array.from(new Uint8Array(await attempts[0].blob.arrayBuffer()));
    });
    await click('View in Library');
    const capturedRow = page.getByRole('button', { name: /Just saved/ });
    const captureLabel = (await capturedRow.innerText()).split('\n')[0];
    const captureShare = 'Share audio for ' + captureLabel;
    await capturedRow.click();
    assert.deepEqual(await download(captureShare), Buffer.from(captured));
    await click('Back to Library');
    await click('Settings');
    await click('Choose service and manage keys');
    const service = page.getByRole('combobox', { name: 'Transcription service' });
    await service.selectOption('openai');
    await page.getByLabel('OpenAI API key', { exact: true }).fill(fakeKey);
    await click('Verify and save key');
    await visible('Key saved');
    await service.selectOption('staging');
    await visible('Default saved for new transcriptions. Existing jobs keep their service.');
    // Damage only the synthetic encrypted key and verify the actual replacement
    // path while a different service is selected.
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('innosage.audio-recorder'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put({ iv: new Uint8Array(12), ciphertext: new Uint8Array(1) }, 'value:recorder.openai.key');
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      });
      db.close();
    });
    await service.selectOption('openai');
    await visible('Saved key status is unavailable.');
    await click('Remove key');
    await visible('Key removed from this device.');
    await page.getByLabel('OpenAI API key', { exact: true }).fill(fakeKey);
    await click('Verify and save key');
    await visible('Key saved');
    await service.selectOption('staging');
    await visible('Default saved for new transcriptions. Existing jobs keep their service.');
    await click('Back to settings');
    await click('Library');
    const importFile = async (name, buffer, expected = name) => {
      const chooser = page.waitForEvent('filechooser');
      await click('Import audio');
      await (await chooser).setFiles({ name, mimeType: 'audio/mp4', buffer });
      await page.getByText(expected, { exact: true }).waitFor();
    };
    const unreadable = 'Unreadable duration fixture.m4a';
    await importFile('Renamed file.m4a', Buffer.from('OggS synthetic wrong container'), 'Choose an M4A containing an MP4 audio track.');
    const atom = (type, payload) => {
      const header = Buffer.alloc(8); header.writeUInt32BE(8 + payload.length); header.write(type, 4); return Buffer.concat([header, payload]);
    };
    const ftyp = atom('ftyp', Buffer.from('isom0000'));
    const handler = atom('hdlr', Buffer.concat([Buffer.alloc(8), Buffer.from('soun')]));
    const stsd = atom('stsd', Buffer.concat([Buffer.from([0,0,0,0,0,0,0,1]), atom('mp4a', Buffer.alloc(28))]));
    const mdia = atom('mdia', Buffer.concat([handler, atom('minf', atom('stbl', stsd))]));
    await importFile(unreadable, Buffer.concat([ftyp, atom('moov', atom('trak', mdia)), atom('mdat', Buffer.from([0]))]));
    await page.getByText(unreadable, { exact: true }).click();
    await click('Transcript for ' + unreadable);
    await click('Transcribe');
    await visible('Could not verify the recording duration for Free transcription. Check that the recording plays, then retry.');
    assert.deepEqual(calls, ['verify key', 'verify key'], 'Missing duration must stop before guest provision or upload');
    await click('Back to recording details');
    await click('Back to Library');
    await importFile(label, audio);
    await page.getByText(label, { exact: true }).click();
    assert.deepEqual(await download('Share audio for ' + label), audio);
    await click('Play ' + label);
    await click('Pause ' + label);
    const slider = page.getByRole('slider');
    const bounds = await slider.boundingBox();
    assert.ok(bounds, 'Seek control has no bounds');
    await slider.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
    // Expo publishes currentTime on the native media element's asynchronous seeked event.
    await page.waitForFunction(() => {
      const range = document.querySelector('input[type="range"]');
      return range && range.valueAsNumber > 1 && range.valueAsNumber < 2;
    });
    await click('Transcript for ' + label);
    await button('Transcribe').waitFor();
    assert.deepEqual(calls, ['verify key', 'verify key']);
    const other = await context.newPage();
    const otherClick = name => other.getByRole('button', { name, exact: true }).click();
    async function openOtherTranscript() {
      await other.goto(server.url);
      await otherClick('Library');
      await other.getByText(label, { exact: true }).click();
      await otherClick('Transcript for ' + label);
    }
    await openOtherTranscript();
    await other.getByRole('button', { name: 'Transcribe', exact: true }).waitFor();
    const sent = page.waitForRequest(req => req.url().startsWith(stage + '/v1/jobs/') && req.method() === 'PUT');
    await click('Transcribe');
    await sent;
    await otherClick('Transcribe');
    await other.getByText('Another tab is submitting this recording. Reopen the transcript to check its status.').waitFor();
    releaseUpload();
    await button('Check status').waitFor();
    await page.reload();
    await openRecording();
    await click('Transcript for ' + label);
    await click('Resume upload');
    await visible(original);
    await openOtherTranscript();
    await other.getByText(original, { exact: true }).waitFor();
    await otherClick('Edit transcript');
    await other.getByRole('textbox').fill('Conflicting synthetic edit');
    await click('Edit transcript');
    await page.getByRole('textbox').fill(revision);
    await click('Save revision');
    await visible(revision);
    await otherClick('Save revision');
    await other.getByText('Another tab saved a different revision. Copy your edits, then reopen the transcript to compare.').waitFor();
    await other.close();
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
    await page.goto(server.url + '?source=offline');
    await click('Library');
    await page.getByRole('button', { name: new RegExp('^' + captureLabel + '(?:,|$)') }).click();
    assert.deepEqual(await download(captureShare), Buffer.from(captured));
    await click('Play ' + captureLabel);
    await click('Pause ' + captureLabel);
    const captureRange = page.getByRole('slider');
    const captureBounds = await captureRange.boundingBox();
    await captureRange.click({ position: { x: captureBounds.width / 2, y: captureBounds.height / 2 } });
    await page.waitForFunction(() => {
      const r = document.querySelector('input[type="range"]'); return r && r.valueAsNumber > 0 && r.valueAsNumber < Number(r.max);
    });
    await click('Back to Library');
    await page.getByText(label, { exact: true }).click();
    assert.deepEqual(await download('Share audio for ' + label), audio);
    await click('Transcript for ' + label);
    await visible(revision);
    await click('View original');
    await visible(original);
    await click('Back to transcript');
    await click('Open summary');
    await visible(summary);
    assert.deepEqual(calls, ['verify key', 'verify key', 'guest', 'upload', 'recover', 'resume upload', 'list models', 'summary']);
    assert.deepEqual(errors, []);
    await verifyGuestOwnership(browser, server.url, stage, audio);
    await verifyShellUpgrade(browser, directory);
    console.log(JSON.stringify({ runtime: 'Chromium ' + browser.version(), artifact: server.artifact.sha256,
      source: 'synthetic microphone and M4A', provider: 'local intercepted responses', passed: [
        'capture storage failure, same-ID retry and offline byte-exact playback/seek', 'service setting/key verification', 'file import', 'byte-exact share/download', 'play/pause/seek',
        'unknown duration refused locally', 'explicit upload and same-operation recovery', 'two-tab submission, edit conflict and first-use guest ownership', 'immutable original/edit', 'saved revision Markdown',
        'revision-sourced summary', 'offline audio, original, revision and summary reopen', 'broken shell rollback, successful update and bounded cache' ] }, null, 2));
  } catch (error) {
    console.error('Browser parity fixture failed:', await page.locator('body').innerText(), errors);
    throw error;
  }
} finally {
  await browser?.close();
  await server?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
