import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { noPlayableSamples, unreadablePayload } from './fixtures/library-import.mjs';
import { serveExport } from '../../../scripts/recorder-gate/web.mjs';

// Reuse the startup gate's export. This suite uses a fresh browser context and intercepts only storage faults.
const [directory, out] = process.argv.slice(2);
const audio = await readFile(new URL('./fixtures/recorder-test-tone.m4a', import.meta.url));
const digest = createHash('sha256').update(audio).digest('hex');
const server = await serveExport(directory);
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  const outbound = [];
  await context.route(/^https?:/, route => {
    if (new URL(route.request().url()).origin === new URL(server.url).origin) return route.continue();
    outbound.push(route.request().url()); return route.abort();
  });
  await context.addInitScript(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      const request = add.call(this, value, key);
      if (window.failImport && this.name === 'files' && value.content instanceof Blob && /^Import-/.test(key)) {
        window.failImport = false;
        this.transaction.abort();
      }
      return request;
    };
  });
  const page = await context.newPage();
  let choosers = 0;
  page.on('filechooser', () => choosers++);
  const button = name => page.getByRole('button', { name, exact: true });
  const action = button('Import audio');
  await page.goto(server.url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await button('Library').click();
  assert.equal(await action.count(), 1);
  const open = page.waitForEvent('filechooser');
  await action.focus();
  await page.keyboard.press('Enter');
  const first = await open;
  await page.keyboard.press('Enter');
  // Simulate the browser's cancel notification on the actual pending input.
  await first.element().dispatchEvent('cancel');
  await action.waitFor();
  assert.equal(choosers, 1);
  const select = async (name, buffer) => {
    const next = page.waitForEvent('filechooser');
    await action.click();
    await (await next).setFiles({name, mimeType:'audio/mp4', buffer});
  };
  async function saved(active = page) {
    return active.evaluate(async () => {
      const db = await new Promise(resolve => { const req = indexedDB.open('innosage.audio-recorder'); req.onsuccess = () => resolve(req.result); });
      try {
        const rows = await new Promise(resolve => {const req = db.transaction('files').objectStore('files').getAll(); req.onsuccess = () => resolve(req.result);});
        return Promise.all(rows.map(async ({name, content}) => ({name, value: content instanceof Blob
          ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await content.arrayBuffer())), b => b.toString(16).padStart(2,'0')).join('') : content})));
      } finally { db.close(); }
    });
  }
  assert.deepEqual(await saved(), []);
  await select('Forged.m4a', noPlayableSamples(audio));
  await page.getByText('Choose an M4A containing an MP4 audio track.', {exact:true}).waitFor();
  assert.deepEqual(await saved(), []);
  await select('DamagedPackets.m4a', unreadablePayload(audio));
  await action.waitFor();
  await page.getByText('Choose an M4A containing an MP4 audio track.', {exact:true}).waitFor();
  assert.deepEqual(await saved(), []);
  const label = 'Library tone.m4a';
  await page.evaluate(() => { window.failImport = true; });
  await select(label, audio);
  await page.getByText('Could not import the audio. Check available storage and try again.', {exact:true}).waitFor();
  assert.deepEqual(await saved(), []);
  await select(label, audio);
  await page.getByText(label, {exact:true}).waitFor();
  const rows = await saved();
  assert.equal(rows.length, 2);
  const id = rows.find(row => row.value === digest)?.name;
  assert.match(id, /^Import-.+\.m4a$/);
  assert.deepEqual(rows.find(row => row.name === id + '.name'), {name:id + '.name',value:label});
  await page.screenshot({path:join(out, 'library-web.png')});
  await page.close();
  await context.setOffline(true);
  const cold = await context.newPage();
  await cold.goto(server.url);
  await cold.getByRole('button', {name:'Library', exact:true}).click();
  await cold.getByText(label, {exact:true}).click();
  await cold.getByRole('button', {name:'Play ' + label, exact:true}).click();
  await cold.getByRole('button', {name:'Pause ' + label, exact:true}).waitFor();
  await cold.waitForFunction(() => {
    const range = document.querySelector('input[type=range]');
    return range && range.valueAsNumber > 0;
  });
  assert.deepEqual(await saved(cold), rows);
  assert.deepEqual(outbound, []);
  await writeFile(join(out,'library-web.json'), JSON.stringify({id, sha256:digest, chooserCount:choosers,
    artifact:server.artifact.sha256, browser:browser.version(), cases:['cancel','repeat','forged','damaged','save-failure','retry','offline-playback']}));
} finally { await browser.close(); await server.close(); }
