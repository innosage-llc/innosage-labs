import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { supportsProUpload, uploadRecording } from './NativeUpload.ts';

const root = dirname(fileURLToPath(import.meta.url));
function graph(platform) {
  const seen = new Map();
  function visit(file) {
    if (seen.has(file)) return;
    const source = readFileSync(file, 'utf8');
    seen.set(file, source);
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false);
    for (const node of parsed.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      if ((ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) ||
          (ts.isExportDeclaration(node) && node.isTypeOnly)) continue;
      const specifier = node.moduleSpecifier.text;
      if (!specifier.startsWith('.')) continue;
      const base = resolve(dirname(file), specifier);
      if (specifier.endsWith('.json')) {
        JSON.parse(readFileSync(base, 'utf8'));
        continue;
      }
      const target = [`.${platform}.tsx`, `.${platform}.ts`, '.native.tsx', '.native.ts', '.tsx', '.ts']
        .map(ext => base + ext).find(existsSync);
      assert.ok(target, `Unresolved local import ${specifier} in ${file}`);
      visit(target);
    }
  }
  visit(resolve(root, 'index.ts'));
  return seen;
}

test('iOS entry graph selects native SwiftUI adapters and never imports Compose or Android uploader', () => {
  const files = graph('ios');
  for (const [file, source] of files) {
    assert.doesNotMatch(source, /from ['"]@expo\/ui\/jetpack-compose/);
    assert.doesNotMatch(source, /requireNativeModule/);
    assert.ok(!file.endsWith('.android.ts') && !file.endsWith('.android.tsx'));
  }
  for (const name of ['ProSettings.tsx', 'PlaybackSeek.ios.tsx', 'RecorderSwitch.ios.tsx', 'ServiceChoice.ios.tsx',
    'ui/ActionButton.ios.tsx', 'ui/AppChrome.ios.tsx', 'ui/RecordControl.ios.tsx', 'ui/RootShell.ios.tsx']) {
    assert.ok(files.has(resolve(root, name)), name);
  }
});

test('iOS seek uses a 0-to-duration range rather than SwiftUI default 0-to-1', () => {
  const files = graph('ios');
  const seek = files.get(resolve(root, 'PlaybackSeek.ios.tsx'));
  assert.match(seek, /<Slider \{\.\.\.props\} min=\{0\}/);
  assert.match(seek, /enabled, label, onValueChangeFinished, \.\.\.props/);
  assert.match(files.get(resolve(root, 'App.tsx')), /<RecordingDetail\b[\s\S]*?seek=\{detailOwnsPlayer[^\n]*\{\s*max: playback\.duration/);
  assert.match(files.get(resolve(root, 'ui/recording-detail.ios.tsx')), /<PlaybackSeek\s+\{\.\.\.activeSeek\}/);
});

test('Android retains its Compose controls and bounded native uploader', () => {
  const files = graph('android');
  for (const name of ['ProSettings.tsx', 'PlaybackSeek.tsx', 'RecorderSwitch.tsx', 'NativeUpload.android.ts', 'ui/RecordControl.android.tsx',
    'ui/recording-detail.android.tsx']) {
    assert.ok(files.has(resolve(root, name)), name);
  }
  assert.match(files.get(resolve(root, 'NativeUpload.android.ts')), /supportsProUpload = true/);
  for (const file of files.keys()) assert.ok(!/\.ios\.tsx?$/.test(file), file);
});

test('Web uses the shared app/navigation with isolated browser adapters and no native UI imports', () => {
  const files = graph('web');
  for (const [file, source] of files) {
    assert.doesNotMatch(source, /from ['"]@expo\/ui\/(?:jetpack-compose|swift-ui)/);
    assert.doesNotMatch(source, /requireNativeModule/);
    assert.ok(!/\.(?:android|ios)\.tsx?$/.test(file), file);
  }
  for (const name of ['App.tsx', 'captureOwner.web.ts', 'ui/RootShell.tsx', 'ui/AppChrome.web.tsx', 'ui/RecordControl.web.tsx',
    'ui/recording-detail.tsx', 'ProSettings.web.tsx', 'Transcript.web.tsx']) assert.ok(files.has(resolve(root, name)), name);
  const app = files.get(resolve(root, 'App.tsx'));
  assert.match(app, /Platform\.OS === 'web' \? undefined : new Directory/);
  assert.match(files.get(resolve(root, 'captureOwner.web.ts')), /new AudioRecorderWeb/);
  assert.doesNotMatch(files.get(resolve(root, 'captureOwner.web.ts')), /getUserMedia|requestRecordingPermissionsAsync/);
});

test('only the native entry graphs can load the local audio sharing service', () => {
  for (const platform of ['android', 'ios']) {
    const native = graph(platform).get(resolve(root, 'recordingShare.ts'));
    assert.match(native, /from ['"]expo-sharing/);
  }
  const web = graph('web');
  assert.ok(web.has(resolve(root, 'recordingShare.web.ts')));
  assert.ok(!web.has(resolve(root, 'recordingShare.ts')));
  for (const source of web.values()) assert.doesNotMatch(source, /from ['"]expo-sharing/);
});

test('unsupported uploader fails explicitly without loading a native module or performing a request', async () => {
  assert.equal(supportsProUpload, false);
  await assert.rejects(uploadRecording('https://example.invalid', new Blob(['test']), {}), /InnoSage Pro uploads require Android/);
});

test('Pro upload cannot reserve an operation on unsupported platforms', () => {
  const transcript = readFileSync(resolve(root, 'Transcript.tsx'), 'utf8');
  const submit = transcript.slice(transcript.indexOf('async function submit()'));
  assert.match(submit, /if \(\(!supportsProUpload && \(usePro \|\| service === 'production'\)\)/);
  const request = transcript.slice(transcript.indexOf('async function request('), transcript.indexOf('async function submit()'));
  assert.match(request, /if \(upload && !supportsProUpload\) throw new Error/);
  assert.match(transcript, /supportsPro=\{supportsProUpload\}/);
});

test('iOS offers only usable defaults and routes a remembered Production choice to a supported service', () => {
  const choices = graph('ios').get(resolve(root, 'ServiceChoice.ios.tsx'));
  const transcript = readFileSync(resolve(root, 'Transcript.tsx'), 'utf8');
  const settings = readFileSync(resolve(root, 'ProSettings.tsx'), 'utf8');
  assert.match(choices, /const supported: ServiceId\[\] = \['staging', 'openai'\]/);
  assert.match(choices, /service === 'production' [^\n]+unavailable on iOS/);
  assert.match(choices, /if \(id !== 'production'\) onChange/);
  assert.match(transcript, /isProduction=\{service === 'production'\}/);
  assert.match(settings, /const canConfigureKey = isOpenAI \|\| supportsProUpload/);
});

test('the iOS Settings entry distinguishes unknown key status and can retry the stored preference', () => {
  const files = graph('ios');
  const settings = files.get(resolve(root, 'ProSettings.tsx'));
  const layout = files.get(resolve(root, 'ui/service-flow.ios.tsx'));
  assert.match(settings, /<ServiceSettingsLayout service=\{knownService\}/);
  assert.match(layout, /showKeyScreen \? keys/);
  assert.match(settings, /configured === undefined \? busy [^\n]*Saved key status is unavailable/);
  assert.match(settings, /Retry reading settings[\s\S]*?setReadAttempt\(attempt => attempt \+ 1\)/);
});

test('Settings reports a failed preference read and Staging Free discloses original retention before upload', () => {
  const files = graph('ios');
  const entry = files.get(resolve(root, 'App.tsx'));
  const settings = files.get(resolve(root, 'ui/service-flow.ios.tsx'));
  const setup = files.get(resolve(root, 'ui/InnoSageTranscriptAction.tsx'));
  assert.match(entry, /useState\("Reading saved service…"\)/);
  assert.match(entry, /catch\(\(\) => \{ if \(current\) setServiceLabel\('Saved service unavailable'\)/);
  assert.match(settings, /onChange\('staging'\)/);
  assert.match(setup, /!isProduction && !usePro[^\n]*Staging Gateway keeps the original transcript/);
  assert.ok(setup.indexOf('Staging Gateway keeps') < setup.indexOf('onPress={onTranscribe}'));
});

test('iOS Free transcription preflights local duration before recovering or provisioning upload access', () => {
  const files = graph('ios');
  const transcript = files.get(resolve(root, 'Transcript.tsx'));
  assert.match(transcript, /import \{ recordingDurationMillis \} from '\.\/libraryDuration';/);
  assert.match(files.get(resolve(root, 'libraryDuration.ios.ts')), /file\.open\(FileMode\.ReadOnly\)/);
  assert.match(transcript, /freeRecordingLimit\(recording.size, await recordingDurationMillis\(recording\)[^\n]*\n\s*if \(limit\) throw new KnownServiceFailure\(limit\);[\s\S]*?await connectGateway\(service\)/);
});

test('iOS config declares its identity and microphone purpose without broad file sharing', () => {
  const { expo } = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8'));
  assert.deepEqual(expo.platforms, ['android', 'ios', 'web']);
  assert.equal(expo.ios.bundleIdentifier, expo.android.package);
  assert.ok(expo.ios.infoPlist.NSMicrophoneUsageDescription);
  assert.equal(expo.ios.infoPlist.UIFileSharingEnabled, undefined);
  assert.equal(expo.ios.infoPlist.NSAppTransportSecurity, undefined);
});

test('TestFlight profile is a store Release build without automatic submission or credentials', () => {
  const eas = JSON.parse(readFileSync(resolve(root, 'eas.json'), 'utf8'));
  assert.equal(eas.build.testflight.distribution, 'store');
  assert.equal(eas.build.testflight.developmentClient, false);
  assert.equal(eas.build.testflight.ios.simulator, false);
  assert.equal(eas.build.testflight.ios.buildConfiguration, 'Release');
  assert.deepEqual(eas.submit.testflight.ios, {});
  assert.doesNotMatch(JSON.stringify(eas), /autoSubmit|ascApiKey|appleId|password|token/i);
});

test('iOS distribution icon is 1024px opaque RGB, not the transparent template fallback', () => {
  const png = readFileSync(resolve(root, 'assets/ios-icon.png'));
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[25], 2); // PNG RGB, no alpha channel.
  const { expo } = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8'));
  assert.equal(expo.ios.icon, './assets/ios-icon.png');
});

test('native entries reach the shared provider, capture and document contracts', () => {
  for (const platform of ['android', 'ios']) {
    const files = graph(platform);
    for (const file of ['captureSession.ts', 'ServiceConfig.ts', 'GatewayGuest.ts', 'freeTargets.ts',
      'transcriptCompletion.ts', 'operationRecovery.ts', 'transcriptExport.ts']) {
      assert.ok(files.has(resolve(root, file)), platform + ' disconnected from ' + file);
    }
    const rollout = platform === 'android' ? 'productionFreeEligible.android.ts' : 'productionFreeEligible.ts';
    assert.ok(files.has(resolve(root, rollout)), platform + ' missing its protected rollout adapter');
  }
});
