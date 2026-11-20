import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { basename } from 'node:path';
import { beforeEach, test } from 'node:test';

const files = new Map();
const directories = new Map();
const fileTimes = new Map();
let freeSpace;
let copies;
let failCopy;
let failMarker;
const shown = [];
const Platform = { OS: 'android' };
let whileChooserOpen;

class Entry {
  constructor(parent, name) {
    this.uri = name === undefined ? parent : parent.uri + '/' + name;
  }
  get name() { return basename(this.uri); }
}

class Directory extends Entry {
  get exists() { return directories.has(this.uri); }
  create() { if (!this.exists) directories.set(this.uri, Date.now()); }
  info() { return { modificationTime: directories.get(this.uri) }; }
  delete() {
    directories.delete(this.uri);
    for (const key of files.keys()) {
      if (key.startsWith(this.uri + '/')) {
        files.delete(key);
        fileTimes.delete(key);
      }
    }
  }
  list() { return [...directories.keys()].filter(uri => uri.startsWith(this.uri + '/')).map(uri => new Directory(uri)); }
}

class File extends Entry {
  get exists() { return files.has(this.uri); }
  get size() { return files.get(this.uri)?.length ?? 0; }
  get lastModified() { return this.exists ? fileTimes.get(this.uri) ?? 1_000 : null; }
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
  async write(value) {
    if (failMarker) throw new Error('no space for cache metadata');
    files.set(this.uri, value);
    fileTimes.set(this.uri, Date.now());
  }
}

// The native modules cannot load under Node. Exercise the production service
// with in-memory replacements for filesystem, hashing and chooser operations.
globalThis.recorderShareTestModules = {
  Directory,
  File,
  Platform,
  Paths: { cache: new Directory('file:///cache'), get availableDiskSpace() { return freeSpace; } },
  CryptoDigestAlgorithm: { SHA256: 'sha256' },
  digestStringAsync: async (algorithm, value) => createHash(algorithm).update(value).digest('hex'),
  isAvailableAsync: async () => true,
  shareAsync: async (uri, options) => {
    shown.push({ uri, options, audio: files.get(uri) });
    whileChooserOpen?.();
  },
};
const exportsByPackage = {
  'expo-file-system': 'Directory, File, Paths',
  'expo-crypto': 'CryptoDigestAlgorithm, digestStringAsync',
  'expo-sharing': 'isAvailableAsync, shareAsync',
  'react-native': 'Platform',
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
  fileTimes.clear();
  shown.length = 0;
  freeSpace = 13;
  copies = 0;
  failCopy = false;
  failMarker = false;
  whileChooserOpen = undefined;
  Platform.OS = 'android';
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
  assert.equal(files.get(shown[0].uri), 'marker first');
});

test('a missing source has no chooser action even if its shared copy survives', async () => {
  const recording = new File('file:///recordings/second.m4a');
  files.set(recording.uri, 'marker second');
  assert.equal(await shareRecording(recording, 'Second.m4a'), 'dismissed');
  files.delete(recording.uri);
  assert.equal(await shareRecording(recording, 'Second.m4a'), 'missing');
  assert.equal(shown.length, 1);
});

test('the chooser still gets a complete copy when its cache marker cannot be written', async () => {
  const recording = new File('file:///recordings/marker.m4a');
  files.set(recording.uri, 'marker fresh');
  failMarker = true;
  assert.equal(await shareRecording(recording, 'Marker.m4a'), 'dismissed');
  assert.equal(await shareRecording(recording, 'Marker.m4a'), 'dismissed');
  assert.equal(copies, 1);
  assert.equal(shown.length, 2);
  assert.equal(shown[1].audio, 'marker fresh');
});

test('cleanup preserves a recently dismissed share and removes abandoned stale staging', async (context) => {
  const day = 24 * 60 * 60 * 1000;
  context.mock.timers.enable({ apis: ['Date'], now: day * 2 });
  const staging = new Directory('file:///cache/recording-shares');
  const stale = new Directory(staging, 'f'.repeat(64));
  stale.create();
  const first = new File('file:///recordings/long-open.m4a');
  const second = new File('file:///recordings/new.m4a');
  files.set(first.uri, 'marker first');
  files.set(second.uri, 'marker second');
  freeSpace = 64;
  whileChooserOpen = () => context.mock.timers.tick(day + 1);
  assert.equal(await shareRecording(first, 'First.m4a'), 'dismissed');
  assert.equal(stale.exists, true);
  whileChooserOpen = undefined;
  assert.equal(await shareRecording(second, 'Second.m4a'), 'dismissed');
  assert.equal(stale.exists, false);
  assert.equal(files.get(shown[0].uri), 'marker first');
});

test('keeps Android MIME explicit and lets iOS infer audio from the original M4A extension', async () => {
  const recording = new File('file:///recordings/platform-test.m4a');
  files.set(recording.uri, 'marker sample');
  assert.equal(await shareRecording(recording, 'Platform.m4a'), 'dismissed');
  assert.deepEqual(shown[0].options, { mimeType: 'audio/mp4' });
  Platform.OS = 'ios';
  assert.equal(await shareRecording(recording, 'Platform.m4a'), 'dismissed');
  assert.equal(shown[1].options, undefined);
  assert.match(shown[1].uri, /\.m4a$/);
});

test('recovers the staged copy after the same immutable recording moves to a new app container', async () => {
  const first = new File('file:///before/recordings/unique.m4a');
  const after = new File('file:///after/recordings/unique.m4a');
  files.set(first.uri, 'marker first');
  assert.equal(await shareRecording(first, 'Unique.m4a'), 'dismissed');
  files.delete(first.uri);
  files.set(after.uri, 'marker first');
  assert.equal(await shareRecording(after, 'Unique.m4a'), 'dismissed');
  assert.equal(shown[0].uri, shown[1].uri);
  assert.equal(copies, 1);
});
