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
    const uptime = iosLaunchUptime(command);
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
    const metrics = parseAccessibility(text);
    requireThat(pidSamples.length >= 2, 'Simulator process evidence incomplete');
    sim('io', uuid, 'screenshot', join(output, 'screen.png'));
    const final = { identity: firstPid, ready: true, alive: true, foreground: true, fatal: false };
    return { artifact: artifact(app), target: { kind: 'fresh task Simulator', uuid }, runtime: 'Simulator (exact OS/build recorded by platform driver)', monitor_started_before_launch: true, observation: { readiness_ms: metrics.ready_ms, stable_ms: metrics.stable_ms, max_gap_ms: metrics.max_gap_ms, accessibility_samples_ms: metrics.samples_ms, observed_max_gap_ms: metrics.observed_max_gap_ms, identity: firstPid, responsive: true, samples: pidSamples, final, accessibility: 'XCTest; retained startup.xcresult' } };
  } finally { clearInterval(timer); clearTimeout(deadline); child?.kill('SIGTERM'); await log.stop(); writeFileSync(join(output, 'xctest.log'), text); requireThat(!child || child.exitCode !== null || child.signalCode !== null, 'XCTest cleanup unverified'); }
}

// Independently check the XCTest accessibility timeline rather than trusting a
// duration summary. PID samples remain a separate process-lifetime observation.
export function iosLaunchUptime(command) {
  // Apple's bundled Python can give time.monotonic() a per-process origin.
  // XCTest's Foundation systemUptime is the kernel's awake-only boot clock.
  const value = Number(command('python3', ['-c',
    'import time; print(time.clock_gettime(time.CLOCK_UPTIME_RAW))']).trim());
  requireThat(Number.isFinite(value) && value > 0, 'Simulator launch uptime unavailable');
  return value;
}

export function parseAccessibility(text) {
  const lines = [...text.matchAll(/LABS85_OBSERVATION_JSON (\{[^\n]+\})/g)];
  requireThat(lines.length === 1, 'XCTest observation missing or duplicated');
  const m = JSON.parse(lines[0][1]);
  requireThat(Number.isFinite(m.ready_ms) && m.ready_ms >= 0 && m.ready_ms <= 30000 && m.max_gap_ms === 1500, 'XCTest readiness/bound incomplete');
  requireThat(Array.isArray(m.samples_ms) && m.samples_ms.length >= 2 && m.samples_ms[0] === m.ready_ms, 'XCTest accessibility samples missing');
  let maximum = 0;
  for (let i=0;i<m.samples_ms.length;i++) {
    const at=m.samples_ms[i];
    requireThat(Number.isFinite(at), 'XCTest sample time invalid');
    if(i) { const gap=at-m.samples_ms[i-1];requireThat(gap>=0 && gap<=m.max_gap_ms,'XCTest accessibility coverage gap');maximum=Math.max(maximum,gap); }
  }
  requireThat(m.stable_ms >= 5000 && Math.abs(m.stable_ms-(m.samples_ms.at(-1)-m.ready_ms))<0.01 && Math.abs(m.observed_max_gap_ms-maximum)<0.01, 'XCTest stability evidence incomplete');
  return m;
}
