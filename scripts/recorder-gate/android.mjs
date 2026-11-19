import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BUNDLE, artifact, observe, requireThat } from './core.mjs';
import { monitor } from './host.mjs';

export function xmlControl(xml, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const node = xml.match(new RegExp(`<node\\b[^>]*(?:text|content-desc)="${escaped}"[^>]*>`));
  if (!node || /(?:visible-to-user|displayed)="false"/.test(node[0])) return null;
  const bounds = node[0].match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds) return null;
  const [x1,y1,x2,y2] = bounds.slice(1).map(Number);
  return x2 > x1 && y2 > y1 ? { x: Math.round((x1+x2)/2), y: Math.round((y1+y2)/2) } : null;
}
// adb may not have attached logcat when the first marker is written. Repeat the
// pre-launch handshake until the actual stream echoes it, under one deadline.
export async function confirmAndroidMonitor({ log, marker, write, timeout = 5000, now = () => performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  const began = now();
  for (;;) {
    const remaining = timeout - (now() - began);
    requireThat(remaining > 0, 'monitor readiness timeout');
    if (log.text().includes(marker)) return;
    await write(remaining);
    requireThat(now() - began <= timeout, 'monitor readiness timeout');
    if (log.text().includes(marker)) return;
    await sleep(Math.min(100, timeout - (now() - began)));
  }
}
export async function androidObservation({ command, asyncCommand, output, serial, apk, fault, onFault = () => {} }) {
  requireThat(/^emulator-\d+$/.test(serial ?? ''), 'dedicated Android emulator serial required');
  const adb = (...args) => command('adb', ['-s', serial, ...args], { timeout: 10000 });
  requireThat(adb('shell', 'getprop', 'ro.kernel.qemu').trim() === '1', 'physical Android targets prohibited');
  const avd = adb('emu', 'avd', 'name').split('\n')[0].trim();
  requireThat(avd.startsWith('labs85-'), 'use a task-owned labs85- AVD');
  const runtime = `Android ${adb('shell', 'getprop', 'ro.build.version.release').trim()} / API ${adb('shell', 'getprop', 'ro.build.version.sdk').trim()}`;
  adb('install', '-r', apk); adb('shell', 'am', 'force-stop', BUNDLE);
  const log = monitor('adb', ['-s', serial, 'logcat', '-T', '1', '-v', 'threadtime', 'AndroidRuntime:E', 'ReactNativeJS:E', 'libc:F', 'Labs85Monitor:I', '*:S'], join(output, 'runtime.log'));
  let termination;
  const read = (signal,...args) => asyncCommand('adb',['-s',serial,...args],{timeout:10000,signal});
  async function tree(signal) { await read(signal,'shell','uiautomator','dump','--compressed','/sdcard/labs85-window.xml');return read(signal,'shell','cat','/sdcard/labs85-window.xml'); }
  async function foreground(signal) { return (await read(signal,'shell','dumpsys','activity','activities')).split('\n').some(line => /(?:mResumedActivity|topResumedActivity)/.test(line) && line.includes(BUNDLE)); }
  try {
    const marker = `labs85-${randomUUID()}`;
    await confirmAndroidMonitor({ log, marker, write: remaining => asyncCommand('adb', ['-s', serial, 'shell','log','-p','i','-t','Labs85Monitor',marker], { timeout: Math.max(1, Math.floor(remaining)) }) });
    const start = performance.now();
    const launch = adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-n', `${BUNDLE}/.MainActivity`);
    requireThat(/Status: ok/.test(launch), 'launcher failed');
    const pid = adb('shell', 'pidof', BUNDLE).trim(); requireThat(/^\d+$/.test(pid), 'original Android PID missing');
    const processIdentity = async signal => `${(await read(signal,'shell','pidof',BUNDLE)).trim()}/${(await read(signal,'shell','cat',`/proc/${pid}/stat`)).trim().replace(/^\d+ \(.*\) /,'').split(/\s+/)[19]}`;
    const identity = await processIdentity();
    const observation = await observe({
      launchedAt: start, maxGap: 4000,
      // UIAutomator dumps are bounded snapshots; the continuous fatal log and PID
      // checks complement them. Command stalls fail the observation coverage bound.
      probe: async signal => {
        const xml = await tree(signal); const current = await processIdentity(signal);
        return { identity: current, alive: current === identity, foreground: await foreground(signal), ready: !!xmlControl(xml, 'Start recording'), fatal: /FATAL EXCEPTION|Fatal signal|ReactNativeJS.*(?:Error|Exception|Invariant)/i.test(log.text()) };
      },
      onReady: async () => { if (fault === 'terminate') termination = setTimeout(() => { try { adb('shell', 'am', 'force-stop', BUNDLE); onFault(); } catch {} }, 1000); },
      responsive: async signal => {
        const library = xmlControl(await tree(signal), 'Library'); requireThat(library, 'Library navigation missing');
        await read(signal,'shell', 'input', 'tap', String(library.x), String(library.y));
        requireThat((await tree(signal)).includes('Your recordings live here'), 'Library navigation did not respond');
        const record = xmlControl(await tree(signal), 'Record'); requireThat(record, 'Record navigation missing');
        await read(signal,'shell', 'input', 'tap', String(record.x), String(record.y));
        return !!xmlControl(await tree(signal), 'Start recording');
      },
    }).finally(() => clearTimeout(termination));
    command('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', outputFile: join(output, 'screen.png') });
    return { observation, runtime, target: { kind: 'task-owned emulator', avd, serial }, artifact: artifact(apk), monitor_started_before_launch: true };
  } finally { await log.stop(); }
}
