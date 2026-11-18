import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { draftStore } from './draftDocumentModel.ts';
import { prepareRecorderOpen } from './recorderDraftProtocol.ts';

const source = (await readFile(new URL('./summaryPublishSnapshot.ts', import.meta.url), 'utf8'))
  .replace("'./draftDocumentModel'", JSON.stringify(new URL('./draftDocumentModel.ts', import.meta.url).href));
const {buildSummaryPublishSnapshot} = await import(
  'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);

const publicId = 'pub_28342d9672a74c06a4ed45b435561111';
const privateId = 'private-device-summary-fixture';

function blocks(text) { return prepareRecorderOpen(privateId, 'Private title', text).blocks; }
async function saved() {
  let raw = null;
  const disk = {read:async()=>raw,write:async value=>{raw=value;}};
  const store = draftStore({pageId:privateId,kind:'summary'},disk);
  const draft = await store.replaceSummary(0, blocks('Initial generated result'), {
    id:'generation1', recipe:'private-recipe-name', model:'private-model', source:'revision',
    sourceRevision:12, text:'Initial generated result',
    citations:[
      { title:'Source', url:'https://example.com/source', start:0, end:8 },
      { title:'Embedded credential', url:'https://user:pass@example.com/elsewhere', end:1 },
      { title:'Unsafe authority', url:'https://example.com%2f@evil.test', end:1 },
    ],
  });
  return {store,draft};
}

test('recipient receives the reviewed edit and only valid source links, not app provenance or IDs', async () => {
  const {store,draft} = await saved();
  const edited = await store.commit(draft.revision,blocks('Edited summary\nNotes'));
  const payload = buildSummaryPublishSnapshot(edited, edited, publicId, 1);
  assert.deepEqual(payload.metadata,{title:'Meeting Summary',createdAt:1,authorId:'anonymous',origin:'local-mode'});
  assert.deepEqual(payload.subpages,[]);
  assert.deepEqual(payload.breadcrumbs,[]);
  assert.equal(payload.blocks[0].id,publicId);
  const json = JSON.stringify(payload);
  for (const text of [privateId,'Private title','Initial generated result','private-recipe-name','private-model','generation1','Embedded credential','Unsafe authority']) {
    assert.equal(json.includes(text),false);
  }
  const authored = JSON.parse(payload.blocks[0].content).content;
  assert.deepEqual(authored.map(paragraph=>paragraph.content[0].text),['Edited summary','Notes','Sources','Source']);
  assert.deepEqual(authored[3].content[0].marks,[{type:'link',attrs:{href:'https://example.com/source'}}]);
});

test('cannot build an upload payload for a stale reviewed revision, transcript or local recording identifier', async () => {
  const {draft} = await saved();
  assert.throws(()=>buildSummaryPublishSnapshot(draft,{...draft,revision:draft.revision-1},publicId,1),/Review/);
  assert.throws(()=>buildSummaryPublishSnapshot(draft,{...draft,pageId:'another-page'},publicId,1),/Review/);
  assert.throws(()=>buildSummaryPublishSnapshot({...draft,kind:'transcript'},draft,publicId,1),/summary/);
  assert.throws(()=>buildSummaryPublishSnapshot(draft,draft,privateId,1),/public summary identity/);
});
