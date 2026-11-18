import assert from 'node:assert/strict';
import test from 'node:test';
import {parseRecorderEvent,prepareRecorderOpen} from './recorderDraftProtocol.ts';

const event = body => parseRecorderEvent(JSON.stringify({version:1, session:'session', pageId:'page', ...body}), 'session', 'page');
test('only recognizes exact version, active document, valid ordinals and matching session', () => {
  assert.deepEqual(event({type:'opened'}), {type:'opened'});
  assert.deepEqual(event({type:'flushed', flushId:7, ok:false}), {type:'flushed', flushId:7, ok:false});
  assert.deepEqual(event({type:'flushed', flushId:7, ok:true, sealed:true}), {type:'flushed', flushId:7, ok:true});
  assert.deepEqual(event({type:'save', requestId:1, baseRevision:0, blocks:[]}), {type:'save', requestId:1, baseRevision:0, blocks:[]});
  for (const invalid of [
    {type:'opened', session:'other'}, {type:'opened', pageId:'other'}, {type:'opened', version:2},
    {type:'save', requestId:-1, baseRevision:0, blocks:[]}, {type:'save', requestId:1, baseRevision:0.1, blocks:[]},
    {type:'flushed', flushId:7, ok:true}, {type:'flushed', flushId:7, ok:true, sealed:false},
    {type:'flushed', ok:'true'}, {type:'flushed', ok:true}, {type:'upload', content:'anything'}
  ]) assert.equal(event(invalid), undefined);
});


test('bounds long display names and seeds a canonical block without changing Chinese text', () => {
  const opened = prepareRecorderOpen('page', 'A'.repeat(999), '陈安\r\n下一段');
  assert.equal(opened.title.length,480);
  assert.equal(opened.revision,0);
  const block=JSON.parse(opened.blocks[0].content);
  assert.equal(block.content[0].content[0].text,'陈安');
  assert.equal(block.content[1].content[0].text,'下一段');
});

test('reports an oversized seed instead of dispatching an unusable editor open', () => {
  assert.equal(prepareRecorderOpen('page','large','example\n'.repeat(100_000)),undefined);
  assert.equal(prepareRecorderOpen('page','large','\n'.repeat(145_001)),undefined);
  const committed={revision:3,blocks:[{id:'page', type:'tiptap',content:'{"type":"doc","content":[{"type":"paragraph"}]}'}]};
  const reopened=prepareRecorderOpen('page','safe','example\n'.repeat(145_001),committed);
  assert.equal(reopened.revision,3);
  assert.deepEqual(reopened.blocks,committed.blocks);
});
