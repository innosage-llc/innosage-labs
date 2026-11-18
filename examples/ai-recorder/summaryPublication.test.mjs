import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {draftStore} from './draftDocumentModel.ts';
import {prepareRecorderOpen} from './recorderDraftProtocol.ts';
const modelUrl = new URL('./draftDocumentModel.ts',import.meta.url).href;
async function moduleURL(file, names) {
  let code = await readFile(new URL(file,import.meta.url),'utf8');
  for (const [path,url] of Object.entries(names)) code = code.replaceAll("'"+path+"'",JSON.stringify(url));
  return 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(code)).toString('base64');
}
const snapshotUrl = await moduleURL('./summaryPublishSnapshot.ts',{'./draftDocumentModel':modelUrl});
const {summaryPublication} = await import(await moduleURL('./summaryPublication.ts',{'./summaryPublishSnapshot':snapshotUrl}));
const pageId = 'local-recording-summary';
async function setup() {
  let raw=null, owned=null;
  const actions=[], remote=new Map();
  const doc=draftStore({pageId,kind:'summary'}, {read:async()=>raw,write:async x=>{raw=x;}});
  const blocks=s=>prepareRecorderOpen(pageId,'Private recording',s).blocks;
  const original=await doc.replaceSummary(0,blocks('Generated meeting'),{
    id:'recipe-secret',recipe:'private-prompt',source:'revision',model:'private-model',text:'Generated meeting',
    citations:[{url:'https://example.org/agenda',title:'Agenda',start:0,end:9}]});
  const edited=await doc.commit(original.revision,blocks('Edited action item.'));
  const d={pageId,randomUUID,sha256Hex:async s=>createHash('sha256').update(s).digest('hex'),recover:doc.recover,read:async()=>owned,write:async x=>{owned=x;},
    request:async (url,opts)=>{
      assert.ok(url.startsWith('https://api-staging.draft.innosage.co/api/publish'));
      const req=JSON.parse(opts.body); actions.push(req); const id=req.pageId;
      if(url.endsWith('/unpublish')){
        assert.equal(remote.get(id).key,req.browserPublisherKey); remote.delete(id);
        return Response.json({success:true,status:'unpublished'});
      }
      assert.equal(req.publicPageId,id); assert.equal(req.localPageId,id);
      if(remote.has(id))assert.equal(req.browserPublisherKey,remote.get(id).key);
      assert.equal(req.intent,'publish_exact');
      remote.set(id,{snapshot:req.snapshot,key:req.browserPublisherKey});
      return Response.json({success:true,status:'active',ownerType:'browser',ownerManaged:true,publicPageId:id,url:'https://ignored.invalid'});
    }};
  return {doc,blocks,edited,d,actions,remote};
}
test('explicit publish, local-only edit, update and cold-owner unpublish share only the reviewed summary',async()=>{
  const {doc,blocks,edited,d,actions,remote}=await setup();
  assert.equal(await summaryPublication(d).status(),undefined); assert.equal(actions.length,0);
  const url=await summaryPublication(d).publish(edited), id=url.split('/').at(-1);
  assert.equal(url,'https://draft-staging.innosage.co/preview/'+id);
  const publicJSON=JSON.stringify(remote.get(id).snapshot);
  for (const s of [pageId,'private-prompt','private-model','recipe-secret','Generated meeting','Private recording']) assert.ok(!publicJSON.includes(s));
  assert.ok(publicJSON.includes('Edited action item.')); assert.ok(publicJSON.includes('https://example.org/agenda'));
  const edit2=await doc.commit(edited.revision,blocks('Later edit.'));
  await assert.rejects(summaryPublication(d).publish(edited),/Review/);
  assert.equal(actions.length,1); assert.equal(JSON.stringify(remote.get(id).snapshot),publicJSON);
  const rebooted=summaryPublication(d);
  assert.deepEqual(await rebooted.status(),{status:'active',revision:edited.revision,url});
  assert.equal(await rebooted.publish(edit2),url); assert.ok(JSON.stringify(remote.get(id).snapshot).includes('Later edit.'));
  await summaryPublication(d).unpublish(); assert.equal(remote.has(id),false);
  assert.equal((await summaryPublication(d).status()).status,'unpublished'); assert.equal(actions.length,3);
});
test('an interrupted first response preserves withdrawal authority, no silent duplicate publish',async()=>{
  const {edited,d,remote}=await setup(), request=d.request;
  d.request=async(...args)=>{await request(...args); throw Error('connection lost');};
  await assert.rejects(summaryPublication(d).publish(edited),/connection lost/); assert.equal(remote.size,1);
  d.request=request; const recovered=summaryPublication(d);
  assert.equal((await recovered.status()).status,'unconfirmed');
  await assert.rejects(recovered.publish(edited),/unconfirmed/); assert.equal(remote.size,1); await recovered.unpublish(); assert.equal(remote.size,0);
});
test('known rejection permits retry, but a failed local owner write sends no network request',async()=>{
  const {edited,d,actions}=await setup(), request=d.request, write=d.write;
  d.write=async()=>{throw Error('keychain unavailable');};
  await assert.rejects(summaryPublication(d).publish(edited),/keychain/); assert.equal(actions.length,0);
  d.write=write; d.request=async()=>new Response('',{status:403});
  await assert.rejects(summaryPublication(d).publish(edited),/403/);
  d.request=request; assert.ok(await summaryPublication(d).publish(edited));
});

test('a lost withdrawal reply suppresses the URL until the same owner confirms withdrawal',async()=>{
  const {edited,d,remote}=await setup();
  await summaryPublication(d).publish(edited);
  const request=d.request; let first=true;
  d.request=async(url,opts)=>{
    if(!url.endsWith('/unpublish'))return request(url,opts);
    if(first) {first=false; await request(url,opts); throw Error('lost withdrawal receipt');}
    return Response.json({success:true,status:'unpublished'});
  };
  await assert.rejects(summaryPublication(d).unpublish(),/lost withdrawal/);
  assert.equal(remote.size,0);
  assert.deepEqual(await summaryPublication(d).status(),{status:'withdrawing',revision:edited.revision,url:undefined});
  await assert.rejects(summaryPublication(d).publish(edited),/Finish withdrawing/);
  await summaryPublication(d).unpublish(); assert.equal((await summaryPublication(d).status()).status,'unpublished');
});
