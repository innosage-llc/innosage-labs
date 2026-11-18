import test from 'node:test';
import assert from 'node:assert/strict';
import { CaptureSession } from './captureSession.ts';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(overrides={}) {
  const calls=[];let listener;let status={isRecording:false};
  const recorder={id:'one',addListener(name,fn){assert.equal(name,'recordingStatusUpdate');listener=fn;return{remove(){calls.push('removeCompletion');}};},
    async prepareToRecordAsync(){calls.push('prepare');},record(){calls.push('record');status={isRecording:true};},
    async stop(){calls.push('stop');status={isRecording:false};},getStatus(){return status;},release(){calls.push('release');}};
  const dependencies={recorder,microphone:async()=>{calls.push('microphone');return{granted:true,canAskAgain:true};},notification:async()=>{calls.push('notification');},audioMode:async()=>{calls.push('audioMode');},save:async url=>{calls.push('save:'+url);return 'saved:'+url;},permissionMessage:again=>again?'ask for microphone':'enable microphone in Settings',savedMessage:'Saved on this device',...overrides};
  const session=new CaptureSession(dependencies);
  session.bindPlayback(() => calls.push('pause'));
  return {session,recorder,dependencies,calls,pause:()=>calls.push('pause'),finish:url=>listener({isFinished:true,hasError:false,url}),emit:status=>listener(status)};
}
test('screen unsubscribe/remount keeps the recorder and completion owner',async()=>{
  const f=fixture();let first=0,second=0;const detach=f.session.subscribe(()=>first++);await f.session.start();const prior=first;detach();f.session.subscribe(()=>second++);
  assert.equal(f.session.recorder,f.recorder);assert.equal(f.session.getSnapshot().phase,'recording');f.finish('one');await flush();
  assert.equal(first,prior);assert(second>0);assert.equal(f.session.getSnapshot().savedUri,'saved:one');assert(!f.calls.includes('release'));assert(!f.calls.includes('removeCompletion'));
});
test('remount during a pending permission request cannot issue another Start',async()=>{
  const gate=deferred();let permissions=0;const f=fixture({microphone:()=>{permissions++;return gate.promise;}});const start=f.session.start();f.session.subscribe(()=>{})();
  assert.equal(f.session.getSnapshot().phase,'starting');await f.session.start();assert.equal(permissions,1);gate.resolve({granted:true,canAskAgain:true});await start;assert.equal(f.calls.filter(x=>x==='record').length,1);
});
test('completion without a screen and remount during save preserve one save and its Library URI',async()=>{
  const gate=deferred();let saves=0;const f=fixture({save:()=>{saves++;return gate.promise;}});await f.session.start();f.session.subscribe(()=>{})();f.finish('one');f.finish('one');
  assert.equal(saves,1);assert.equal(f.session.getSnapshot().phase,'saving');await f.session.start();assert.equal(f.calls.filter(x=>x==='record').length,1);gate.resolve('saved:one');await flush();
  assert.deepEqual(f.session.getSnapshot(),{phase:'idle',message:'Saved on this device',saveVersion:1,savedUri:'saved:one'});f.finish('one');await flush();assert.equal(saves,1);
});
test('pending Stop survives screen replacement and rejects duplicate Stop/Start',async()=>{
  const gate=deferred();const f=fixture();f.recorder.stop=()=>{f.calls.push('stop');return gate.promise;};await f.session.start();const stopping=f.session.stop();f.session.subscribe(()=>{})();await f.session.stop();await f.session.start();
  assert.equal(f.calls.filter(x=>x==='stop').length,1);assert.equal(f.calls.filter(x=>x==='record').length,1);gate.resolve();await stopping;f.finish('one');await flush();assert.equal(f.session.getSnapshot().phase,'idle');
});
for(const canAskAgain of [true,false])test(`denial retains microphone contract ${canAskAgain}`,async()=>{
  const f=fixture({microphone:async()=>({granted:false,canAskAgain})});await f.session.start();assert.equal(f.session.getSnapshot().phase,'idle');assert.match(f.session.getSnapshot().message,canAskAgain?/ask/:/Settings/);assert.deepEqual(f.calls,[]);
});
for(const stage of ['microphone','notification','pause','audioMode','prepare','record'])test(`failure at ${stage} has no reset or retry`,async()=>{
  const f=fixture();const fail=()=>{throw Error(stage);};if(stage==='prepare')f.recorder.prepareToRecordAsync=fail;else if(stage==='record')f.recorder.record=fail;else if(stage!=='pause')f.dependencies[stage]=fail;
  if(stage==='pause')f.session.bindPlayback(fail);
  await f.session.start();assert.equal(f.session.getSnapshot().phase,'idle');assert.match(f.session.getSnapshot().message,/Could not start/);assert(!f.calls.includes('stop'));assert(!f.calls.includes('release'));assert(f.calls.filter(x=>x==='record').length<=1);
});
test('startup call order retains awaited stages and synchronous record',async()=>{const f=fixture();await f.session.start();assert.deepEqual(f.calls,['microphone','notification','pause','audioMode','prepare','record']);});
for(const isRecording of [true,false])test(`Stop error follows actual native recording status ${isRecording}`,async()=>{
  const f=fixture();await f.session.start();f.recorder.stop=async()=>{throw Error('stop');};f.recorder.getStatus=()=>({isRecording});await f.session.stop();assert.equal(f.session.getSnapshot().phase,isRecording?'recording':'idle');assert.match(f.session.getSnapshot().message,/Could not stop/);
});
test('save failure and native error do not fabricate a saved URI',async()=>{
  for(const nativeError of [false,true]){let saves=0;const f=fixture({save:async()=>{saves++;throw Error('unavailable');}});await f.session.start();f.emit({isFinished:true,hasError:nativeError,url:'one'});await flush();assert.equal(saves,nativeError?0:1);assert.equal(f.session.getSnapshot().phase,'idle');assert.equal(f.session.getSnapshot().savedUri,undefined);assert.match(f.session.getSnapshot().message,/Could not save/);}
});
test('inactive/duplicate completion cannot save; a distinct later capture can',async()=>{
  const f=fixture();f.finish('old');await flush();assert(!f.calls.some(x=>x.startsWith('save:')));await f.session.start();f.finish('one');await flush();await f.session.start();f.finish('two');await flush();assert.deepEqual(f.calls.filter(x=>x.startsWith('save:')),['save:one','save:two']);assert.equal(f.session.getSnapshot().saveVersion,2);
});
for(const pending of ['microphone','notification']) test(`pending ${pending} resolves against the new player, never disposed old player`,async()=>{
  const gate=deferred();const f=fixture({[pending]:()=>gate.promise});let oldCalls=0,newCalls=0,disposed=false;
  const oldDetach=f.session.bindPlayback(()=>{oldCalls++;if(disposed)throw Error('old player released');});
  const start=f.session.start();if(pending==='notification')await flush();
  oldDetach();disposed=true;f.session.bindPlayback(()=>newCalls++);
  gate.resolve({granted:true,canAskAgain:true});await start;
  assert.equal(oldCalls,0);assert.equal(newCalls,1);assert.equal(f.session.getSnapshot().phase,'recording');
  assert.equal(f.calls.filter(x=>x==='prepare').length,1);assert.equal(f.calls.filter(x=>x==='record').length,1);
});
for(const pending of ['microphone','notification'])test(`pending ${pending} with no attached playback binding skips disposed player`,async()=>{
  const gate=deferred();const f=fixture({[pending]:()=>gate.promise});const detach=f.session.bindPlayback(()=>{throw Error('disposed player');});const start=f.session.start();if(pending==='notification')await flush();detach();
  gate.resolve({granted:true,canAskAgain:true});await start;assert.equal(f.session.getSnapshot().phase,'recording');assert.equal(f.calls.filter(x=>x==='record').length,1);
});
test('overlapping surfaces: old cleanup cannot remove a newer player binding',async()=>{
  const f=fixture();let old=0,current=0;const detachOld=f.session.bindPlayback(()=>old++);f.session.bindPlayback(()=>current++);detachOld();await f.session.start();assert.equal(old,0);assert.equal(current,1);
});
test('an actually active player error remains a startup failure before audio preparation',async()=>{
  const f=fixture();let pauses=0;f.session.bindPlayback(()=>{pauses++;throw Error('active playback failure');});await f.session.start();assert.equal(pauses,1);assert.equal(f.session.getSnapshot().phase,'idle');assert.match(f.session.getSnapshot().message,/Could not start/);assert(!f.calls.includes('prepare'));assert(!f.calls.includes('record'));
});
test('permission denial never pauses the registered playing player',async()=>{
  const f=fixture({microphone:async()=>({granted:false,canAskAgain:false})});let pauses=0;f.session.bindPlayback(()=>pauses++);await f.session.start();assert.equal(pauses,0);assert(!f.calls.includes('notification'));
});

test('screen integration binds current playback in a layout lifetime and starts without retaining a player closure', async()=>{
  const { readFile }=await import('node:fs/promises');
  const ts=(await import('typescript')).default;
  const source=await readFile(new URL('./App.tsx',import.meta.url),'utf8');
  const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const layoutBindings=[],starts=[];
  function walk(node){
    if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useLayoutEffect'&&node.arguments[0]?.getText(ast).includes('session.bindPlayback'))layoutBindings.push(node);
    if(ts.isCallExpression(node)&&node.expression.getText(ast)==='session.start')starts.push(node);
    ts.forEachChild(node,walk);
  }
  walk(ast);assert.equal(layoutBindings.length,1);assert.equal(layoutBindings[0].arguments[0].body.expression.getText(ast),'session.bindPlayback');
  assert.equal(layoutBindings[0].arguments[0].body.arguments[0].body.expression.getText(ast),'player.pause');
  assert.equal(layoutBindings[0].arguments[1].getText(ast),'[session, player]');assert.equal(starts.length,1);assert.equal(starts[0].arguments.length,0);
});

test('startup recovery locks capture until it settles and runs once per owner', async () => {
  const gate=deferred();let recoveries=0,prepares=0;
  const f=fixture({recover:()=>{recoveries++;return gate.promise;},prepare:async()=>{prepares++;}});
  assert.equal(f.session.getSnapshot().phase,'starting');
  await f.session.start();assert.equal(prepares,0);assert.equal(recoveries,1);
  gate.resolve();await f.session.ready;assert.equal(f.session.getSnapshot().phase,'idle');
  await f.session.start();assert.equal(prepares,1);assert.equal(recoveries,1);
  assert(!f.calls.includes('prepare'));
});
test('recovery failure retains a retry message without fabricating Saved', async () => {
  const f=fixture({recover:async()=>{throw Error('storage unavailable');}});
  await f.session.ready;
  assert.equal(f.session.getSnapshot().savedUri,undefined);
  assert.equal(f.session.getSnapshot().saveVersion,0);
  assert.match(f.session.getSnapshot().message,/Reopen the app to retry/);
});
test('persistent preparation failure cannot start or report a saved recording', async () => {
  const f=fixture({prepare:async()=>{throw Error('storage unavailable');}});
  await f.session.start();assert(!f.calls.includes('record'));
  assert.equal(f.session.getSnapshot().savedUri,undefined);
  assert.equal(f.session.getSnapshot().phase,'idle');
});
