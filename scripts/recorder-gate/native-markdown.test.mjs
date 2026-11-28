import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requiresNativeMarkdown, validateNativeMarkdown } from './native-markdown.mjs';

const adapter = 'examples/ai-recorder/transcriptTransfer.ios.ts';
const candidate = { repo: 'innosage-llc/innosage-labs', pr: 145, head: 'a'.repeat(40), base: 'b'.repeat(40), tested: 'c'.repeat(40), tree: 'd'.repeat(40) };
const app = { sha256: 'e'.repeat(64) };
const checksum = { sha256: 'f'.repeat(64) };
const receipt = {
  status: 'PASS', candidate, outcome: 'ios-committed-markdown-save-to-files', appArtifactSha256: app.sha256,
  destination: 'On My iPhone', cancelledThenRetried: true, source: 'saved revision from Original view',
  saved: { bytes: 197, sha256: 'd63636b8240a6c0df5fe1ad77d8add54d046c58fc8c613f0d6ec8fa38a318691' },
  audio: checksum, original: checksum, revision: checksum, testResult: checksum,
};

test('requires an actual native Markdown run only for affected candidates with the iOS adapter', () => {
  const source = mkdtempSync(join(tmpdir(), 'labs-native-markdown-'));
  try {
    assert.equal(requiresNativeMarkdown(source, [adapter]), false);
    mkdirSync(join(source, 'examples/ai-recorder'), { recursive: true });
    writeFileSync(join(source, adapter), 'app');
    assert.equal(requiresNativeMarkdown(source, ['examples/ai-recorder/browserShare.web.ts']), false);
    assert.equal(requiresNativeMarkdown(source, [adapter]), true);
    assert.equal(requiresNativeMarkdown(source, ['examples/ai-recorder/Transcript.tsx']), true);
  } finally { rmSync(source, { recursive: true, force: true }); }
});

test('requires exact candidate, artifact, supported destination and full saved bytes', () => {
  assert.doesNotThrow(() => validateNativeMarkdown(receipt, candidate, app));
  assert.throws(() => validateNativeMarkdown(undefined, candidate, app), /missing/);
  assert.throws(() => validateNativeMarkdown(receipt, { ...candidate, tree: 'f'.repeat(40) }, app), /stale/);
  assert.throws(() => validateNativeMarkdown(receipt, candidate, checksum), /bundle mismatch/);
  assert.throws(() => validateNativeMarkdown({ ...receipt, cancelledThenRetried: false }, candidate, app), /action evidence/);
  assert.throws(() => validateNativeMarkdown({ ...receipt, saved: { ...receipt.saved, bytes: 196 } }, candidate, app), /bytes missing/);
});

test('standalone replay rejects observers outside the retained source before reading a manifest or starting a device', () => {
  const source = mkdtempSync(join(tmpdir(), 'recorder-replay-'));
  try {
    const observer = fileURLToPath(new URL('./platform.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [observer, '--platform', 'ios', '--source', source,
      '--candidate', join(source, 'unused.json'), '--output', join(source, 'out')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /run the platform observer from the retained integration checkout/);
  } finally { rmSync(source, { recursive: true, force: true }); }
});

test('canonical entry rejects a stale launcher before querying GitHub or running any observations', () => {
  const temp = mkdtempSync(join(tmpdir(), 'recorder-stale-launch-'));
  try {
    const manifest = join(temp, 'candidate.json');
    writeFileSync(manifest, JSON.stringify({ ...candidate, draft: true }));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run.mjs', import.meta.url)),
      '--candidate', manifest, '--output', join(temp, 'receipt')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /launch the local gate from the exact PR head/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
