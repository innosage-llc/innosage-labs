import assert from 'node:assert/strict';
import test from 'node:test';
import { draftStore, draftText, summaryPublicProjection } from './draftDocumentModel.ts';

const key = {pageId: 'page', kind: 'transcript'};
const content = value => [{id: 'page', type: 'tiptap', content: JSON.stringify({
  type: 'doc', content: [{type:'paragraph', content:[{type:'text', text:value}]}, {type:'paragraph'}],
})}];
const memory = () => {
  let saved = null;
  return {read:async () => saved, write:async contents => { saved = contents; }};
};

test('retains a committed revision across fresh owners and repeated acknowledgments', async () => {
  const disk = memory();
  const a = draftStore(key, disk);
  assert.equal(await a.recover(), undefined);
  assert.equal((await a.commit(0, content('陈宁'))).revision, 1);
  const b = draftStore(key, disk);
  assert.equal(draftText(await b.recover()), '陈宁\n');
  assert.equal((await b.commit(0, content('陈宁'))).revision, 1);
  await assert.rejects(b.commit(0, content('陈安')), /changed/);
  assert.equal((await b.commit(1, content('陈宁已核对'))).revision, 2);
  assert.equal(draftText(await a.recover()), '陈宁已核对\n');
});

test('serializes overlapping owners for the same identity', async () => {
  const disk = memory();
  const a = draftStore(key, disk);
  const b = draftStore(key, disk);
  const out = await Promise.allSettled([a.commit(0, content('first')), b.commit(0, content('second'))]);
  assert.equal(out[0].status, 'fulfilled');
  assert.equal(out[1].status, 'rejected');
  assert.equal(draftText(await a.recover()), 'first\n');
});

test('does not acknowledge failed persistence and can save again without losing the prior revision', async () => {
  const disk = memory();
  const a = draftStore(key, disk);
  await a.commit(0, content('saved'));
  const b = draftStore(key, {...disk, write: async () => { throw new Error('disk is full'); }});
  await assert.rejects(b.commit(1, content('new')), /disk is full/);
  assert.equal(draftText(await a.recover()), 'saved\n');
  assert.equal((await a.commit(1, content('new'))).revision, 2);
});

test('fails on corrupt saved data instead of resetting from the original', async () => {
  const a = draftStore(key, {read:async () => 'broken', write:async () => assert.fail('must not write')});
  await assert.rejects(a.recover(), /recovery/);
  await assert.rejects(a.commit(0, content('replacing')), /recovery/);
});

test('summary regeneration and editor autosave use one atomic source-and-content receipt', async () => {
  const summary = {id:'s1',recipe:'meeting',model:'gpt-test',source:'revision',text:'Generated answer'};
  const generated = makeBlocks('summary-page', summary.text);
  const disk = memoryStorage();
  const store = draftStore({pageId:'summary-page',kind:'summary'}, disk);
  const first = await store.replaceSummary(0, generated, summary);
  assert.deepEqual(first.generation, summary);
  const edited = makeBlocks('summary-page', 'Hand edit');
  const second = await store.commit(first.revision, edited);
  assert.equal(second.generation.id, 's1');
  assert.equal(draftText(second), 'Hand edit');
  const replacement = {...summary,id:'s2',text:'Replacement'};
  await assert.rejects(store.replaceSummary(first.revision, makeBlocks('summary-page','Replacement'), replacement), /revision changed/);
  assert.equal(draftText(await store.recover()), 'Hand edit');
  const chosen = await store.replaceSummary(second.revision, makeBlocks('summary-page','Replacement'), replacement);
  assert.equal(chosen.generation.id,'s2');
  assert.equal(draftText(chosen),'Replacement');
  assert.deepEqual(await store.replaceSummary(second.revision, makeBlocks('summary-page','Replacement'), replacement), chosen);
});

test('the public projection only contains current summary text and recoverable citation destinations', async () => {
  const original = '🌱 Quoted source.';
  const source = {id:'s1',recipe:'private instructions marker',model:'gpt-test',source:'revision',text:original,
    citations:[
      {start:2,end:15,url:'https://example.com/reference',title:'Source'},
      {start:2,end:15,url:'https://user:pass@example.com/unsafe',title:'Reject auth'},
    ]};
  const store = draftStore({pageId:'summary-page',kind:'summary'},memoryStorage());
  const snapshot = await store.replaceSummary(0,makeBlocks('summary-page','开头\n🌱 Quoted source.'),source);
  const publicReceipt=summaryPublicProjection(snapshot);
  assert.deepEqual(Object.keys(publicReceipt),['title','text','citations']);
  assert.equal(publicReceipt.text,'开头\n🌱 Quoted source.');
  assert.deepEqual(publicReceipt.citations,[{url:'https://example.com/reference',title:'Source',start:5,end:18}]);
  assert.equal(JSON.stringify(publicReceipt).includes('private instructions marker'),false);
  const ambiguous=await store.commit(snapshot.revision,makeBlocks('summary-page','Quoted source and Quoted source'));
  assert.deepEqual(summaryPublicProjection(ambiguous).citations,[{url:'https://example.com/reference',title:'Source'}]);
  assert.throws(()=>summaryPublicProjection({...snapshot,kind:'transcript'}),/summary/);
});

function makeBlocks(id,text) {
  return [{id,type:'tiptap',content:JSON.stringify({type:'doc',content:text.split('\n').map(line=>({type:'paragraph',content:[{type:'text',text:line}]}))})}];
}
function memoryStorage() {
  let raw=null;
  return {read:async()=>raw,write:async value=>{raw=value;}};
}
