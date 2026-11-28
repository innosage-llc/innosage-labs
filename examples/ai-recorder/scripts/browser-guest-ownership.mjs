import assert from 'node:assert/strict';

// Two different recordings have independent submission locks, but first-use guest
// provisioning must yield exactly one recoverable identity across the same origin.
export async function verifyGuestOwnership(browser, root, stage, audio) {
  const context = await browser.newContext();
  const names = ['Guest fixture A.m4a', 'Guest fixture B.m4a'];
  const jobs = new Set();
  const token = 'same-test-identity-'.repeat(4);
  let guests = 0, releaseGuest;
  const holdGuest = new Promise(resolve => { releaseGuest = resolve; });
  const errors = [];
  await context.route('**/*', async route => {
    const request = route.request();
    const url = request.url();
    if (url.startsWith(root) || /^(?:data|blob):/.test(url)) return route.continue();
    const reply = json => route.fulfill({ json, headers: {
      'access-control-allow-origin': new URL(root).origin,
      'access-control-allow-headers': 'authorization,content-type,x-identify-speakers',
      'access-control-allow-methods': 'GET,PUT,POST,OPTIONS' } });
    if (url.startsWith(stage + '/') && request.method() === 'OPTIONS') return reply({});
    if (url === stage + '/v1/guests' && request.method() === 'POST') {
      guests++; await holdGuest; return reply({ environment: 'staging', token });
    }
    if (url.startsWith(stage + '/v1/jobs/') && request.method() === 'PUT') {
      if (request.headers().authorization !== 'Bearer ' + token || !audio.equals(request.postDataBuffer())) errors.push('identity or audio mismatch');
      jobs.add(url);
      return reply({ state: 'COMPLETED', transcript: 'Synthetic shared-identity result.' });
    }
    errors.push('Unexpected request ' + request.method()); return route.abort();
  });
  try {
    const first = await context.newPage();
    const click = (page, name) => page.getByRole('button', { name, exact: true }).click();
    await first.goto(root);
    await click(first, 'Library');
    for (const name of names) {
      const chooser = first.waitForEvent('filechooser');
      await click(first, 'Import audio');
      await (await chooser).setFiles({ name, buffer: audio, mimeType: 'audio/mp4' });
      await first.getByText(name, { exact: true }).waitFor();
    }
    const second = await context.newPage();
    await second.goto(root);
    await click(second, 'Library');
    for (const [page, name] of [[first, names[0]], [second, names[1]]]) {
      await page.getByText(name, { exact: true }).click();
      await click(page, 'Transcript for ' + name);
      await page.getByRole('button', { name: 'Transcribe', exact: true }).waitFor();
    }
    const provisioning = first.waitForRequest(req => req.url() === stage + '/v1/guests' && req.method() === 'POST');
    await click(first, 'Transcribe');
    await provisioning;
    await click(second, 'Transcribe');
    releaseGuest();
    await Promise.all([first, second].map(page => page.getByText('Synthetic shared-identity result.', { exact: true }).waitFor()));
    assert.equal(guests, 1);
    assert.equal(jobs.size, 2);
    assert.deepEqual(errors, []);
  } finally { releaseGuest(); await context.close(); }
}
