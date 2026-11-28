import assert from 'node:assert/strict';

export async function verifySubmissionLifecycle(browser, root, audio) {
  const context = await browser.newContext();
  const label = 'Local recovery.m4a', result = 'Synthetic OpenAI result recovered without resending.';
  const fakeKey = ['sk','local-recovery-test'].join('-');
  const calls = [], unexpected = [];
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === new URL(root).origin || ['data:','blob:'].includes(url.protocol)) return route.continue();
    const reply = json => route.fulfill({ json, headers: {
      'access-control-allow-origin':new URL(root).origin,'access-control-allow-headers':'authorization,content-type',
      'access-control-allow-methods':'GET,POST,OPTIONS' } });
    if (url.origin === 'https://api.openai.com') {
      if (request.method() === 'OPTIONS') return reply({});
      if (request.headers().authorization === 'Bearer ' + fakeKey) {
        if (url.pathname === '/v1/models/gpt-transcribe' && request.method() === 'GET') {
          calls.push('key'); return reply({ id:'gpt-transcribe' });
        }
        if (url.pathname === '/v1/audio/transcriptions' && request.method() === 'POST') {
          if (!request.postDataBuffer()?.includes(audio)) unexpected.push('different submitted audio');
          calls.push('transcription'); return reply({ text:result });
        }
      }
    }
    unexpected.push(request.method() + ' ' + url.origin + url.pathname); return route.abort();
  });
  const click = (page, name) => page.getByRole('button',{name,exact:true}).click();
  const see = (page,text) => page.getByText(text,{exact:true}).first().waitFor();
  const open = async page => {
    await click(page,'Library'); await page.getByText(label,{exact:true}).click(); await click(page,'Transcript for ' + label);
  };
  try {
    let page = await context.newPage();
    await page.goto(root); await click(page,'Library');
    const picker = page.waitForEvent('filechooser'); await click(page,'Import audio');
    await(await picker).setFiles({name:label,mimeType:'audio/mp4',buffer:audio});
    await page.getByText(label,{exact:true}).click(); await click(page,'Transcript for ' + label);
    // Hold only the detached local decoder on this particular submission.
    await page.evaluate(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function() {
        if (this.muted && !this.isConnected) {
          window.heldDecoder = this; HTMLMediaElement.prototype.play = play;
          return new Promise((resolve,reject) => { window.resumeDecoder = () => play.call(this).then(resolve,reject); });
        }
        return play.call(this);
      };
    });
    await click(page,'Transcribe');
    await page.waitForFunction(() => !!window.heldDecoder);
    await click(page,'Back to recording details');
    await page.getByRole('button',{name:'Back to Library',exact:true}).waitFor();
    await page.waitForFunction(() => !window.heldDecoder.hasAttribute('src'), {}, {timeout:1200});
    await page.evaluate(() => { window.resumeDecoder(); }); await page.waitForTimeout(100);
    assert.deepEqual(calls,[]); assert.deepEqual(unexpected,[]);
    await click(page,'Back to Library'); await click(page,'Settings'); await click(page,'Choose service and manage keys');
    await page.getByRole('combobox',{name:'Transcription service'}).selectOption('openai');
    await page.getByLabel('OpenAI API key',{exact:true}).fill(fakeKey); await click(page,'Verify and save key');
    await see(page,'Key saved'); await click(page,'Back to settings'); await open(page);
    await page.evaluate(() => {
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function(value,key) {
        const request = add.call(this,value,key);
        if (this.name === 'files' && String(key).endsWith('.original.txt')) this.transaction.abort();
        return request;
      };
    });
    await click(page,'Transcribe'); await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();
    await see(page,'Transcription is ready. Retry saving before closing this screen.');
    assert.deepEqual(calls,['key','transcription']);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.close(); // destroy the only tab that received the provider response
    await context.setOffline(true);
    page = await context.newPage(); await page.goto(root); await open(page);
    await see(page,'Transcript received. Retry saving it on this device.');
    await click(page,'Retry save'); await see(page,result);
    await page.reload(); await open(page); await see(page,result);
    assert.deepEqual(calls,['key','transcription']); assert.deepEqual(unexpected,[]);
  } finally { await context.close(); }
}
