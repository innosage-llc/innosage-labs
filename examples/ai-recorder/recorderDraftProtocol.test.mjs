import assert from 'node:assert/strict';
import test from 'node:test';
import {parseRecorderEvent} from './recorderDraftProtocol.ts';

const event = body => parseRecorderEvent(JSON.stringify({version:1, session:'session', pageId:'page', ...body}), 'session', 'page');
test('only recognizes exact version, active document, valid ordinals and matching session', () => {
  assert.deepEqual(event({type:'opened'}), {type:'opened'});
  assert.deepEqual(event({type:'flushed', flushId:7, ok:false}), {type:'flushed', flushId:7, ok:false});
  assert.deepEqual(event({type:'save', requestId:1, baseRevision:0, blocks:[]}), {type:'save', requestId:1, baseRevision:0, blocks:[]});
  for (const invalid of [
    {type:'opened', session:'other'}, {type:'opened', pageId:'other'}, {type:'opened', version:2},
    {type:'save', requestId:-1, baseRevision:0, blocks:[]}, {type:'save', requestId:1, baseRevision:0.1, blocks:[]},
    {type:'flushed', ok:'true'}, {type:'flushed', ok:true}, {type:'upload', content:'anything'}
  ]) assert.equal(event(invalid), undefined);
});
