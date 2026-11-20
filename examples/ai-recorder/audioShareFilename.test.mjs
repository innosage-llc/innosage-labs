import assert from 'node:assert/strict';
import test from 'node:test';
import { audioShareFilename } from './audioShareFilename.ts';

test('uses a recognizable recording name with one M4A extension', () => {
  assert.equal(audioShareFilename('Field notes.M4A'), 'AI Recorder - Field notes.m4a');
  assert.equal(audioShareFilename('2026/11/20, 9:30 AM'), 'AI Recorder - 2026 11 20, 9 30 AM.m4a');
});

test('removes path separators, special characters and bidi controls', () => {
  assert.equal(audioShareFilename('../clip\\part:one?.m4a'), 'AI Recorder - clip part one.m4a');
  assert.equal(audioShareFilename('x\u202ey\u0000.m4a'), 'AI Recorder - x y.m4a');
  assert.equal(audioShareFilename('..\\?.m4a'), 'AI Recorder.m4a');
});

test('keeps a long Unicode label under the filename byte limit', () => {
  const name = audioShareFilename('会议🎙'.repeat(120) + '.m4a');
  assert.match(name, /^AI Recorder - 会议🎙.*\.m4a$/u);
  assert.ok(Buffer.byteLength(name) <= 255);
});
