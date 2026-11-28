import { existsSync, readFileSync, readdirSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { artifact, BUNDLE, requireThat, sameCandidate, sha } from './core.mjs';

const adapter = 'examples/ai-recorder/transcriptTransfer.ios.ts';
const checkedPaths = new Set([adapter, 'examples/ai-recorder/transcriptExport.ts', 'examples/ai-recorder/Transcript.tsx',
  'examples/ai-recorder/useTranscriptShareCleanup.ios.ts', 'scripts/recorder-gate/native-markdown.mjs',
  'scripts/recorder-gate/MarkdownGateTests.swift']);
const outcome = 'ios-committed-markdown-save-to-files';
const fixtureName = 'Import-1795750000000-markdown-fixture.m4a';
const label = 'Maple anchors.m4a';
const original = '[00:00 – 00:06] Original marker only.\n\nOriginal end of source.';
const revision = '[00:00 – 00:06] Saved revision café · 校訂.\n\nSecond paragraph, end proof 139.';
const filename = `Transcript - ${label}.md`;
const golden = Buffer.from(`# Transcript - ${label}\n\nImported: 2026-11-27T03:26:40.000Z\n\nTranscript source: Edited (saved revision)\n\n${revision}`, 'utf8');
const digest = /^[a-f0-9]{64}$/;

export function requiresNativeMarkdown(source, paths) {
  return existsSync(join(source, adapter)) && paths.some(path => checkedPaths.has(path));
}

export function validateNativeMarkdown(receipt, candidate, appArtifact) {
  requireThat(receipt?.status === 'PASS' && receipt.outcome === outcome && receipt.candidate && sameCandidate(receipt.candidate, candidate), 'iOS Markdown outcome missing, failed or stale');
  requireThat(receipt.appArtifactSha256 === appArtifact?.sha256 && digest.test(receipt.appArtifactSha256 ?? ''), 'iOS Markdown bundle mismatch');
  requireThat(receipt.destination === 'On My iPhone' && receipt.cancelledThenRetried === true && receipt.source === 'saved revision from Original view', 'iOS Markdown action evidence missing');
  requireThat(receipt.saved?.bytes === golden.length && receipt.saved.sha256 === sha(golden) &&
    ['audio', 'original', 'revision', 'testResult'].every(key => digest.test(receipt[key]?.sha256 ?? '')), 'iOS Markdown destination or retention bytes missing');
}

export function observeNativeMarkdown({ command, source, output, candidate, uuid, derived, appArtifact }) {
  const sim = (...args) => command('xcrun', ['simctl', ...args], { timeout: 10000 }).trim();
  const fixture = join(source, 'examples/ai-recorder/scripts/fixtures/recorder-test-tone.m4a');
  const audio = readFileSync(fixture);
  const readContainer = () => sim('get_app_container', uuid, BUNDLE, 'data');
  const recordings = join(readContainer(), 'Documents/recordings');
  mkdirSync(recordings, { recursive: true });
  copyFileSync(fixture, join(recordings, fixtureName));
  for (const [suffix, content] of [['.name', label], ['.original.txt', original], ['.revision.txt', revision]]) {
    writeFileSync(join(recordings, fixtureName + suffix), content, 'utf8');
  }
  const products = join(derived, 'Build/Products');
  const run = readdirSync(products).find(name => /^AIRecorder_.*\.xctestrun$/.test(name));
  requireThat(run, 'iOS Markdown test configuration missing');
  const result = join(output, 'ios-markdown.xcresult');
  command('xcodebuild', ['test-without-building', '-xctestrun', join(products, run), '-destination', `id=${uuid}`,
    '-parallel-testing-enabled', 'NO', '-only-testing:StartupGateUITests/MarkdownGateTests/testCancelAndSaveCommittedRevision', '-resultBundlePath', result], { timeout: 210000 });
  const resultSummary = JSON.parse(command('xcrun', ['xcresulttool', 'get', 'test-results', 'summary', '--path', result]));
  requireThat(resultSummary.passedTests === 1 && resultSummary.failedTests === 0 && resultSummary.skippedTests === 0, 'iOS Markdown XCTest did not pass');

  const simulators = JSON.parse(sim('list', 'devices', '-j')).devices;
  const device = Object.values(simulators).flat().find(entry => entry.udid === uuid);
  requireThat(device?.dataPath && device.name.startsWith('labs85-'), 'iOS Markdown requires the fresh task Simulator');
  const groups = join(device.dataPath, 'Containers/Shared/AppGroup');
  const matches = [];
  for (const group of readdirSync(groups)) {
    const directory = join(groups, group);
    const file = join(directory, 'File Provider Storage', filename);
    if (!existsSync(file)) continue;
    const identity = command('/usr/libexec/PlistBuddy', ['-c', 'Print :MCMMetadataIdentifier', join(directory, '.com.apple.mobile_container_manager.metadata.plist')]).trim();
    if (identity === 'group.com.apple.FileProvider.LocalStorage') matches.push(file);
  }
  requireThat(matches.length === 1, 'iOS Markdown file missing from the local system Files provider');
  const saved = readFileSync(matches[0]);
  requireThat(saved.equals(golden), 'iOS Markdown Files destination differs from the committed UTF-8 revision');
  const retained = join(readContainer(), 'Documents/recordings', fixtureName);
  requireThat(readFileSync(retained).equals(audio) && readFileSync(retained + '.original.txt', 'utf8') === original &&
    readFileSync(retained + '.revision.txt', 'utf8') === revision, 'iOS Markdown action changed recording or transcript source');
  const savedPath = join(output, 'saved-markdown.md');
  writeFileSync(savedPath, saved);
  const receipt = { status: 'PASS', outcome, candidate, appArtifactSha256: appArtifact.sha256, destination: 'On My iPhone',
    cancelledThenRetried: true, source: 'saved revision from Original view', saved: { bytes: saved.length, sha256: sha(saved) },
    audio: { sha256: sha(audio) }, original: { sha256: sha(original) }, revision: { sha256: sha(revision) }, testResult: { sha256: artifact(result).sha256 } };
  validateNativeMarkdown(receipt, candidate, appArtifact);
  return receipt;
}
