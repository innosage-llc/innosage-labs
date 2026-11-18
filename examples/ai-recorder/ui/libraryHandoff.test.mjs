import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasSavedFeedback, microphonePermissionMessage, recordingSavedMessage } from './recordFeedback.ts';
import { handoffReducer as reduce, initialHandoff, locateRecording } from './libraryHandoff.ts';

const saved = (uri = 'file:///recording-a.m4a') => reduce(initialHandoff, { type: 'saved', uri });
const view = state => reduce(state, { type: 'view' });

test('only a successful saved URI can create a locate request, without selecting playback', () => {
  assert.equal(view(initialHandoff), initialHandoff);
  const state = view(saved());
  assert.equal(state.request.uri, 'file:///recording-a.m4a');
  assert.equal(state.request.located, false);
  assert.equal('playingFile' in state, false);
});

test('repeated handoff taps retain one request and do not extend highlight lifetime', () => {
  const state = view(saved());
  assert.equal(view(state), state);
  const located = reduce(state, { type: 'located', id: state.request.id });
  assert.equal(view(located), located);
});

test('new save replaces the old target; stale location/expiry cannot affect it', () => {
  const old = view(saved());
  const next = view(reduce(old, { type: 'saved', uri: 'file:///recording-b.m4a' }));
  assert.equal(reduce(next, { type: 'located', id: old.request.id }), next);
  assert.equal(reduce(next, { type: 'expire', id: old.request.id }), next);
  assert.equal(next.request.uri, 'file:///recording-b.m4a');
});

test('leaving Library cancels highlight; re-entry never resurrects stale work', () => {
  const state = view(saved());
  const left = reduce(state, { type: 'leave' });
  assert.equal(left.request, undefined);
  assert.equal(reduce(left, { type: 'located', id: state.request.id }), left);
  const reentered = view(left);
  assert.notEqual(reentered.request.id, state.request.id);
});

test('new capture, failure or import resets saved affordance and outstanding location', () => {
  const state = reduce(view(saved()), { type: 'reset' });
  assert.equal(state.savedUri, undefined);
  assert.equal(state.request, undefined);
  assert.equal(view(state), state);
});

test('expiry removes only transient highlight, retaining recording identity', () => {
  const state = view(saved());
  const located = reduce(state, { type: 'located', id: state.request.id });
  assert.equal(located.request.located, true);
  const expired = reduce(located, { type: 'expire', id: state.request.id });
  assert.equal(expired.request, undefined);
  assert.equal(expired.savedUri, state.savedUri);
});

test('virtualized unmeasured target retries, then stops once visible', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  let unavailable = 0;
  locateRecording(() => { if (++attempts === 1) throw Error('unmeasured'); return attempts === 3; }, () => unavailable++);
  t.mock.timers.tick(200);
  t.mock.timers.tick(200);
  t.mock.timers.tick(5000);
  assert.equal(attempts, 3);
  assert.equal(unavailable, 0);
});

test('missing target terminates with one recovery message, never infinite scrolling', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  let unavailable = 0;
  locateRecording(() => { attempts++; return false; }, () => unavailable++);
  for (let i = 0; i < 20; i++) t.mock.timers.tick(200);
  assert.equal(attempts, 10);
  assert.equal(unavailable, 1);
});

test('leaving/replacing/unmounting cancels pending scroll and recovery callbacks', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  let unavailable = 0;
  const cancel = locateRecording(() => { attempts++; return false; }, () => unavailable++);
  cancel(); cancel();
  for (let i = 0; i < 20; i++) t.mock.timers.tick(200);
  assert.equal(attempts, 1);
  assert.equal(unavailable, 0);
});

// Presentation regression: file identity outlives temporary success feedback.


test('saved feedback ends when navigation/playback clears its message, preserving URI identity', () => {
  const saved = reduce(initialHandoff, { type: 'saved', uri: 'file:///synthetic/one.m4a' });
  assert.equal(hasSavedFeedback('idle', saved.savedUri, recordingSavedMessage), true);
  const viewed = reduce(saved, { type: 'view' });
  const returned = reduce(viewed, { type: 'leave' });
  assert.equal(returned.savedUri, saved.savedUri);
  assert.equal(hasSavedFeedback('idle', returned.savedUri, ''), false);
  assert.equal(hasSavedFeedback('idle', returned.savedUri, 'Could not play the recording.'), false);
});

test('new capture and busy/error states cannot reuse a prior saved affordance', () => {
  for (const phase of ['starting', 'recording', 'saving', 'importing']) {
    assert.equal(hasSavedFeedback(phase, 'file:///synthetic/one.m4a', recordingSavedMessage), false);
  }
  assert.equal(hasSavedFeedback('idle', undefined, recordingSavedMessage), false);
  const reset = reduce({ ...initialHandoff, savedUri: 'file:///synthetic/one.m4a' }, { type: 'reset' });
  assert.equal(hasSavedFeedback('idle', reset.savedUri, ''), false);
});

test('microphone recovery copy follows native canAskAgain, without inventing a settings action', () => {
  assert.equal(microphonePermissionMessage(true), 'Microphone access was not allowed. Tap Start recording to ask again.');
  assert.equal(microphonePermissionMessage(false), 'Microphone access is blocked. In Android device Settings, open Apps > AI Recorder > Permissions > Microphone. Allow access, return here, then tap Start recording.');
});
