#!/usr/bin/env node
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { artifact, sha, changedPaths, requireThat, writeJSON } from './core.mjs';
import { run, runAsync, validateIntegration, sourceIdentity, cli, loadCandidate, outDir, appPath } from './host.mjs';
import { androidObservation } from './android.mjs';
import { iosObservation } from './ios.mjs';
import { observeNativeMarkdown, requiresNativeMarkdown } from './native-markdown.mjs';
import { webObservation } from './web.mjs';

export async function platformGate({ platform, source, candidate, output, targets = {}, fault }) {
  const receipt = { platform, candidate, status: 'FAIL', stage: 'preflight', commands: [], fault: { requested: fault ?? null, applied: false } };
  const onFault = () => { receipt.fault.applied = true; };
  const app = join(source, appPath); let uuid;
  function command(cmd, args, options = {}) {
    const entry = { command: cmd, args: args.map(a => String(a).replaceAll(source, '<candidate>').replaceAll(output, '<evidence>')), stage: receipt.stage };
    receipt.commands.push(entry); const began = performance.now();
    const { outputFile, ...opts } = options;
    let result;
    let stderr = '';
    try { result = run(cmd, args, { cwd: app, timeout: 1800000, env: { CI: '1', EXPO_OFFLINE: '1', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1', COCOAPODS_DISABLE_STATS: '1' }, onResult: r => { stderr = r.stderr ?? ''; }, ...opts }); entry.exit_code = 0; }
    catch (error) { entry.exit_code = error.status ?? null; writeFileSync(join(output, `command-${receipt.commands.length}.log`), `${error.stdout ?? ''}\n${error.stderr ?? ''}`); throw error; }
    finally { entry.duration_ms = performance.now() - began; }
    if (outputFile) writeFileSync(outputFile, result);
    else writeFileSync(join(output, `command-${receipt.commands.length}.log`), `${result}\n${stderr}`);
    return result;
  }
  async function asyncCommand(cmd, args, options = {}) {
    const index = receipt.commands.length + 1;
    const entry = { command:cmd, args:args.map(a=>String(a).replaceAll(source,'<candidate>').replaceAll(output,'<evidence>')), stage:receipt.stage };
    receipt.commands.push(entry); const began=performance.now();let captured;
    try { return await runAsync(cmd,args,{cwd:app,...options,onResult:r=>{captured=r;}}); }
    finally {
      entry.exit_code=captured?.status??null;entry.signal=captured?.signal??null;entry.duration_ms=performance.now()-began;
      writeFileSync(join(output,`command-${index}.log`),`${captured?.stdout??''}\n${captured?.stderr??''}`);
    }
  }
  try {
    sourceIdentity(source, candidate);
    validateIntegration(candidate, source);
    receipt.inputs = Object.fromEntries(['app.json','package.json','package-lock.json'].map(name => [name, sha(readFileSync(join(app,name)))]));
    receipt.node = process.version;
    requireThat(!fault || ['terminate', 'missing-entry'].includes(fault), 'unsupported fault');
    requireThat(fault !== 'missing-entry' || platform === 'web', 'missing-entry fault is Web-only');
    if (platform === 'android') {
      requireThat(/^emulator-\d+$/.test(targets.android ?? ''), 'missing dedicated emulator');
      requireThat(process.env.JAVA_HOME && process.env.ANDROID_HOME, 'explicit JAVA_HOME and ANDROID_HOME required');
      command('java',['-version']); command('adb',['version']);
      const abi = command('adb', ['-s', targets.android, 'shell', 'getprop', 'ro.product.cpu.abi'], { timeout: 10000 }).trim();
      requireThat(['arm64-v8a', 'x86_64'].includes(abi), 'unsupported emulator ABI');
      receipt.stage = 'build'; command('./node_modules/.bin/expo', ['prebuild', '--platform', 'android', '--no-install']);
      command('./android/gradlew', ['-p', 'android', 'app:assembleRelease', '--offline', '--no-daemon', `-PreactNativeArchitectures=${abi}`, '-Porg.gradle.java.installations.auto-download=false', ...(process.env.LABS85_JAVA_TOOLCHAINS ? [`-Porg.gradle.java.installations.paths=${process.env.LABS85_JAVA_TOOLCHAINS}`] : [])]);
      const apk = join(app, 'android/app/build/outputs/apk/release/app-release.apk');
      requireThat(/assets\/index.android.bundle/.test(command('unzip', ['-l', apk])), 'embedded Android JS missing');
      receipt.artifact = artifact(apk);
      receipt.stage = 'launch-observe'; Object.assign(receipt, await androidObservation({ command, asyncCommand, output, serial: targets.android, apk, fault, onFault }));
    } else if (platform === 'ios') {
      requireThat(/^com\.apple\.CoreSimulator\.SimRuntime\.iOS-[\d-]+$/.test(targets.iosRuntime ?? ''), 'explicit installed iOS runtime required');
      const runtime = JSON.parse(command('xcrun', ['simctl', 'list', 'runtimes', '-j'], { timeout: 10000 })).runtimes.find(r => r.identifier === targets.iosRuntime && r.isAvailable);
      requireThat(runtime, 'requested iOS Simulator runtime unavailable');
      const ruby = process.env.LABS85_RUBY ?? 'ruby';
      command(ruby, ['-e', 'require "xcodeproj"; puts Xcodeproj::VERSION']);
      command('xcodebuild', ['-version']);
      const name = `labs85-${Date.now()}`;
      uuid = command('xcrun', ['simctl', 'create', name, 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro', targets.iosRuntime], { timeout: 10000 }).trim();
      requireThat(/^[A-Fa-f0-9-]{36}$/.test(uuid), 'fresh Simulator UUID missing');
      command('xcrun', ['simctl', 'boot', uuid], { timeout: 30000 }); command('xcrun', ['simctl', 'bootstatus', uuid, '-b'], { timeout: 180000 });
      receipt.stage = 'build'; command('./node_modules/.bin/expo', ['prebuild', '--platform', 'ios', '--no-install']);
      command('pod', ['install', '--no-repo-update'], { cwd: join(app, 'ios') });
      command(ruby, [join(source, 'scripts/recorder-gate/add-ios-test.rb'), join(app, 'ios/AIRecorder.xcodeproj'), join(source, 'scripts/recorder-gate/StartupGateTests.swift')]);
      const derived = join(output, 'derived');
      command('xcodebuild', ['build-for-testing', '-workspace', 'ios/AIRecorder.xcworkspace', '-scheme', 'AIRecorder', '-configuration', 'Release', '-sdk', 'iphonesimulator', '-destination', `id=${uuid}`, '-derivedDataPath', derived, 'CODE_SIGNING_ALLOWED=NO']);
      const built = join(derived, 'Build/Products/Release-iphonesimulator/AIRecorder.app');
      requireThat(existsSync(join(built, 'main.jsbundle')) && readFileSync(join(built, 'main.jsbundle')).length > 0, 'embedded iOS JS missing');
      receipt.artifact = artifact(built);
      receipt.stage = 'launch-observe'; Object.assign(receipt, await iosObservation({ command, output, uuid, app: built, workspace: app, derived, fault, onFault })); receipt.runtime = `${runtime.name} / ${runtime.version} / ${runtime.buildversion}`;
      const paths = changedPaths(run('git', ['diff', '--name-status', '-z', '--find-renames', candidate.base, candidate.head], { cwd: source }));
      if (!fault && requiresNativeMarkdown(source, paths)) {
        receipt.stage = 'native-markdown';
        receipt.nativeMarkdown = observeNativeMarkdown({ command, source, output, candidate, uuid, derived, appArtifact: receipt.artifact });
      }
    } else if (platform === 'web') {
      receipt.stage = 'build'; const directory = join(output, 'export');
      command(process.execPath, ['scripts/export-web.mjs', '--output-dir', directory]);
      receipt.artifact = artifact(directory);
      receipt.stage = 'launch-observe'; Object.assign(receipt, await webObservation({ source, directory, output, fault, onFault }));
    } else throw new Error('unknown platform');
    requireThat(!fault, 'controlled fault unexpectedly survived the observation');
    receipt.screenshots = (platform === 'web' ? ['desktop.png','narrow.png'] : ['screen.png']).map(name => {
      const bytes=readFileSync(join(output,name));
      requireThat(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'screenshot is not a PNG');
      return { path:name,bytes:bytes.length,sha256:sha(bytes) };
    });
    sourceIdentity(source, candidate); receipt.stage = 'complete'; receipt.status = 'PASS'; return receipt;
  } catch (error) { receipt.error = error.message; throw error; }
  finally {
    if (uuid) { try { command('xcrun', ['simctl', 'shutdown', uuid], { timeout: 30000 }); } catch (e) { receipt.cleanup_error = e.message; receipt.status = 'FAIL'; } }
    writeJSON(join(output, 'result.json'), receipt);
    requireThat(receipt.status === 'PASS', `${platform} ${receipt.stage}: ${receipt.error ?? receipt.cleanup_error ?? 'failed'}`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const o = cli(process.argv.slice(2), ['platform', 'source', 'candidate', 'output', 'android', 'ios-runtime', 'fault']);
  platformGate({ platform: o.platform, source: resolve(o.source), candidate: loadCandidate(o.candidate), output: outDir(o.output), targets: { android: o.android, iosRuntime: o['ios-runtime'] }, fault: o.fault }).catch(e => { console.error(e.message); process.exitCode = 1; });
}
