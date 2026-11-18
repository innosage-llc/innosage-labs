import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifact, BUNDLE, requireThat } from './core.mjs';
import { monitor } from './host.mjs';

// XCTest provides genuine accessibility and responsiveness; simctl supplies
// independent PID and crash/fatal monitoring from before the normal cold launch.
export async function iosObservation({ command, output, uuid, app, workspace, derived, fault, onFault = () => {} }) {
  const sim = (...args) => command('xcrun', ['simctl', ...args], { timeout: 10000 });
  sim('install', uuid, app);
  const log = monitor('xcrun', ['simctl', 'spawn', uuid, 'log', 'stream', '--style', 'compact', '--level', 'debug', '--predicate', 'process == "AIRecorder"'], join(output, 'runtime.log'));
  let child; let timer; let deadline; let fatal; let text = ''; let firstPid; const pidSamples = [];
  const now = () => performance.now();
  try {
    await log.waitFor('Filtering the log data');
    const launched = now();
    const uptime = Number(command('python3', ['-c', 'import time; print(time.monotonic())']).trim());
    const launch = sim('launch', '--terminate-running-process', uuid, BUNDLE);
    firstPid = launch.trim().match(/:\s*(\d+)$/)?.[1]; requireThat(firstPid, 'normal Simulator launcher PID missing');
    // Inject launch uptime into the generated .xctestrun, not into the product.
    command('python3', ['-c', `import plistlib,pathlib,sys
p=next(pathlib.Path(sys.argv[1]).glob('Build/Products/*.xctestrun'))
d=plistlib.loads(p.read_bytes())
def update(v):
 if isinstance(v,dict):
  if v.get('BlueprintName')=='StartupGateUITests' or 'StartupGateUITests' in str(v.get('TestBundlePath','')):
   v.setdefault('EnvironmentVariables',{})['LABS85_LAUNCH_UPTIME']=sys.argv[2]
  for item in v.values(): update(item)
 elif isinstance(v,list):
  for item in v:update(item)
update(d);p.write_bytes(plistlib.dumps(d))
print(p)`, derived, String(uptime)]);
    const testRun = command('python3', ['-c', 'import pathlib,sys;print(next(pathlib.Path(sys.argv[1]).glob("Build/Products/*.xctestrun")))', derived]).trim();
    child = spawn('xcodebuild', ['test-without-building', '-xctestrun', testRun, '-destination', `id=${uuid}`, '-only-testing:StartupGateUITests/StartupGateTests/testRecordHome', '-resultBundlePath', join(output, 'startup.xcresult')], { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NSUnbufferedIO: 'YES' } });
    let termination; let done = false;
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
      text += data.toString();
      if (text.length > 8*1024*1024) { fatal = 'XCTest output limit'; child.kill(); }
      if (fault === 'terminate' && !termination && text.includes('LABS85_READY')) termination = setTimeout(() => { try { sim('terminate', uuid, BUNDLE); onFault(); } catch {} }, 1000);
    });
    const result = new Promise((ok, fail) => { child.on('error', fail); child.on('exit', code => { done = true; ok(code); }); });
    timer = setInterval(() => {
      try {
        const listing = sim('spawn', uuid, 'launchctl', 'list');
        const pid = listing.split('\n').find(line => line.includes(BUNDLE))?.trim().split(/\s+/)[0];
        pidSamples.push({ elapsed_ms: now() - launched, identity: pid });
        requireThat(pid === firstPid, 'Simulator process disappeared or restarted');
        requireThat(!/Unhandled JS Exception|RCTFatal|Fatal signal|Terminating app due to uncaught|EXC_BAD_ACCESS/i.test(log.text()), 'Simulator fatal diagnostic');
        requireThat(now() - launched <= 90000, 'bounded XCTest observation timeout');
      } catch (error) { fatal = error.message; child.kill('SIGTERM'); }
    }, 250);
    const code = await Promise.race([result,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('XCTest observation deadline exceeded')),95000);})]).finally(() => { clearTimeout(termination);clearTimeout(deadline); });
    requireThat(code === 0 && done && !fatal, fatal ?? 'XCTest failed');
    const metrics = text.match(/LABS85_OBSERVATION ready_ms=([\d.]+) stable_ms=([\d.]+) samples=(\d+)/);
    requireThat(metrics && Number(metrics[1]) <= 30000 && Number(metrics[2]) >= 5000 && Number(metrics[3]) >= 2 && pidSamples.length >= 2, 'XCTest evidence incomplete');
    sim('io', uuid, 'screenshot', join(output, 'screen.png'));
    const final = { identity: firstPid, ready: true, alive: true, foreground: true, fatal: false };
    return { artifact: artifact(app), target: { kind: 'fresh task Simulator', uuid }, runtime: 'Simulator (exact OS/build recorded by platform driver)', monitor_started_before_launch: true, observation: { readiness_ms: Number(metrics[1]), stable_ms: Number(metrics[2]), identity: firstPid, responsive: true, samples: pidSamples, final, accessibility: 'XCTest; retained startup.xcresult' } };
  } finally { clearInterval(timer); clearTimeout(deadline); child?.kill('SIGTERM'); await log.stop(); writeFileSync(join(output, 'xctest.log'), text); requireThat(!child || child.exitCode !== null || child.signalCode !== null, 'XCTest cleanup unverified'); }
}
