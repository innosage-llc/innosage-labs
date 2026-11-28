import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { beforeEach, test } from 'node:test';

const directories = new Map();
const files = new Map();
const day = 24 * 60 * 60 * 1000;
const root = '/cache/transcript-exports';
let nextId;
let chooser;

class Entry {
  constructor(parent, name) { this.uri = name ? `${parent.uri}/${name}` : parent; }
}

class Directory extends Entry {
  get exists() { return directories.has(this.uri); }
  create() { if (!this.exists) directories.set(this.uri, Date.now()); }
  list() { return [...directories.keys()].filter(uri => uri.startsWith(`${this.uri}/`)).map(uri => new Directory(uri)); }
  info() { return { modificationTime: directories.get(this.uri) }; }
  delete() {
    directories.delete(this.uri);
    for (const key of files.keys()) if (key.startsWith(`${this.uri}/`)) files.delete(key);
  }
}

class File extends Entry {
  create() { files.set(this.uri, { content: '', time: Date.now() }); }
  get lastModified() { return files.get(this.uri)?.time; }
  async write(content) {
    await Promise.resolve();
    files.set(this.uri, { content, time: Date.now() });
  }
}

globalThis.iosMarkdownTestModules = {
  Directory, File, Paths: { cache: new Directory('/cache') }, randomUUID: () => `attachment-${++nextId}`,
  isAvailableAsync: async () => true, shareAsync: uri => chooser(uri),
};
const packages = {
  'expo-file-system': 'Directory, File, Paths', 'expo-crypto': 'randomUUID', 'expo-sharing': 'isAvailableAsync, shareAsync',
};
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (!packages[specifier]) return next(specifier, context);
  const code = `export const { ${packages[specifier]} } = globalThis.iosMarkdownTestModules;`;
  return { url: 'data:text/javascript,' + encodeURIComponent(code), shortCircuit: true };
} });
const { pruneTranscriptShareCache, transferTranscript } = await import('./transcriptTransfer.ios.ts');
hooks.deregister();

beforeEach(() => {
  directories.clear();
  files.clear();
  nextId = 0;
  chooser = async () => {};
});

test('startup cleanup expires stale exports and leaves unrelated app files intact', ({ mock }) => {
  mock.timers.enable({ apis: ['Date'], now: 1000 });
  new Directory(root).create();
  new Directory(`${root}/old-attachment`).create();
  files.set('/cache/other.md', { content: 'untouched' });
  mock.timers.tick(day + 1);
  pruneTranscriptShareCache();
  assert.equal(directories.has(`${root}/old-attachment`), false);
  assert.equal(files.get('/cache/other.md').content, 'untouched');
});

test('retains a long-open or dismissed share and expires it from dismissal', async ({ mock }) => {
  mock.timers.enable({ apis: ['Date'], now: 1000 });
  let notify;
  const opened = new Promise(resolve => { notify = resolve; });
  let dismiss;
  chooser = uri => {
    notify(uri);
    return new Promise(resolve => { dismiss = resolve; });
  };
  const sharing = transferTranscript('Transcript.md', 'Committed café', false);
  const url = await opened;
  assert.equal(files.get(url).content, 'Committed café');
  mock.timers.tick(day + 1);
  pruneTranscriptShareCache();
  assert.equal(files.has(url), true);
  dismiss();
  assert.equal(await sharing, 'dismissed');
  pruneTranscriptShareCache();
  assert.equal(files.has(url), true);
  mock.timers.tick(day + 1);
  pruneTranscriptShareCache();
  assert.equal(files.has(url), false);
});

test('failed transfer cleans its temporary attachment; retries create distinct URLs', async () => {
  const shown = [];
  chooser = async url => { shown.push(url); throw new Error('could not present'); };
  await assert.rejects(transferTranscript('Transcript.md', 'latest revision', false), /could not present/);
  assert.equal(files.has(shown[0]), false);
  chooser = async url => { shown.push(url); };
  assert.equal(await transferTranscript('Transcript.md', 'latest revision', false), 'dismissed');
  assert.notEqual(shown[1], shown[0]);
  assert.equal(files.get(shown[1]).content, 'latest revision');
});
