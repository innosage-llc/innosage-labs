import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { basename } from 'node:path';
import { beforeEach, test } from 'node:test';

const files = new Map();
const directories = new Set();
let freeSpace;
let copies;
let failCopy;
const shown = [];

class Entry {
  constructor(parent, name) {
    this.uri = name === undefined ? parent : parent.uri + '/' + name;
  }
  get name() { return basename(this.uri); }
}

class Directory extends Entry {
  get exists() { return directories.has(this.uri); }
  create() { directories.add(this.uri); }
  delete() {
    directories.delete(this.uri);
    for (const key of files.keys()) {
      if (key.startsWith(this.uri + '/')) files.delete(key);
    }
  }
  list() { return [...directories].filter(uri => uri.startsWith(this.uri + '/')).map(uri => new Directory(uri)); }
}

class File extends Entry {
  get exists() { return files.has(this.uri); }
  get size() { return files.get(this.uri)?.length ?? 0; }
  get lastModified() { return this.exists ? 1_000 : null; }
  async copy(destination) {
    ++copies;
    files.set(destination.uri, failCopy ? 'partial' : files.get(this.uri));
    if (failCopy) throw new Error('copy failed');
    freeSpace -= this.size;
  }
  async move(destination) {
    files.set(destination.uri, files.get(this.uri));
    files.delete(this.uri);
  }
  async write(value) { files.set(this.uri, value); }
}

// The native modules cannot load under Node. Exercise the production service
// with in-memory replacements for filesystem, hashing and chooser operations.
globalThis.recorderShareTestModules = {
  Directory,
  File,
  Paths: { cache: new Directory('file:///cache'), get availableDiskSpace() { return freeSpace; } },
  CryptoDigestAlgorithm: { SHA256: 'sha256' },
  digestStringAsync: async (algorithm, value) => createHash(algorithm).update(value).digest('hex'),
  isAvailableAsync: async () => true,
  shareAsync: async (uri, options) => { shown.push({ uri, options, audio: files.get(uri) }); },
};
const exportsByPackage = {
  'expo-file-system': 'Directory, File, Paths',
  'expo-crypto': 'CryptoDigestAlgorithm, digestStringAsync',
  'expo-sharing': 'isAvailableAsync, shareAsync',
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './audioShareFilename') return next('./audioShareFilename.ts', context);
    const names = exportsByPackage[specifier];
    if (!names) return next(specifier, context);
    return {
      url: 'data:text/javascript,' + encodeURIComponent(`export const { ${names} } = globalThis.recorderShareTestModules;`),
      shortCircuit: true,
    };
  },
});
const { shareRecording } = await import('./recordingShare.ts');
hooks.deregister();

beforeEach(() => {
  files.clear();
  directories.clear();
  shown.length = 0;
  freeSpace = 13;
  copies = 0;
  failCopy = false;
});

test('retry after chooser dismissal reuses the complete copy even if there is room for only one', async () => {
  const recording = new File('file:///recordings/first.m4a');
  files.set(recording.uri, 'marker first');
  assert.equal(await shareRecording(recording, 'First.m4a'), 'dismissed');
  assert.equal(await shareRecording(recording, 'First.m4a'), 'dismissed');
  assert.equal(copies, 1);
  assert.equal(shown.length, 2);
  assert.equal(shown[0].uri, shown[1].uri);
  assert.equal(shown[1].audio, 'marker first');
  assert.equal(files.get(recording.uri), 'marker first');
});

test('a failed copy is never shared or reused, and a second recording gets its own URI', async () => {
  const first = new File('file:///recordings/first.m4a');
  const recording = new File('file:///recordings/second.m4a');
  files.set(first.uri, 'marker first');
  files.set(recording.uri, 'marker second');
  freeSpace = 64;
  assert.equal(await shareRecording(first, 'First.m4a'), 'dismissed');
  failCopy = true;
  assert.equal(await shareRecording(recording, 'Second.m4a'), 'failed');
  assert.equal(shown.length, 1);
  assert.equal([...files.keys()].some(key => key.endsWith('/.copying')), false);
  failCopy = false;
  assert.equal(await shareRecording(recording, 'Second.m4a'), 'dismissed');
  assert.notEqual(shown[0].uri, shown[1].uri);
  assert.equal(shown[1].audio, 'marker second');
});

test('a missing source has no chooser action even if its shared copy survives', async () => {
  const recording = new File('file:///recordings/second.m4a');
  files.set(recording.uri, 'marker second');
  assert.equal(await shareRecording(recording, 'Second.m4a'), 'dismissed');
  files.delete(recording.uri);
  assert.equal(await shareRecording(recording, 'Second.m4a'), 'missing');
  assert.equal(shown.length, 1);
});
