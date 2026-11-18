import assert from 'node:assert/strict';
import test from 'node:test';
import { persistTranscriptCompletion, readCommittedTranscript } from './transcriptCompletion.ts';

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

test('a remounted reader waits for the original and speaker pair after an in-flight completion', async () => {
  const disk = files();
  let release;
  const pause = new Promise(resolve => { release = resolve; });
  const save = persistTranscriptCompletion('remount', {
    ...disk, writeOriginal: async value => { await pause; await disk.writeOriginal(value); },
  }, first);
  const restored = readCommittedTranscript('remount', disk);
  const becameReady = Symbol();
  assert.equal(await Promise.race([restored, Promise.resolve(becameReady)]), becameReady);
  release();
  assert.deepEqual(await save, first);
  assert.deepEqual(await restored, first);
});

test('rejects missing, non-string and blank completions; leaves a malformed legacy marker untouched', async () => {
  for (const [index, transcript] of [undefined, null, 5, ' \n\t '].entries()) {
    const disk = files();
    await assert.rejects(persistTranscriptCompletion('invalid-' + index, disk, { state:'COMPLETED', transcript }), /without a transcript/);
    assert.deepEqual(disk.writes, []);
  }
  const disk = { ...files(), readOriginal: async () => ' \n  ' };
  await assert.rejects(readCommittedTranscript('legacy-blank', disk), /needs recovery/);
  await assert.rejects(persistTranscriptCompletion('legacy-blank', disk, first), /needs recovery/);
  assert.deepEqual(disk.writes, []);
});

test('an invalid optional speaker payload does not hide the original', async () => {
  const disk = files();
  const valid = {state:'COMPLETED',transcript:'valid original'};
  assert.deepEqual(await persistTranscriptCompletion('malformed-speakers', disk, {
    ...valid, speakerLabeling:{requested:true,status:'completed',transcript:42},
  }), valid);
  assert.equal((await readCommittedTranscript('malformed-speakers',disk)).transcript,valid.transcript);
  assert.equal(await disk.readSpeakers(),undefined);
});
