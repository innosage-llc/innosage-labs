import assert from 'node:assert/strict';
import test from 'node:test';
import { readableSpeakerTranscript } from './speakerTranscript.ts';
import { transcriptReaderBlocks } from './ui/document-content.ts';

const row = (time, speaker, text) => `[${time}] ${speaker}: ${text}`;

test('joins Chinese word rows while restoring original punctuation', () => {
  const source = '[00:00.000 - 00:02.000] 你好，世界。\n';
  // Use exact millisecond timestamps as emitted by Gateway.
  const timeline = ['00:00.000', '00:00.200', '00:00.400', '00:00.600']
    .map((time, index) => row(time, 'Speaker 1', ['你', '好', '世', '界'][index])).join('\n');
  assert.equal(readableSpeakerTranscript(source, timeline), '[00:00.000] Speaker 1: 你好，世界。');
});

test('keeps English spacing, speaker changes and unknown attribution', () => {
  const source = '[00:00.000 - 00:03.000] Hello, world! Yes. Maybe.\n';
  const timeline = [row('00:00.000', 'Speaker 1', 'Hello'), row('00:00.300', 'Speaker 1', 'world'),
    row('00:01.000', 'Speaker 2', 'Yes'), row('00:02.000', 'Unknown speaker', 'Maybe')].join('\n');
  assert.equal(readableSpeakerTranscript(source, timeline),
    '[00:00.000] Speaker 1: Hello, world!\n\n[00:01.000] Speaker 2: Yes.\n\n[00:02.000] Unknown speaker: Maybe.');
});

test('long pauses split paragraphs and mismatched words retain the existing result', () => {
  const timeline = [row('00:00.000', 'Speaker 1', 'First'), row('00:03.000', 'Speaker 1', 'Second')].join('\n');
  assert.equal(readableSpeakerTranscript('[00:00.000 - 00:04.000] First. Second.', timeline),
    '[00:00.000] Speaker 1: First.\n\n[00:03.000] Speaker 1: Second.');
  assert.equal(readableSpeakerTranscript('Different words', timeline), timeline);
});

test('reader displays real timestamp ranges and leaves untimed revisions untimed', () => {
  assert.deepEqual(transcriptReaderBlocks('[00:00.000 - 00:01.500] Hello.\n[00:02.000] Speaker 2: Yes.\nNext line.'), [
    { timestamp: '00:00.000', text: 'Hello.' },
    { timestamp: '00:02.000', text: 'Speaker 2: Yes.\nNext line.' },
  ]);
  assert.deepEqual(transcriptReaderBlocks('Untimed revision.\n\n[Note] Keep this.'), [
    { text: 'Untimed revision.' }, { text: '[Note] Keep this.' },
  ]);
});
