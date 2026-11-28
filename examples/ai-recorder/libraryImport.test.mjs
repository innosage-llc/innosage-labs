import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importLibraryAudio, importActionState } from './libraryImport.ts';
import { noPlayableSamples } from './scripts/fixtures/library-import.mjs';

const valid = readFileSync(new URL('./scripts/fixtures/recorder-test-tone.m4a', import.meta.url));
const id = 'Import-1720000000000-fixture.m4a';
function selection(bytes = valid, override = {}) {
  return { name: 'Clip.M4A', size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, offset + length),
    decodedSamples: async () => 1024, commit: async () => {}, dispose() {}, ...override };
}

test('only idle Library actions can start an import', () => {
  const onPress = () => {};
  for (const phase of ['idle', 'recording', 'saving', 'importing']) {
    const action = importActionState(phase, onPress);
    assert.equal(action.disabled, phase !== 'idle');
    assert.equal(action.accessibilityName, phase === 'importing' ? 'Importing audio' : 'Import audio');
    assert.equal(action.placement, 'top-trailing');
  }
});

test('cancel, wrong suffix, empty, read failure, malformed media and zero decoded samples never save', async () => {
  const cases = [
    [undefined, 'cancelled'], [selection(valid, { name: 'audio.webm' }), 'unsupported'],
    [selection(Buffer.alloc(0)), 'unavailable'], [selection(valid, { read: () => { throw Error(); } }), 'unavailable'],
    [selection(Buffer.from('not audio')), 'malformed'],
    [selection(noPlayableSamples(valid), { decodedSamples: async () => 0 }), 'malformed'],
  ];
  for (const [item, expected] of cases) {
    let disposed = 0, allocated = 0;
    if (item) item.dispose = () => { disposed++; };
    assert.deepEqual(await importLibraryAudio(async () => item, () => { allocated++; return id; }), { kind: expected });
    assert.equal(allocated, 0);
    assert.equal(disposed, item ? 1 : 0);
  }
});

test('storage failure permits a fresh attempt and returns only the committed identity', async () => {
  const receipts = [];
  const pick = async () => selection(valid, { commit: async name => {
    receipts.push(name);
    if (receipts.length === 1) throw Error('storage unavailable');
  } });
  assert.deepEqual(await importLibraryAudio(pick, () => id), { kind: 'saveFailed' });
  assert.deepEqual(await importLibraryAudio(pick, () => id), { kind: 'saved', id });
  assert.deepEqual(receipts, [id, id]);
});
