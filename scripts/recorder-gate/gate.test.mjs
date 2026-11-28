import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { REPO, observe, changedPaths, recorderImpact, validatePlatform, artifact, writeJSON } from './core.mjs';
import { main, mergeArguments, reviewGate } from '../auto-merge-ci.mjs';
import { captureRows, xmlControl, confirmAndroidMonitor, hasSavedRecordingFeedback } from './android.mjs';
import { aggregate } from './aggregate.mjs';
import { run, integrationRevision, sourceIdentity } from './host.mjs';
import { criticalHTTP } from './web.mjs';
import { platformGate } from './platform.mjs';

const c = { repo: REPO, pr: 101, head: 'a'.repeat(40), base: 'b'.repeat(40), tested: 'c'.repeat(40), tree: 'd'.repeat(40) };
const review = { candidate: c, decision: 'PASS', role: 'independent-reviewer', model: 'gpt-6.1-sol', effort: 'high', catalog_sha256: 'e'.repeat(64), report_sha256: 'f'.repeat(64) };
const sample = { identity: 'pid/start', alive: true, foreground: true, ready: true, fatal: false };
const green = platform => ({ status: 'PASS', platform, candidate: c, monitor_started_before_launch: true, screenshots:Array.from({length:platform==='web'?2:1},()=>({bytes:100,sha256:'3'.repeat(64)})), artifact: { sha256: '1'.repeat(64), files: [{ path: 'embedded', bytes: 1, sha256: '2'.repeat(64) }] }, target: 'synthetic owned target', runtime: 'synthetic fixture', commands: ['fixture'], observation: { readiness_ms: 300, stable_ms: 5000, identity: sample.identity, responsive: true, samples: [{ ...sample, elapsed_ms: 300 }, { ...sample, elapsed_ms: 5300 }], final: sample } });

test('Recording rows retain distinct precise titles in the Android Play and Share probe', () => {
  const labels = ['10:06:28.870\u202fAM GMT+8', '10:06:28\u202fAM GMT+8 (210 ms)', '9:03\u202fPM'];
  const nodes = labels.map((label, i) =>
    `<node content-desc="${label}, 7 sec" bounds="[32,${100 * i}][740,${100 * i + 80}]"/>`);
  nodes.push('<node content-desc="Morning notes.m4a, 9:14 AM, 47 sec" bounds="[32,310][740,390]"/>');
  assert.deepEqual(captureRows(nodes.join('')).map(({ title }) => title), labels);
});

test('Android staging verification recognizes legacy and current successful-save UI', () => {
  assert.ok(hasSavedRecordingFeedback('<node text="Saved on this device" bounds="[0,0][320,48]"/>'));
  assert.ok(hasSavedRecordingFeedback('<node text="Last recording saved" bounds="[0,0][320,48]"/>'));
  assert.ok(hasSavedRecordingFeedback('<node resource-id="last-recording-saved" content-desc="Last recording saved, 42 sec, View in Library" bounds="[0,0][320,48]"/>'));
  assert.equal(hasSavedRecordingFeedback('<node resource-id="last-recording-saved" displayed="false" bounds="[0,0][320,48]"/>'), false);
  assert.equal(hasSavedRecordingFeedback('<node resource-id="last-recording-saved" bounds="[3,3][3,3]"/>'), false);
  assert.equal(hasSavedRecordingFeedback('<node text="Last recording saved" displayed="false" bounds="[0,0][320,48]"/>'), false);
  assert.equal(hasSavedRecordingFeedback('<node text="Saving…" bounds="[0,0][320,48]"/>'), false);
});

test('Android pre-launch log handshake recovers a marker lost before the reader attaches', async () => {
  let clock = 0; let writes = 0; let text = ''; const deadlines = [];
  await confirmAndroidMonitor({ marker: 'own-marker', log: { text: () => text }, now: () => clock, sleep: async ms => { clock += ms; }, write: async remaining => { writes++; deadlines.push(remaining); if (clock >= 200) text += 'own-marker'; } });
  assert.equal(writes, 3); assert.equal(clock, 200); assert.deepEqual(deadlines, [5000,4900,4800]);
});
test('Android log handshake rejects a missing or exited monitor without reaching launch', async () => {
  let clock = 0; let writes = 0; let launched = false;
  await assert.rejects(async () => { await confirmAndroidMonitor({ marker: 'own-marker', log: { text: () => '' }, now: () => clock, sleep: async ms => { clock += ms; }, write: async () => { writes++; } }); launched = true; }, /monitor readiness timeout/);
  assert.equal(clock, 5000); assert.equal(writes, 50); assert.equal(launched, false);
  await assert.rejects(confirmAndroidMonitor({ marker: 'own-marker', log: { text: () => { throw Error('scoped monitor exited'); } }, write: async () => { throw Error('must not write'); } }), /scoped monitor exited/);
});
test('Android log handshake rejects an over-budget writer even if its late marker arrives', async () => {
  let clock = 0; let text = '';
  await assert.rejects(confirmAndroidMonitor({ marker: 'own-marker', log: { text: () => text }, now: () => clock, write: async () => { clock = 5001; text = 'own-marker'; } }), /monitor readiness timeout/);
});

test('impact accounts for rename/delete/shared/unknown paths; only known other examples skip Recorder', () => {
  assert.deepEqual(changedPaths('R100\0examples/ai-recorder/App.tsx\0examples/studio-workspace/moved.tsx\0D\0package-lock.json\0'), ['examples/ai-recorder/App.tsx', 'examples/studio-workspace/moved.tsx', 'package-lock.json']);
  for (const paths of [[], ['README.md'], ['scripts/auto-merge-ci.mjs'], ['package-lock.json'], ['examples/unknown/file'], ['examples/studio-workspace/a', 'examples/ai-recorder/App.tsx']]) assert.equal(recorderImpact(paths).affected, true);
  assert.equal(recorderImpact(['examples/studio-workspace/src/model.ts']).affected, false);
  assert.throws(() => changedPaths('R100\0only-one\0'));
  assert.throws(() => changedPaths('UNKNOWN\0path\0'));
});

test('observation waits bounded readiness then a full five monotonic seconds and rechecks after response', async () => {
  let clock = 0; let responsive = 0;
  const result = await observe({ now: () => clock, sleep: async ms => { clock += ms; }, probe: async () => ({ ...sample, ready: clock >= 27000 }), responsive: async () => { responsive++; return true; } });
  assert.equal(result.readiness_ms, 27000); assert.equal(result.stable_ms, 5000); assert.equal(clock, 32000); assert.equal(responsive, 1);
});
for (const failure of ['dead', 'restart', 'fatal', 'background', 'control disappears', 'splash', 'unresponsive', 'final', 'clock', 'gap']) test(`observation blocks ${failure}`, async () => {
  let clock = 0; let calls = 0; let response = false;
  const probe = async () => {
    calls++; const s = { ...sample };
    if (clock >= 1000) {
      if (failure === 'dead') s.alive = false;
      if (failure === 'restart') s.identity = 'another';
      if (failure === 'fatal') s.fatal = true;
      if (failure === 'background') s.foreground = false;
      if (failure === 'control disappears') s.ready = false;
    }
    if (failure === 'splash') s.ready = false;
    if (failure === 'final' && response) s.ready = false;
    return s;
  };
  await assert.rejects(observe({ now: () => clock, sleep: async ms => { clock += failure === 'gap' ? 2000 : failure === 'clock' ? -1 : ms; }, probe, responsive: async () => { response = true; return failure !== 'unresponsive'; } }));
});

test('artifact digest covers content and names, rejects symlinks and empty files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-artifact-')); writeFileSync(join(dir, 'a'), 'bundle');
  const first = artifact(dir).sha256; writeFileSync(join(dir, 'a'), 'changed'); assert.notEqual(artifact(dir).sha256, first);
  symlinkSync('a', join(dir, 'link')); assert.throws(() => artifact(dir), /symlink/);
});
test('Android accessibility requires actual labelled control with positive visible bounds', () => {
  assert.deepEqual(xmlControl('<node content-desc="Start recording" bounds="[10,20][110,220]"/>', 'Start recording'), { x: 60, y: 120 });
  assert.equal(xmlControl('<node text="Start recording" bounds="[0,0][0,0]"/>', 'Start recording'), null);
  assert.equal(xmlControl('<node text="Splash" bounds="[0,0][20,20]"/>', 'Start recording'), null);
});

async function fixture(change = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'labs-merge-spy-')); const output = join(dir, 'evidence'); mkdirSync(output);
  const cp = join(dir, 'candidate.json'), rp = join(dir, 'review.json'); writeJSON(cp, c); writeJSON(rp, review);
  const calls = []; const events = []; let snapshots = 0;
  const deps = {
    clean: () => {}, sourceIdentity: () => {}, head: () => c.head,
    snapshot: () => { snapshots++; return { ...c, draft:false, ...(snapshots > 1 ? change.drift : {}) }; },
    assertSnapshot: (a,b) => { assert.equal(a.head,b.head,'head drift'); assert.equal(a.base,b.base,'base drift'); },
    checkout: () => {}, paths: () => change.paths ?? ['examples/ai-recorder/App.tsx'],
    ci: async () => { events.push('ci'); if (change.ciThrows) throw new Error('failed CI command'); return { status: change.ci ?? 'PASS' }; },
    aggregate: async () => { events.push('platforms'); const platforms = Object.fromEntries(['android','ios','web'].map(p => [p,green(p)])); if (change.platform) platforms[change.platform] = change.result;
      return { status: change.aggregate ?? 'PASS', candidate: change.staleAggregate ? { ...c, head: '0'.repeat(40) } : c, platforms }; },
    merge: async candidate => { events.push('merge'); calls.push(mergeArguments(candidate)); return { merged: true, sha: '9'.repeat(40) }; },
    ...change.deps,
  };
  const args = ['--repo',REPO,'--pr',String(c.pr),'--head',c.head,'--base',c.base,'--candidate',cp,'--review',rp,'--output',output];
  let error; try { await main(args, deps); } catch (e) { error = e; }
  return { calls, events, error, receipt: existsSync(join(output,'merge-gate.json')) ? JSON.parse(readFileSync(join(output,'merge-gate.json'),'utf8')) : null };
}
test('actual CLI controller makes exactly one repository/head-guarded merge request after gates', async () => {
  const f = await fixture(); assert.ifError(f.error); assert.deepEqual(f.events,['ci','platforms','merge']); assert.deepEqual(f.calls,[['api','--method','PUT',`repos/${REPO}/pulls/101/merge`,'-f',`sha=${c.head}`,'-f','merge_method=squash']]);
});
for (const platform of ['android','ios','web']) for (const kind of ['failed','missing','stale','incomplete']) test(`merge spy: zero calls for ${platform} ${kind}`, async () => {
  let result = green(platform);
  if (kind === 'failed') result.status = 'FAIL';
  if (kind === 'missing') result = undefined;
  if (kind === 'stale') result.candidate = { ...c, base: '0'.repeat(40) };
  if (kind === 'incomplete') delete result.observation.final;
  const f = await fixture({ platform, result }); assert.ok(f.error); assert.deepEqual(f.calls,[]); assert.equal(f.receipt.merge_attempted,false);
});
for (const change of [{ ci:'FAIL' }, { ciThrows:true }, { aggregate:'FAIL' }, { aggregate:undefined, staleAggregate:true }, { drift:{ head:'0'.repeat(40) } }, { drift:{ base:'0'.repeat(40) } }]) test(`merge spy: zero calls for ${JSON.stringify(change)}`, async () => {
  const f = await fixture(change); assert.ok(f.error); assert.deepEqual(f.calls,[]);
});
test('unrelated change still runs applicable local CI and never bypasses a failing CI', async () => {
  const paths = ['examples/studio-workspace/src/model.ts'];
  const f = await fixture({ paths }); assert.ifError(f.error); assert.deepEqual(f.events,['ci','platforms','merge']);
  const red = await fixture({ paths, ci:'FAIL' }); assert.ok(red.error); assert.deepEqual(red.calls,[]); assert.deepEqual(red.events,['ci']);
});
test('draft PR and local-head drift are blocked before any CI or merge request',async()=>{
  for(const deps of [{snapshot:()=>({...c,draft:true})},{head:()=> '0'.repeat(40)}]) {
    const result=await fixture({deps});assert.ok(result.error);assert.deepEqual(result.events,[]);assert.deepEqual(result.calls,[]);
  }
});
test('review receipts and platform receipts fail on stale head, wrong role and incomplete evidence', () => {
  assert.throws(() => validatePlatform({ ...green('web'), observation: { ...green('web').observation, stable_ms:4999 } }, c, 'web'));
  for(const delta of [{candidate:{...c,tested:'0'.repeat(40)}},{role:'implementer'},{effort:'medium'},{decision:'REQUEST_CHANGES'},{catalog_sha256:null}]) assert.throws(()=>reviewGate({...review,...delta},c));
});

function repository() {
  const source = mkdtempSync(join(tmpdir(),'labs-git-fixture-'));
  const g = (...args) => run('git',['-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid',...args],{cwd:source,env:{GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}}).trim();
  g('init','-b','main');writeFileSync(join(source,'base'),'base');g('add','.');g('commit','-m','synthetic base');
  return { source,g };
}
test('exact integration commit combines base/head trees deterministically; clean wrong revision fails identity', () => {
  const {source,g}=repository();const initial=g('rev-parse','HEAD');
  g('switch','-c','topic');writeFileSync(join(source,'topic'),'topic');g('add','.');g('commit','-m','topic');const head=g('rev-parse','HEAD');
  g('switch','main');writeFileSync(join(source,'main-only'),'main advanced');g('add','.');g('commit','-m','main advances');const base=g('rev-parse','HEAD');
  const first=integrationRevision(base,head,source);assert.deepEqual(first,integrationRevision(base,head,source));
  assert.equal(g('show','-s','--format=%P',first.tested),`${base} ${head}`);
  assert.match(g('ls-tree','--name-only',first.tested),/main-only/);assert.match(g('ls-tree','--name-only',first.tested),/topic/);
  assert.throws(()=>sourceIdentity(source,{tested:initial,tree:first.tree}),/revision/);
});
test('actual aggregator runs all three, collects failures and never accepts missing results; unrelated skip is explicit', async () => {
  const {source}=repository();
  for(const failing of [null,'android','ios','web']) {
    const output=mkdtempSync(join(tmpdir(),'labs-aggregate-'));const called=[];
    const action=aggregate({source,candidate:c,paths:['scripts/recorder-gate/core.mjs'],output,targets:{}},async({platform})=>{called.push(platform);if(platform===failing)return undefined;return green(platform);});
    if(failing)await assert.rejects(action);else assert.equal((await action).status,'PASS');
    assert.deepEqual(called,['android','ios','web']);
    assert.equal(JSON.parse(readFileSync(join(output,'startup-gate.json'),'utf8')).status,failing?'FAIL':'PASS');
  }
  const output=mkdtempSync(join(tmpdir(),'labs-aggregate-'));
  const result=await aggregate({source,candidate:c,paths:['examples/studio-workspace/src/model.ts'],output},()=>{throw new Error('must skip');});
  assert.equal(result.status,'PASS');assert.equal(result.impact.affected,false);assert.match(result.impact.reason,/local CI/);
});
test('readiness budget includes time spent in the normal launcher before probes begin', async()=>{
  let clock=31000;
  await assert.rejects(observe({launchedAt:0,now:()=>clock,probe:async()=>sample,responsive:async()=>true,sleep:async()=>{clock+=100;}}),/timeout/);
});
test('hung runtime probes are bounded and cannot create an incomplete green receipt',async()=>{
  await assert.rejects(observe({probe:()=>new Promise(()=>{}),responsive:async()=>true,maxGap:10}),/probe timeout/);
});
test('HTTP 200 index alone cannot mask a missing critical entry; only optional favicon is exempt',()=>{
  assert.equal(criticalHTTP(200,'/','document'),false);
  for(const type of ['script','stylesheet','image','font','fetch'])assert.equal(criticalHTTP(404,'/missing',type),true);
  assert.equal(criticalHTTP(404,'/favicon.ico','other'),false);
  assert.equal(criticalHTTP(404,'/favicon.ico','script'),true);
});
test('actual platform entry points fail closed for absent native targets and unavailable Web build tool',async()=>{
  const {source,g}=repository();const app=join(source,'examples/ai-recorder');mkdirSync(app,{recursive:true});
  const base=g('rev-parse','HEAD');
  for(const name of ['app.json','package.json','package-lock.json'])writeFileSync(join(app,name),'{}');
  g('add','.');g('commit','-m','synthetic build inputs');const head=g('rev-parse','HEAD');
  const candidate={...c,base,head,...integrationRevision(base,head,source)};g('switch','--detach',candidate.tested);
  for(const platform of ['android','ios','web']) {
    const output=mkdtempSync(join(tmpdir(),'labs-platform-missing-'));
    await assert.rejects(platformGate({platform,source,candidate,output,targets:{}}));
    const result=JSON.parse(readFileSync(join(output,'result.json'),'utf8'));
    assert.equal(result.status,'FAIL');assert.equal(result.stage,platform==='web'?'build':'preflight');
    if(platform!=='web')assert.deepEqual(result.commands,[]);
  }
});
test('standalone iOS rejects an inconsistent integration manifest before starting a Simulator', async () => {
  const {source,g}=repository();const base=g('rev-parse','HEAD');
  try {
    writeFileSync(join(source,'head'),'topic');g('add','.');g('commit','-m','synthetic topic');const head=g('rev-parse','HEAD');
    const candidate={...c,base,head,...integrationRevision(base,head,source)};
    g('switch','--detach',candidate.tested);
    const forgedTree=g('rev-parse',`${base}^{tree}`);
    const forged=g('commit-tree',forgedTree,'-p',base,'-p',head,'-m','different integration tree');
    for(const [manifest, revision, reason] of [
      [{...candidate,tree:forgedTree},candidate.tested,/revision\/tree changed/],
      [{...candidate,base:head,head:base},candidate.tested,/exact base\/head integration/],
      [{...candidate,tree:forgedTree,tested:forged},forged,/integration result drift/],
    ]) {
      g('switch','--detach',revision);
      const output=mkdtempSync(join(tmpdir(),'labs-ios-manifest-'));
      try {
        await assert.rejects(platformGate({platform:'ios',source,candidate:manifest,output,targets:{iosRuntime:'com.apple.CoreSimulator.SimRuntime.iOS-27-2'}}),reason);
        const result=JSON.parse(readFileSync(join(output,'result.json'),'utf8'));
        assert.equal(result.status,'FAIL');assert.equal(result.stage,'preflight');assert.deepEqual(result.commands,[]);
      } finally { rmSync(output,{recursive:true,force:true}); }
    }
  } finally { rmSync(source,{recursive:true,force:true}); }
});

test('synchronous callbacks cannot beat a delayed timeout timer; final probe is also bounded', async()=>{
  const { bounded }=await import('./core.mjs');
  const stall=()=>{const until=performance.now()+25;while(performance.now()<until){};return true;};
  for(const label of ['runtime probe','responsiveness','final runtime probe'])await assert.rejects(bounded(stall,5,label),new RegExp(`${label} timeout`));
  let clock=0,responded=false;
  await assert.rejects(observe({now:()=>clock,sleep:async()=>{clock+=1;},window:10,maxGap:5,probe:()=>{if(responded)stall();return sample;},responsive:()=>{responded=true;return true;}}),/final runtime probe timeout/);
});
test('asynchronous observation subprocess is cancelled by its enclosing deadline',async()=>{
  const { bounded }=await import('./core.mjs');const { runAsync }=await import('./host.mjs');let result;
  await assert.rejects(bounded(signal=>runAsync(process.execPath,['-e','setTimeout(()=>{},10000)'],{signal,onResult:r=>{result=r;}}),50,'fixture subprocess'),/timeout/);
  for(let i=0;i<100&&!result;i++)await new Promise(r=>setTimeout(r,10));
  assert.ok(result);assert.equal(result.signal,'SIGKILL');
});
test('compiled iOS sampling contract rejects runner pause, stalled query, disappearance, background and clock regressions',async()=>{
  const { parseAccessibility }=await import('./ios.mjs');
  const root=new URL('.',import.meta.url).pathname;const dir=mkdtempSync(join(tmpdir(),'labs-swift-fixture-'));const exe=join(dir,'samples');
  run('xcrun',['swiftc','-module-cache-path',join(dir,'cache'),join(root,'StabilityWindow.swift'),join(root,'StabilityWindowFixture.swift'),'-o',exe]);
  assert.match(run(exe,['healthy']),/PASS healthy/);
  const healthy={ready_ms:100,stable_ms:5000,max_gap_ms:1500,observed_max_gap_ms:1000,samples_ms:[100,1100,2100,3100,4100,5100]};
  assert.equal(parseAccessibility(`LABS85_OBSERVATION_JSON ${JSON.stringify(healthy)}`).stable_ms,5000);
  for(const mode of ['runner-pause','query-stall','disappeared','background','clock']) {
    assert.match(run(exe,[mode]),new RegExp(`REJECT ${mode}`));
    const f=await fixture({deps:{aggregate:()=>{assert.match(run(exe,[mode]),new RegExp(`REJECT ${mode}`));throw new Error('controlled iOS observation rejected');}}});assert.deepEqual(f.calls,[]);
  }
  assert.throws(()=>parseAccessibility(`LABS85_OBSERVATION_JSON ${JSON.stringify({...healthy,samples_ms:[100,200,6200],stable_ms:6100})}`),/coverage gap/);
});
test('required local CI stages each prevent the real controller merge, with complete failed-command evidence',async()=>{
  const { localCI }=await import('./local-ci.mjs');
  for(const stage of ['tests/check_runtime_boundary.py','required-mac-fixtures.py','unittest','test:browser-parity']) {
    let output;
    const f=await fixture({paths:['examples/is-clean-my-mac/scripts/change.py'],deps:{ci:(source,paths,dir)=>{
      output=dir;return localCI(source,paths,dir,{clean:()=>{},run:(command,args,opts)=>{
        const failing=args.some(a=>a===stage||a.endsWith('/'+stage));
        if(failing) return run(process.execPath,['-e','console.log("fixture stdout");console.error("fixture stderr");process.exit(7)'],{onResult:opts.onResult});
        opts.onResult({status:0,signal:null,stdout:'synthetic prerequisite',stderr:''});return '';
      }});
    }}});
    assert.ok(f.error,stage);assert.deepEqual(f.calls,[]);assert.equal(f.receipt.ci.status,'FAIL');
    const ci=JSON.parse(readFileSync(join(output,'applicable-ci.json'),'utf8'));assert.deepEqual(f.receipt.ci,ci);
    const last=ci.commands.at(-1);assert.equal(last.exit_code,7);assert.equal(last.signal,null);assert.ok(last.duration_ms>=0);
    assert.match(readFileSync(join(output,`ci-${ci.commands.length}.log`),'utf8'),/fixture stdout\n\nfixture stderr/);
  }
});
test('signal-terminated local CI preserves signal/stdout/stderr and blocks merge',async()=>{
  const { localCI }=await import('./local-ci.mjs');let output;
  const f=await fixture({deps:{ci:(source,paths,dir)=>{output=dir;return localCI(source,paths,dir,{clean:()=>{},run:(command,args,opts)=>run(process.execPath,['-e','console.log("before signal");console.error("signal diagnostic");process.kill(process.pid,"SIGTERM")'],{onResult:opts.onResult})});}}});
  assert.deepEqual(f.calls,[]);assert.ok(f.error);assert.equal(f.receipt.ci.status,'FAIL');
  const last=f.receipt.ci.commands.at(-1);assert.equal(last.signal,'SIGTERM');assert.equal(last.exit_code,null);
  assert.match(readFileSync(join(output,'ci-1.log'),'utf8'),/before signal\n\nsignal diagnostic/);
});
test('required Mac runner refuses skipped native fixture coverage',()=>{
  const dir=mkdtempSync(join(tmpdir(),'labs-skipped-mac-fixture-'));
  writeFileSync(join(dir,'test_skipped.py'),'import unittest\nclass Missing(unittest.TestCase):\n @unittest.skip("fixture unavailable")\n def test_required(self): pass\n');
  assert.throws(()=>run('python3',['-B',new URL('required-mac-fixtures.py',import.meta.url).pathname,dir]),/failed/);
});

test('over-budget synchronous probes and slow final probes make zero controller merge calls',async()=>{
  for(const finalOnly of [false,true]) {
    let clock=0,responded=false;
    const f=await fixture({deps:{aggregate:()=>observe({now:()=>clock,sleep:async()=>{clock+=1;},window:10,maxGap:5,
      probe:()=>{if(!finalOnly||responded){const until=performance.now()+25;while(performance.now()<until){}}return sample;},responsive:()=>{responded=true;return true;}})}});
    assert.match(f.error.message,finalOnly?/final runtime probe timeout/:/runtime probe timeout/);assert.deepEqual(f.calls,[]);
  }
});

test('generated XCTest project has named products, startup and Markdown sources, application dependency and shared test scheme',()=>{
  const dir=mkdtempSync(join(tmpdir(),'labs-xcode-fixture-'));const project=join(dir,'AIRecorder.xcodeproj');const ruby=process.env.LABS85_RUBY??'ruby';
  run(ruby,['-rxcodeproj','-e','p=Xcodeproj::Project.new(ARGV[0]);a=p.new_target(:application,"AIRecorder",:ios,"16.4");p.save;s=Xcodeproj::XCScheme.new;s.add_build_target(a);s.save_as(ARGV[0],"AIRecorder",true)',project]);
  run(ruby,[new URL('add-ios-test.rb',import.meta.url).pathname,project,new URL('StartupGateTests.swift',import.meta.url).pathname]);
  const inspected=JSON.parse(run(ruby,['-rxcodeproj','-rjson','-e','p=Xcodeproj::Project.open(ARGV[0]);t=p.targets.find{|x|x.name=="StartupGateUITests"};puts JSON.generate({products:t.build_configurations.map{|c|c.build_settings["PRODUCT_NAME"]},sources:t.source_build_phase.files_references.map(&:display_name).sort,dependencies:t.dependencies.size,scheme:File.read(File.join(ARGV[0],"xcshareddata/xcschemes/AIRecorder.xcscheme")).include?(t.uuid)})',project]));
  assert.deepEqual(inspected,{products:['$(TARGET_NAME)','$(TARGET_NAME)'],sources:['LibraryImportTests.swift','MarkdownGateTests.swift','StabilityWindow.swift','StartupGateTests.swift'],dependencies:1,scheme:true});
});


test('iOS readiness origin is a shared kernel uptime and refuses invalid data', async () => {
  const { iosLaunchUptime } = await import('./ios.mjs');
  assert.throws(() => iosLaunchUptime(() => ''), /uptime unavailable/);
  assert.throws(() => iosLaunchUptime(() => 'NaN'), /uptime unavailable/);
  if (process.platform === 'darwin') {
    const clock = () => iosLaunchUptime((program, args) => run(program, args));
    const first = clock();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(clock() - first >= 0.03, 'a different Python process must share the boot clock');
  }
});
