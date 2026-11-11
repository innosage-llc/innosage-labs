import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import { supportsProUpload, uploadRecording } from './NativeUpload.ts';

const root = dirname(new URL(import.meta.url).pathname);
function graph(platform) {
  const seen = new Map();
  function visit(file) {
    if (seen.has(file)) return;
    const source = readFileSync(file, 'utf8');
    seen.set(file, source);
    for (const { fileName: specifier } of ts.preProcessFile(source).importedFiles) {
      if (!specifier.startsWith('.')) continue;
      const base = resolve(dirname(file), specifier);
      const target = [`.${platform}.tsx`, `.${platform}.ts`, '.native.tsx', '.native.ts', '.tsx', '.ts']
        .map(ext => base + ext).find(existsSync);
      assert.ok(target, `Unresolved local import ${specifier} in ${file}`);
      visit(target);
    }
  }
  visit(resolve(root, 'index.ts'));
  return seen;
}

test('iOS entry graph never imports Jetpack Compose, Expo UI state, or Android native uploader', () => {
  const files = graph('ios');
  for (const [file, source] of files) {
    assert.doesNotMatch(source, /from ['"]@expo\/ui/);
    assert.doesNotMatch(source, /requireNativeModule/);
    assert.ok(!file.endsWith('.android.ts') && !file.endsWith('.android.tsx'));
  }
  assert.ok(files.has(resolve(root, 'ProSettings.tsx')));
});

test('Android retains its Compose controls and bounded native uploader', () => {
  const files = graph('android');
  for (const name of ['ProSettings.android.tsx', 'PlaybackSeek.android.tsx', 'RecorderSwitch.android.tsx', 'NativeUpload.android.ts']) {
    assert.ok(files.has(resolve(root, name)), name);
  }
  assert.match(files.get(resolve(root, 'NativeUpload.android.ts')), /supportsProUpload = true/);
});

test('unsupported uploader fails explicitly without loading a native module or performing a request', async () => {
  assert.equal(supportsProUpload, false);
  await assert.rejects(uploadRecording('https://example.invalid', new Blob(['test']), {}), /InnoSage Pro uploads require Android/);
});

test('Pro upload cannot reserve an operation on unsupported platforms', () => {
  const transcript = readFileSync(resolve(root, 'Transcript.tsx'), 'utf8');
  const submit = transcript.slice(transcript.indexOf('async function submit()'));
  assert.match(submit, /if \(\(!supportsProUpload && usePro\)/);
  assert.match(transcript, /disabled=\{busy \|\| \(!supportsProUpload && usePro\)\}/);
});

test('iOS config declares its identity and microphone purpose without broad file sharing', () => {
  const { expo } = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8'));
  assert.deepEqual(expo.platforms, ['android', 'ios']);
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
