import test from 'node:test';
import assert from 'node:assert/strict';
import { destinations, canSwitchDestination, canLeaveTranscript, canEditTranscript } from './navigation.ts';

test('roots represent existing product destinations, not actions', () => {
  assert.deepEqual(destinations.map(d => d.id), ['record', 'library', 'settings']);
  assert.equal(new Set(destinations.map(d => d.id)).size, 3);
});
test('active recording can change roots without unmounting audio controller', () => {
  assert.equal(canSwitchDestination('recording'), true);
  assert.equal(canSwitchDestination('idle'), true);
  for (const phase of ['starting', 'saving', 'importing']) assert.equal(canSwitchDestination(phase), false);
});
test('top and system Back share operation and unsaved-result guard', () => {
  assert.equal(canLeaveTranscript(false, false, false), true);
  for (const flags of [[true,false,false], [false,true,false], [false,false,true], [true,true,true]]) {
    assert.equal(canLeaveTranscript(...flags), false);
  }
});

test('revision cannot change while asynchronous save owns its snapshot', () => {
  assert.equal(canEditTranscript(false, false), true);
  assert.equal(canEditTranscript(false, true), false);
  assert.equal(canEditTranscript(true, false), false);
  assert.equal(canEditTranscript(true, true), false);
});
