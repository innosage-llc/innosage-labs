import { spawn, spawnSync } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { BUNDLE, requireThat, sha, writeJSON } from '../../../scripts/recorder-gate/core.mjs';
import { clean, cli, git, root, run, runAsync } from '../../../scripts/recorder-gate/host.mjs';
import { readCandidate } from './verify-release.mjs';

const adbPort = '5117';
const consolePort = '5558';
const grpcPort = '8657';
const serial = `emulator-${consolePort}`;
const image = 'system-images;android-36;google_apis;arm64-v8a';
const probe = fileURLToPath(new URL('./android-speaker-probe.mjs', import.meta.url));
const controller = new AbortController();
const { signal } = controller;
for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(name, () => controller.abort(new Error(`Received ${name}`)));

const digest = path => sha(readFileSync(path));
const json = path => JSON.parse(readFileSync(path, 'utf8'));

function portOwners(port) {
  const found = spawnSync('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8', timeout: 3000 });
  requireThat(!found.error && [0, 1].includes(found.status) && !found.stderr, `Unable to inspect local port ${port}`);
  return found.stdout.trim().split(/\s+/).filter(Boolean);
}

function start(command, args, log) {
  const file = openSync(log, 'wx', 0o600);
  let child;
  try { child = spawn(command, args, { stdio: ['ignore', file, file] }); }
  finally { closeSync(file); }
  let status;
  const closed = new Promise(resolve => child.once('close', (code, signal) => { status = { code, signal }; resolve(status); }));
  let failure;
  child.once('error', error => { failure = error; });
  return {
    pid: child.pid,
    check() { if (failure) throw failure; requireThat(!status, `${command} exited; see ${log}`); },
    async stop() {
      if (status) return;
      child.kill('SIGTERM');
      await Promise.race([closed, delay(5000, null, { ref: false })]);
      if (!status) child.kill('SIGKILL');
      await Promise.race([closed, delay(5000, null, { ref: false })]);
      requireThat(status, `Task process did not exit: ${command}`);
    },
  };
}

async function until(check, timeout, label) {
  const limit = performance.now() + timeout;
  while (performance.now() < limit) {
    signal.throwIfAborted();
    if (await check()) return;
    await delay(500, null, { signal });
  }
  throw new Error(`${label} timed out`);
}

function sourceIdentity(source) {
  const g = (...args) => run('git', args, { cwd: source }).trim();
  requireThat(realpathSync(g('rev-parse', '--show-toplevel')) === source, 'Use the root of the staging source checkout');
  clean(source);
  return { revision: g('rev-parse', 'HEAD'), tree: g('rev-parse', 'HEAD^{tree}') };
}

function bindCandidate(manifest, output, aapt2, source) {
  const specification = json(manifest);
  const { apk, androidReceipt } = specification;
  requireThat([apk, androidReceipt].every(value => typeof value === 'string' && value.trim()), 'Missing Android build evidence');
  const snapshot = { ...specification, apk: 'staging.apk', androidReceipt: 'android-startup.json' };
  copyFileSync(resolve(dirname(manifest), apk), join(output, snapshot.apk));
  copyFileSync(resolve(dirname(manifest), androidReceipt), join(output, snapshot.androidReceipt));
  if (snapshot.distribution) snapshot.distribution.artifact = resolve(dirname(manifest), snapshot.distribution.artifact);
  const snapshotPath = join(output, 'candidate.json');
  writeJSON(snapshotPath, snapshot);
  const candidate = readCandidate(snapshotPath, (_, args) => run(aapt2, args));
  const startup = json(join(output, snapshot.androidReceipt));
  requireThat(source.tree === startup.candidate.tree, 'Checkout tree differs from the exact Android staging receipt');
  return { ...candidate, candidateId: sha(JSON.stringify(candidate)), tree: source.tree };
}

function evidence(directory, receipt, candidate, avd, head, apk, mode) {
  const detail = mode === 'journey-detail';
  requireThat(receipt.status === 'PASS' && receipt.stage === 'complete' && receipt.head === head && receipt.avd === avd &&
    receipt.serial === serial && receipt.apk_sha256 === candidate.apkSha256 && digest(apk) === candidate.apkSha256 &&
    receipt.journey === (detail ? 'repeat-capture-detail' : 'library-inline'),
  'Journey receipt is incomplete or belongs to a different candidate or emulator');
  requireThat(/^\d+$/.test(receipt.before_pid ?? '') && /^\d+$/.test(receipt.after_pid ?? '') &&
    receipt.before_pid !== receipt.after_pid && receipt.labels?.A && receipt.labels?.B && receipt.labels.A !== receipt.labels.B,
  'Distinct Library rows and fresh-process evidence are required');
  const reopened = readFileSync(join(directory, 'reopened-library.xml'), 'utf8');
  const rowLabels = detail ? receipt.row_labels : receipt.labels;
  requireThat(['A', 'B'].every(marker => rowLabels?.[marker] && reopened.includes(`content-desc="${rowLabels[marker]}"`) &&
    readFileSync(join(directory, `saved-${marker}.xml`), 'utf8').includes('Saved on this device')), 'Saved or reopened Library evidence missing');
  const controls = detail
    ? [['A', 'A'], ['B', 'B'], ['open-A', null], ['rapid-back-A', null]]
    : [['B', 'B'], ['stale-A', 'A'], ['silence', null]];
  for (const [name, marker] of controls) {
    const path = join(directory, name, 'speaker.pcm');
    const pcm = readFileSync(path);
    const observation = receipt.controls?.[name];
    const expected = detail && marker ? marker : 'B';
    const scored = spawnSync(process.execPath, [probe, 'score', expected, path], { encoding: 'utf8', timeout: 15_000 });
    const score = scored.stdout ? JSON.parse(scored.stdout) : {};
    requireThat(scored.status === (marker === expected ? 0 : 1) && score.marker === marker &&
      observation?.marker === marker && score.samples === observation.samples && score.samples >= 8000 && pcm.length === observation.bytes &&
      sha(pcm) === observation.sha256 && (detail || name === 'B' || observation.rejection) && (marker !== null || score.peak <= 64),
    `Missing or invalid ${name} speaker evidence`);
  }
}

async function main() {
  const began = performance.now();
  const options = cli(process.argv.slice(2), ['candidate', 'out', 'source', 'sdk', 'aapt2']);
  requireThat(options.candidate && options.out, 'Use --candidate <manifest.json> --out <new-directory>');
  const requested = resolve(options.out);
  const output = resolve(realpathSync(dirname(requested)), requested.split('/').at(-1));
  const checkout = realpathSync(root);
  const source = realpathSync(options.source ?? root);
  requireThat([checkout, source].every(path => output !== path && !output.startsWith(`${path}/`)), 'Keep evidence outside both repositories');
  process.umask(0o077);
  mkdirSync(output, { mode: 0o700 });
  const report = { schemaVersion: 1, evidence: 'AUTOMATED_ANDROID_STAGING', status: 'FAIL', stage: 'candidate', retries: 0 };
  let scratch, adbServer, emulator;
  try {
    requireThat(process.platform === 'darwin' && process.arch === 'arm64', 'Use the qualified Apple silicon Android Emulator setup');
    const sdkPath = options.sdk ?? process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
    requireThat(sdkPath, 'Set ANDROID_HOME to the installed Android SDK');
    const sdk = realpathSync(sdkPath);
    const aapt2 = options.aapt2 ?? process.env.AAPT2 ?? join(sdk, 'build-tools/36.0.0/aapt2');
    clean(root);
    report.source = sourceIdentity(source);
    report.candidate = bindCandidate(resolve(options.candidate), output, aapt2, report.source);
    report.harness = { revision: git('rev-parse', 'HEAD'), probeSha256: digest(probe), runnerSha256: digest(new URL(import.meta.url)) };
    report.stage = 'provision';
    for (const port of [adbPort, consolePort, String(Number(consolePort) + 1), grpcPort]) {
      requireThat(portOwners(port).length === 0, `Dedicated port ${port} is occupied`);
    }
    scratch = mkdtempSync(join(realpathSync(tmpdir()), 'recorder-staging-'));
    const home = join(scratch, 'android');
    const avdHome = join(scratch, 'avd');
    mkdirSync(home);
    mkdirSync(avdHome);
    const avd = `labs85-${scratch.split('/').at(-1)}`;
    const adb = join(sdk, 'platform-tools/adb');
    const emu = join(sdk, 'emulator/emulator');
    Object.assign(process.env, { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, ANDROID_USER_HOME: home, ANDROID_EMULATOR_HOME: home,
      ANDROID_AVD_HOME: avdHome, ADB_VENDOR_KEYS: join(home, 'adbkey'), ANDROID_ADB_SERVER_PORT: adbPort,
      ADB_SERVER_SOCKET: `tcp:localhost:${adbPort}`, ADB_MDNS_AUTO_CONNECT: '0', QEMU_AUDIO_IN_DRV: 'none', PATH: `${dirname(adb)}:${process.env.PATH}` });
    delete process.env.QEMU_AUDIO_DRV;
    delete process.env.ANDROID_SDK_HOME;
    await runAsync(adb, ['keygen', join(home, 'adbkey')], { signal });
    const avdLog = join(output, 'avd.log');
    await runAsync(join(sdk, 'cmdline-tools/latest/bin/avdmanager'), ['create', 'avd', '-n', avd, '-p', join(avdHome, `${avd}.avd`), '-d', 'pixel_8', '-k', image],
      { signal, timeout: 60_000, onResult: result => writeFileSync(avdLog, result.stdout + result.stderr) });
    adbServer = start(adb, ['-L', `tcp:localhost:${adbPort}`, '--one-device', serial, 'server', 'nodaemon'], join(output, 'adb.log'));
    const ownListener = () => { adbServer.check(); return portOwners(adbPort).join() === String(adbServer.pid); };
    await until(ownListener, 10_000, 'Isolated ADB listener');
    emulator = start(emu, ['-avd', avd, '-port', consolePort, '-grpc', grpcPort, '-grpc-use-token', '-audio', 'none', '-no-window',
      '-no-snapshot', '-no-boot-anim', '-camera-back', 'none', '-camera-front', 'none', '-gpu', 'swiftshader_indirect', '-no-metrics'], join(output, 'emulator.log'));
    const taskAdb = (...args) => {
      requireThat(ownListener(), 'Isolated ADB listener changed');
      emulator.check();
      return runAsync(adb, ['-H', '127.0.0.1', '-P', adbPort, '-s', serial, ...args], { signal, timeout: 5000 });
    };
    report.stage = 'boot';
    await until(async () => (await taskAdb('shell', 'getprop', 'sys.boot_completed').catch(error => {
      if (error.status !== 1) throw error;
      return '';
    })).trim() === '1', 120_000, 'Disposable Android boot');
    requireThat((await taskAdb('emu', 'avd', 'name')).split(/\r?\n/)[0] === avd &&
      (await taskAdb('shell', 'getprop', 'ro.kernel.qemu')).trim() === '1', 'ADB target is not the newly created emulator');
    await taskAdb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable');
    await taskAdb('shell', 'svc', 'wifi', 'disable');
    await taskAdb('shell', 'svc', 'data', 'disable');
    report.stage = 'journey';
    const directory = join(output, 'journey');
    const apk = join(output, 'staging.apk');
    const mode = existsSync(join(source, 'examples/ai-recorder/ui/recording-detail.tsx')) ? 'journey-detail' : 'journey';
    if (mode === 'journey-detail') await taskAdb('shell', 'settings', 'put', 'system', 'sound_effects_enabled', '0');
    await runAsync(process.execPath, [probe, mode, adbPort, serial, avd, String(emulator.pid), apk, directory], {
      signal, timeout: 240_000, onResult: result => writeFileSync(join(output, 'journey.log'), result.stdout + result.stderr),
    });
    const resultPath = join(directory, 'result.json');
    const journey = json(resultPath);
    evidence(directory, journey, report.candidate, avd, report.harness.revision, apk, mode);
    const installed = (await taskAdb('shell', 'pm', 'path', BUNDLE)).trim().match(/^package:(\/data\/app\/[A-Za-z0-9._~+=/-]+\/base\.apk)$/);
    requireThat(installed && !installed[1].split('/').some(part => part === '.' || part === '..'), 'Expected a single installed staging APK');
    const installedSha256 = (await taskAdb('shell', 'sha256sum', installed[1])).trim().split(/\s+/)[0];
    requireThat(installedSha256 === report.candidate.apkSha256, 'Installed emulator APK differs from the staging candidate');
    requireThat(JSON.stringify(sourceIdentity(source)) === JSON.stringify(report.source), 'Source checkout changed during staging verification');
    clean(root);
    requireThat(git('rev-parse', 'HEAD') === report.harness.revision, 'Harness checkout changed during staging verification');
    report.journey = { sha256: digest(resultPath), elapsedMs: journey.elapsed_ms, guest: journey.guest, emulator: journey.emulator, installedSha256 };
    report.stage = 'complete';
    report.status = 'PASS';
  } catch (error) {
    report.error = error.message;
    if (report.stage === 'journey') {
      try {
        const journey = json(join(output, 'journey/result.json'));
        report.journeyFailure = { stage: journey.stage, error: journey.error };
      } catch { /* A missing child receipt is a failed run. */ }
    }
  } finally {
    const stopped = await Promise.allSettled([emulator?.stop(), adbServer?.stop()]);
    if (stopped.some(result => result.status === 'rejected')) {
      report.status = 'FAIL';
      report.cleanupError = 'Task process cleanup could not be verified';
    } else if (scratch) {
      try { rmSync(scratch, { recursive: true }); }
      catch { report.status = 'FAIL'; report.cleanupError = 'Disposable emulator state could not be removed'; }
    }
    if (signal.aborted) {
      report.status = 'FAIL';
      report.error ??= signal.reason.message;
    }
    report.elapsedMs = Math.round(performance.now() - began);
    writeJSON(join(output, 'result.json'), report);
    console.log(JSON.stringify({ ...report, receipt: join(output, 'result.json') }));
    if (report.status !== 'PASS') process.exitCode = 1;
  }
}

await main().catch(error => { console.error(error.message); process.exitCode = 1; });
