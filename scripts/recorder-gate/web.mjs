import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { resolve, extname, sep, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { artifact, observe, requireThat, writeJSON, sha } from './core.mjs';

export async function serveExport(directory) {
  const root = resolve(directory);
  // Freeze the already-hashed export in memory; a later disk edit cannot silently
  // change what the smoke or Founder preview serves under the pinned identity.
  const identity = artifact(root);
  const files = new Map(identity.files.map(file => { const bytes=readFileSync(resolve(root,file.path)); requireThat(sha(bytes)===file.sha256,'export changed while reading'); return [resolve(root,file.path),bytes]; }));
  requireThat(artifact(root).sha256 === identity.sha256, 'export changed while snapshotting');
  const server = createServer((req, res) => {
    try {
      if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405);res.end();return; }
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const path = resolve(root, '.' + (name === '/' ? '/index.html' : name));
      requireThat(path.startsWith(root + sep) && files.has(path), 'not a file');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' })[extname(path)] ?? 'application/octet-stream');
      res.end(files.get(path));
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  return { url: `http://127.0.0.1:${server.address().port}/`, artifact: identity, close: () => new Promise(r => server.close(r)) };
}

export async function webObservation({ source, directory, output, fault, onFault = () => {} }) {
  const { chromium } = await import(pathToFileURL(join(source, 'examples/ai-recorder/node_modules/playwright/index.mjs')).href);
  const server = await serveExport(directory); let browser; const diagnostics = []; let fatal = false;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: [], serviceWorkers: 'block' });
    // Reject all non-loopback requests. No microphone permission or provider call.
    await context.route('**/*', async route => {
      const request = route.request(); const url = request.url();
      if (!url.startsWith(server.url) && !url.startsWith('data:') && !url.startsWith('blob:')) { fatal = true; diagnostics.push('external request blocked'); return route.abort(); }
      if (fault === 'missing-entry' && request.resourceType() === 'script') { onFault(); return route.fulfill({ status: 404, body: 'controlled missing entry' }); }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(1500);
    page.on('crash', () => { fatal = true; diagnostics.push('page crashed'); });
    page.on('pageerror', error => { fatal = true; diagnostics.push(error.message); });
    page.on('requestfailed', request => { fatal = true; diagnostics.push(`resource failed: ${new URL(request.url()).pathname}`); });
    page.on('response', response => { if (response.status() >= 400) { fatal = true; diagnostics.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`); } });
    await page.addInitScript(() => {
      window.__startupErrors = [];
      window.addEventListener('error', e => window.__startupErrors.push(String(e.message)));
      window.addEventListener('unhandledrejection', () => window.__startupErrors.push('unhandled rejection'));
    });
    const started = performance.now();
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    requireThat(performance.now() - started < 30000, 'navigation readiness timeout');
    const originalOrigin = await page.evaluate(() => performance.timeOrigin);
    const control = page.getByRole('button', { name: 'Start recording', exact: true });
    let termination;
    const observation = await observe({
      // Include navigation in readiness time rather than giving it a second timeout.
      launchedAt: started,
      probe: async () => {
        requireThat(!page.isClosed(), 'page closed');
        const state = await page.evaluate(() => ({ identity: String(performance.timeOrigin), foreground: document.visibilityState === 'visible' && document.hasFocus(), errors: window.__startupErrors }));
        return { alive: true, identity: state.identity, foreground: state.foreground, ready: await control.isVisible(), fatal: fatal || state.errors.length > 0 || Number(state.identity) !== originalOrigin };
      },
      onReady: async () => { if (fault === 'terminate') termination = setTimeout(() => void page.close().then(onFault).catch(() => {}), 1000); },
      responsive: async () => {
        await page.getByRole('button', { name: 'Library', exact: true }).click();
        await page.getByRole('heading', { name: 'Library', exact: true }).waitFor({ state: 'visible' });
        await page.getByRole('button', { name: 'Record', exact: true }).click();
        await control.waitFor({ state: 'visible' }); return true;
      },
    }).finally(() => clearTimeout(termination));
    await page.screenshot({ path: join(output, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await control.waitFor({ state: 'visible' });
    requireThat(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'narrow viewport overflow');
    await page.screenshot({ path: join(output, 'narrow.png'), fullPage: true });
    requireThat(!fatal, 'browser diagnostic failure');
    requireThat(artifact(directory).sha256 === server.artifact.sha256, 'export changed during observation');
    return { observation, diagnostics, runtime: `Chromium ${browser.version()}`, target: 'clean Chromium context; loopback production export', artifact: server.artifact, monitor_started_before_launch: true };
  } finally { writeJSON(join(output, 'browser-diagnostics.json'), { fatal, diagnostics, runtime: browser?.version() ?? 'UNKNOWN' }); await browser?.close(); await server.close(); }
}
