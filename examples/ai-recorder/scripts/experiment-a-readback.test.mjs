import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareBody } from './experiment-a-readback.mjs';

const { meeting, note } = JSON.parse(await readFile(new URL('../docs/release-verification/experiment-a/transcripts.json', import.meta.url)));
test('accepts the selected source including the final line and available attribution', () => {
  compareBody('meeting', 'file', '# Meeting\r\n\r\n' + meeting.edited.replaceAll('\n', '\r\n') + '\r\n');
  compareBody('note', 'page', note.original.replaceAll('\n\n', '\n'));
  compareBody('meeting', 'mcp', meeting.edited);
});
test('rejects stale, truncated, relabeled, contaminated, duplicate and wrong-page evidence', () => {
  for (const bad of [meeting.original, meeting.edited.slice(0, -1), meeting.edited.replace('Alba:', 'Bo:'),
    note.original + '\n' + meeting.edited, meeting.edited + '\n' + meeting.edited, note.original]) {
    for (const stage of ['file', 'page', 'mcp']) assert.throws(() => compareBody('meeting', stage, bad));
  }
});
test('export comparison preserves paragraph boundaries and disallows joined lines', () => {
  assert.throws(() => compareBody('note', 'file', note.original.replaceAll('\n\n', '\n')));
  assert.throws(() => compareBody('note', 'page', note.original.replaceAll('\n', '')));
});
