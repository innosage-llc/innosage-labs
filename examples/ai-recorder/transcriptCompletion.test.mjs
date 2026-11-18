import assert from 'node:assert/strict';
import test from 'node:test';
import { persistTranscriptCompletion } from './transcriptCompletion.ts';

const first = { state: 'COMPLETED', transcript: 'original 00:00', speakerLabeling: { requested: true, status: 'completed', transcript: 'Speaker 1: original' } };
const replay = { state: 'COMPLETED', transcript: 'different', speakerLabeling: { requested: true, status: 'failed' } };

function files(failOriginal = false) {
  let original;
  let speakers;
  let firstWrite = true;
  const writes = [];
  return {
    writes,
    readOriginal: async () => original,
    readSpeakers: async () => speakers,
    writeOriginal: async value => {
      writes.push('original');
      if (failOriginal && firstWrite) {
        firstWrite = false;
        throw new Error('interrupted');
      }
      original = value;
    },
    writeSpeakers: async value => {
      writes.push('speakers');
      speakers = value;
    },
  };
}

test('same-recording concurrent and cold replays preserve the one committed original and speaker transcript', async () => {
  const disk = files();
  const original = persistTranscriptCompletion('one-recording', disk, first);
  const concurrent = persistTranscriptCompletion('one-recording', disk, replay);
  assert.deepEqual(await original, first);
  assert.deepEqual(await concurrent, first);
  assert.deepEqual(await persistTranscriptCompletion('one-recording', disk, replay), first);
  assert.deepEqual(disk.writes, ['speakers', 'original']);
});

test('can retry a failed first completion without leaving a duplicate or incomplete marker', async () => {
  const disk = files(true);
  await assert.rejects(persistTranscriptCompletion('interrupted-recording', disk, first), /interrupted/);
  assert.equal(await disk.readOriginal(), undefined);
  assert.deepEqual(await persistTranscriptCompletion('interrupted-recording', disk, first), first);
  assert.deepEqual(await persistTranscriptCompletion('interrupted-recording', disk, replay), first);
  assert.deepEqual(disk.writes, ['speakers', 'original', 'speakers', 'original']);
});

test('a retry with no speakers does not commit orphaned metadata from an interrupted attempt', async () => {
  const disk = files(true);
  const plain = { state: 'COMPLETED', transcript: 'no speakers' };
  await assert.rejects(persistTranscriptCompletion('retry-without-speakers', disk, first), /interrupted/);
  assert.deepEqual(await persistTranscriptCompletion('retry-without-speakers', disk, plain), plain);
  assert.equal(await disk.readSpeakers(), undefined);
});
