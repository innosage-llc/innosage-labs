import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source = (await readFile(new URL('./summaryDraftLifecycle.ts', import.meta.url), 'utf8'))
  .replace(/'(\.\/(?:draftDocumentModel|recorderDraftProtocol))'/g,
    (_, path) => JSON.stringify(new URL(path + '.ts', import.meta.url).href));
const { readSummaryInput, generateSummaryCandidate, acceptSummaryCandidate, loadSummaryDocument, saveSummaryCandidate, committedSummary } = await import(
  'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);
import { draftStore } from './draftDocumentModel.ts';
import { prepareRecorderOpen } from './recorderDraftProtocol.ts';

test('source is selected just before generation and there is no implicit fallback', async () => {
  let original = 0;
  let value = 'initial';
  const read = () => readSummaryInput('revision',async()=>{original++;return 'original';},async()=>value);
  value = 'committed 陈宁';
  assert.equal(await read(),'committed 陈宁');
  value = '';
  await assert.rejects(read(),/no saved revision/);
  assert.equal(original,0);
});

test('review is separate and retrying a failed save does not repeat generation', async () => {
  const metadata={id:'candidate-1',recipe:'meeting',model:'gpt-test',source:'revision'};
  let paid=0, writes=0;
  const candidate=await generateSummaryCandidate({metadata,
    readCurrent:async()=>({kind:'summary',revision:8}),
    readInput:async()=>({text:'committed 陈宁',sourceRevision:7}),
    generate:async text=>{assert.equal(text,'committed 陈宁'); paid++; return {text:'Generated once'};},
  });
  assert.equal(writes,0);
  const replace=async (base,blocks,value)=>{
    assert.equal(base,8);
    assert.equal(value.id,'candidate-1');
    assert.equal(value.sourceRevision,7);
    assert.equal(blocks,'fixture');
    if(++writes===1) throw new Error('Local disk failed');
    return {revision:9};
  };
  await assert.rejects(acceptSummaryCandidate(candidate,'fixture',replace), /Local disk/);
  assert.equal((await acceptSummaryCandidate(candidate,'fixture',replace)).revision,9);
  assert.equal(paid,1);
});

test('cold legacy adoption is recoverable and cannot replace a later hand edit', async () => {
  let raw = null;
  const disk = { read: async ()=>raw, write: async value=>{raw=value;} };
  const key = {pageId: 'summary-test', kind:'summary'};
  const first = draftStore(key,disk);
  const old = {recipe:'meet',model:'gpt-test',source:'original',text:'Previous result'};
  let reads = 0;
  const readLegacy = async () => { reads++; return {id:'legacy',data:old}; };
  const migrated = await loadSummaryDocument(first, readLegacy);
  assert.equal(migrated.generation.id,'legacy');
  const blocks = prepareRecorderOpen(key.pageId,'Meeting Summary','Hand edited result').blocks;
  await first.commit(migrated.revision,blocks);
  const cold = draftStore(key,disk);
  assert.equal((await committedSummary(cold)).text,'Hand edited result');
  assert.equal((await loadSummaryDocument(cold,readLegacy)).revision,2);
  assert.equal(reads,1);
});

test('a regenerated candidate cannot replace an intervening edit and can seed an accepted independent summary', async () => {
  let raw = null;
  const document = draftStore({pageId:'summary-test2',kind:'summary'}, {read:async()=>raw,write:async v=>{raw=v;}});
  const generation = {id:'one',recipe:'meet',model:'gpt-test',source:'revision',sourceRevision:4,text:'First candidate'};
  assert.equal((await saveSummaryCandidate(document,{generation,basedOnRevision:0})).revision,1);
  const candidate = {generation:{...generation,id:'two',text:'Second candidate'},basedOnRevision:1};
  const blocks = prepareRecorderOpen(document.pageId,'Meeting Summary','Local edit').blocks;
  await document.commit(1,blocks);
  await assert.rejects(async () => saveSummaryCandidate(document,candidate),/revision changed/);
  assert.equal((await committedSummary(document)).text,'Local edit');
});
