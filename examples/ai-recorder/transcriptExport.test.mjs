import assert from 'node:assert/strict';
import test from 'node:test';
import { transcriptMarkdown } from './transcriptExport.ts';
import { draftStore, draftText } from './draftDocumentModel.ts';
import { prepareRecorderOpen } from './recorderDraftProtocol.ts';
import { compareBody } from './scripts/experiment-a-readback.mjs';
import { readFileSync } from 'node:fs';

const fixtures = JSON.parse(readFileSync(new URL('./docs/release-verification/experiment-a/transcripts.json', import.meta.url)));
const absent = async () => undefined;
const unused = async () => assert.fail('Must not touch an unselected source');
const recording = 'Recording-1704067200000-fixture.m4a';

test('exports the latest committed editor correction from its disk owner through the last line', async () => {
  let raw = null;
  const key = { pageId: 'fixture', kind: 'transcript' };
  const disk = { read: async () => raw, write: async data => { raw = data; } };
  const store = draftStore(key, disk);
  const { title, original, edited } = fixtures.meeting;
  for (const [index, text] of [original, edited].entries()) {
    await store.commit(index, prepareRecorderOpen(key.pageId, title, text).blocks);
  }
  const snapshot = await draftStore(key, disk).recover();
  const result = await transcriptMarkdown(title, recording, {
    readDraft: async () => ({ text: draftText(snapshot), revision: snapshot.revision }),
    readLegacy: unused, readOriginal: unused,
  });
  assert.equal(result.filename, 'Transcript - Experiment A meeting.md');
  assert.match(result.markdown, /Recorded: 2024-01-01T00:00:00.000Z/);
  assert.match(result.markdown, /Edited \(Draft revision 2\)/);
  compareBody('meeting', 'file', result.markdown);
});

test('exports the committed legacy revision or original-only voice note without altering the body', async () => {
  const { original } = fixtures.note;
  const { edited } = fixtures.meeting;
  const legacy = await transcriptMarkdown('older', recording, { readDraft: absent, readLegacy: async () => edited, readOriginal: unused });
  assert.match(legacy.markdown, /Edited \(saved revision\)/);
  compareBody('meeting', 'file', legacy.markdown);
  const note = await transcriptMarkdown(fixtures.note.title, 'Import-1704067200000-fixture.m4a', {
    readDraft: absent, readLegacy: absent, readOriginal: async () => ({ text: original }),
  });
  compareBody('note', 'file', Buffer.from(note.markdown, 'utf8').toString('utf8'));
  assert.match(note.markdown, /Imported: 2024-01-01T00:00:00.000Z/);
  assert.match(note.markdown, /Transcript source: Original/);
});

test('unreadable and empty saved sources never fall back', async () => {
  const broken = async () => { throw new Error('Unreadable'); };
  for (const sources of [
    [broken, unused, unused], [absent, broken, unused], [absent, absent, broken],
    [async () => ({ text: '', revision: 1 }), unused, unused], [absent, async () => '   ', unused],
    [absent, absent, absent],
  ]) {
    const [readDraft, readLegacy, readOriginal] = sources;
    await assert.rejects(transcriptMarkdown('meeting', recording, { readDraft, readLegacy, readOriginal }), /Unreadable|no saved text/);
  }
});

test('handles long multilingual display names, control characters, missing dates and exact whitespace', async () => {
  const body = '[00:03.800] Speaker 2: 好。\r\n\r\nfin  \n';
  const result = await transcriptMarkdown('../案:\n' + '🦉'.repeat(110), 'old-recording.m4a', {
    readDraft: absent, readLegacy: absent, readOriginal: async () => ({ text: body }),
  });
  assert.match(result.filename, /^Transcript - 案 🦉+\.md$/u);
  assert.ok(Buffer.byteLength(result.filename) <= 255);
  assert.ok(result.markdown.endsWith(body));
  assert.match(result.markdown, /Recorded: Unknown/);
});

test('original-only exports retain the verbatim recording and full separate speaker timeline', async () => {
  const text = '[00:00.000 - 00:02.000] 你好，世界。\n\nLast line.';
  const attribution = '[00:00.000] Speaker 1: 你\n[00:00.200] Speaker 1: 好';
  const result = await transcriptMarkdown('attributed meeting', recording, {
    readDraft: absent, readLegacy: absent, readOriginal: async () => ({ text, attribution }),
  });
  assert.ok(result.markdown.includes(attribution));
  assert.ok(result.markdown.endsWith(text));
});
