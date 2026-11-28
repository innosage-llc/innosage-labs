import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { changedOutcomes, requiredOutcomes, verifyOutcome } from './prd-outcomes.mjs';
const matrix = row => '## Candidate outcomes\n' + row + '\n## Exceptions\n';
const row = '| <!-- outcome:library-import --> import | Android | iOS | Web |';
test('changed PRD outcomes require mapped entries on all three platforms', () => {
  assert.deepEqual(changedOutcomes(matrix(''),matrix(row),true), ['library-import']);
  assert.throws(() => changedOutcomes(matrix(''),matrix(row.replace('iOS','')),true), /lacks a platform/);
  assert.throws(() => changedOutcomes(matrix(''),matrix(row.replace('library-import','orphan')),true), /shared policy/);
  assert.throws(() => changedOutcomes(matrix(row),matrix(row),true), /revised outcome/);
});
test('Library gate rejects absent, stale, incomplete, wrong-platform and wrong-artifact evidence', () => {
  const candidate = {head:'h',base:'b',tree:'t',tested:'s',pr:147,repo:'labs'};
  const artifact = {sha256:'a'.repeat(64)};
  const receipt = {platform:'web',outcome:'library-import',id:'Import-123-abcd.m4a',candidate,artifact:artifact.sha256,
    sha256:'07b0d24a10e960aa9b45bfff066318cd946da98d521d39b2ad2e51f8575fecb7',
    cases:['cancel','repeat','forged','damaged','save-failure','retry','offline-playback']};
  assert.doesNotThrow(() => verifyOutcome(receipt,'web',candidate,artifact));
  for (const changed of [undefined,{...receipt,platform:'ios'},{...receipt,cases:['retry']},
    {...receipt,candidate:{...candidate,tested:'x'}},{...receipt,artifact:'b'.repeat(64)}]) {
    assert.throws(() => verifyOutcome(changed,'web',candidate,artifact));
  }
});

test('observer installation and gate wiring alone require the three-platform Library evidence', () => {
  const candidate = { base: 'HEAD', head: 'HEAD' };
  const source = fileURLToPath(new URL('../../', import.meta.url));
  for (const path of ['scripts/recorder-gate/add-ios-test.rb', 'scripts/recorder-gate/platform.mjs',
    'scripts/recorder-gate/aggregate.mjs', 'scripts/auto-merge-ci.mjs']) {
    assert.deepEqual(requiredOutcomes(source, candidate, [path]), ['library-import'], path);
  }
  assert.deepEqual(requiredOutcomes(source, candidate, ['examples/ai-cmo-workbench/README.md']), []);
});
