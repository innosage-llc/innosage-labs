import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

// Exercise the exact bundled service worker with two valid static releases and
// a broken deploy whose server returns an HTTP-200 HTML fallback for a script.
export async function verifyShellUpgrade(browser, directory) {
  const worker = await readFile(join(directory, 'recorder-offline.js'));
  let version = 'one';
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    response.setHeader('Cache-Control', 'no-store');
    if (pathname === '/recorder-offline.js') {
      response.setHeader('Content-Type', 'application/javascript'); response.end(worker); return;
    }
    if (pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<main></main><script src="/_expo/static/' + version + '.js"></script>'); return;
    }
    if (pathname === '/_expo/static/broken.js') {
      response.setHeader('Content-Type', 'text/html'); response.end('<main>fallback</main>'); return;
    }
    for (const name of ['one', 'two', 'three']) {
      if (pathname === '/_expo/static/' + name + '.js') {
        response.setHeader('Content-Type', 'application/javascript');
        response.end('document.querySelector("main").textContent=' + JSON.stringify(name) + ';navigator.serviceWorker.register("/recorder-offline.js")'); return;
      }
    }
    response.writeHead(404); response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const context = await browser.newContext();
  try {
    const root = 'http://127.0.0.1:' + server.address().port + '/';
    const page = await context.newPage();
    await page.goto(root);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    for (const [candidate, expected] of [['two', 'two'], ['broken', 'two'], ['three', 'three']]) {
      version = candidate;
      await page.goto(root);
      await page.getByText(expected, { exact: true }).waitFor();
    }
    const cachesAfterUpdate = await page.evaluate(() => caches.keys());
    assert.equal(cachesAfterUpdate.length, 3, 'Expected two complete releases and the registry');
    await context.setOffline(true);
    await page.goto(root + '?launch=offline');
    await page.getByText('three', { exact: true }).waitFor();
  } finally {
    await context.close();
    await new Promise(resolve => server.close(resolve));
  }
}
