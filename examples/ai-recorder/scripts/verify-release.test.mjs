import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { artifact, BUNDLE, REPO, sha } from '../../../scripts/recorder-gate/core.mjs';
import { verifyRelease } from './verify-release.mjs';

const sourceRevision = 'a'.repeat(40);
const serial = 'FIXTURE-FONE';
const stagePath = '/data/app/~~fixture/co.innosage.labs.airecorder-fixture/base.apk';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'recorder-release-fixture-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const apk = join(dir, 'stage.apk');
  const candidatePath = join(dir, 'candidate.json');
  const startupPath = join(dir, 'android.json');
  const writeJSON = (path, data) => writeFileSync(path, JSON.stringify(data));
  writeFileSync(apk, 'Synthetic unit fixture. This is not an APK.');
  const artifactManifest = artifact(apk);
  const apkSha256 = artifactManifest.files[0].sha256;
  const sample = { identity: 'fixture', ready: true, alive: true, foreground: true };
  const startup = { candidate: { repo: REPO, tested: sourceRevision, head: 'b'.repeat(40),
    base: 'c'.repeat(40), tree: 'd'.repeat(40) }, platform: 'android', status: 'PASS',
    artifact: artifactManifest, monitor_started_before_launch: true, screenshots: [{ bytes: 9, sha256: sha('fixture') }],
    target: {}, runtime: {}, commands: [{}],
    observation: { ...sample, stable_ms: 5000, readiness_ms: 0, responsive: true, samples: [sample, sample], final: sample } };
  writeJSON(startupPath, startup);
  const spec = { schemaVersion: 1, sourceRevision, versionCode: 10, versionName: '0.1.9',
    apk: 'stage.apk', apkSha256, androidReceipt: 'android.json', androidReceiptSha256: sha(readFileSync(startupPath)) };
  writeJSON(candidatePath, spec);
  const state = { pid: '321', apkSha256, offline: true, qemu: '', path: `package:${stagePath}`, versionCode: 10 };
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === 'dump') {
      assert.deepEqual(args, ['dump', 'badging', apk]);
      return `package: name='${BUNDLE}' versionCode='${state.versionCode}' versionName='0.1.9'`;
    }
    assert.equal(args[0], '-s');
    assert.ok(args[1].startsWith('FIXTURE-'));
    if (args[2] === 'get-state') return 'device';
    assert.equal(args[2], 'shell');
    switch (args[3]) {
      case 'getprop': return state.qemu;
      case 'settings': return '1';
      case 'dumpsys': return `Active default network: ${state.offline ? 'none' : '102'}\n`;
      case 'pm': return state.path;
      case 'sha256sum': return `${state.apkSha256}  ${args[4]}`;
      case 'pidof': return state.pid;
      default: assert.fail(`Unexpected command ${args[3]}`);
    }
  };
  return { dir, candidatePath, apk, startupPath, startup, spec, state, calls,
    writeSpec: () => writeJSON(candidatePath, spec),
    writeStartup() {
      writeJSON(startupPath, startup);
      spec.androidReceiptSha256 = sha(readFileSync(startupPath));
      this.writeSpec();
    },
    call: (options = {}, listen = async () => undefined) => verifyRelease({ candidatePath, ...options }, { run, listen }) };
}

test('example has no ADB use and cannot be confirmed without the device checkpoint', async t => {
  const f = fixture(t);
  const pending = await f.call();
  assert.equal(pending.status, 'PENDING_MANUAL');
  assert.equal(pending.exitCode, 2);
  assert.equal(pending.before, null);
  assert.equal(f.calls.length, 1);
  assert.equal((await f.call({ serial, confirm: pending.candidateId })).exitCode, 1);
  assert.equal(f.calls.length, 2);
});

test('fixture only: same staging installation and a different PID require live input', async t => {
  const f = fixture(t);
  const ready = await f.call({ serial });
  assert.equal(ready.status, 'PENDING_MANUAL');
  f.state.pid = '765';
  const confirmation = { serial, confirm: ready.candidateId };
  assert.equal((await f.call(confirmation)).exitCode, 2);
  const accepted = await f.call(confirmation, async () => 'HEARD SECOND CLIP');
  const receipt = JSON.parse(readFileSync(accepted.receiptPath, 'utf8'));
  assert.equal(accepted.exitCode, 0);
  assert.equal(receipt.status, 'PASS');
  assert.equal(receipt.candidateId, ready.candidateId);
  assert.equal(receipt.before.processId, '321');
  assert.equal(receipt.after.processId, '765');
  assert.equal(receipt.manual.result, 'HEARD_SECOND_CLIP');
  const { integritySha256, ...body } = receipt;
  assert.equal(integritySha256, sha(JSON.stringify(body)));
  assert.equal((await f.call(confirmation)).exitCode, 1);
  assert.equal(JSON.parse(readFileSync(accepted.receiptPath)).status, 'PASS');
});

test('manual failure is nonzero and retained', async t => {
  const f = fixture(t);
  const pre = await f.call({ serial });
  f.state.pid = '765';
  const result = await f.call({ serial, confirm: pre.candidateId }, async () => 'FAILED');
  assert.equal(result.exitCode, 1);
  assert.equal(JSON.parse(readFileSync(result.receiptPath)).manual.result, 'FAILED');
});

test('missing/tampered APK, missing/tampered receipt and stale metadata fail closed', async t => {
  const f = fixture(t);
  const apk = readFileSync(f.apk);
  const originalReceipt = readFileSync(f.startupPath);
  rmSync(f.apk);
  assert.equal((await f.call()).exitCode, 1);
  writeFileSync(f.apk, 'tampered');
  assert.match((await f.call()).reason, /APK SHA-256 mismatch/);
  writeFileSync(f.apk, apk);
  rmSync(f.startupPath);
  assert.equal((await f.call()).exitCode, 1);
  writeFileSync(f.startupPath, 'tampered');
  assert.match((await f.call()).reason, /receipt SHA-256 mismatch/);
  writeFileSync(f.startupPath, originalReceipt);
  f.spec.sourceRevision = 'f'.repeat(40);
  f.writeSpec();
  assert.match((await f.call()).reason, /different source revision/);
  f.spec.sourceRevision = sourceRevision;
  f.startup.artifact.files[0].sha256 = 'f'.repeat(64);
  f.writeStartup();
  assert.match((await f.call()).reason, /startup receipt artifact/);
  f.startup.artifact = artifact(f.apk);
  f.writeStartup();
  f.state.versionCode = 11;
  assert.match((await f.call()).reason, /package or version/);
});

test('stale candidate ID, modified checkpoint, same PID, wrong install or device, and online phone fail', async t => {
  const f = fixture(t);
  const prepared = await f.call({ serial });
  const exact = { serial, confirm: prepared.candidateId };
  const mustFail = async (pattern, options = exact) => {
    const result = await f.call(options, async () => assert.fail('Never prompt on a failed verification'));
    assert.equal(result.exitCode, 1);
    assert.match(result.reason, pattern);
  };
  await mustFail(/candidate ID mismatch/, { ...exact, confirm: 'f'.repeat(64) });
  await f.call({ serial });
  const prior = JSON.parse(readFileSync(prepared.receiptPath));
  writeFileSync(prepared.receiptPath, JSON.stringify({ ...prior, status: 'PASS' }));
  await mustFail(/invalid prepared receipt/);
  await f.call({ serial });
  await mustFail(/new process/);
  await f.call({ serial });
  f.state.pid = '765';
  await mustFail(/device or installation changed/, { ...exact, serial: 'FIXTURE-OTHER' });
  await f.call({ serial });
  f.state.pid = '889';
  f.state.apkSha256 = sha('different installed APK');
  await mustFail(/Installed APK SHA-256/);
  f.state.apkSha256 = f.spec.apkSha256;
  f.state.offline = false;
  await mustFail(/no active default network/, { serial });
  f.state.offline = true;
  f.state.path += '\npackage:/data/app/fixture/split.apk';
  await mustFail(/single installed staging APK/, { serial });
  f.state.qemu = '1';
  await mustFail(/physical Android/i, { serial });
});

test('changing the candidate while the operator answers cannot pass', async t => {
  const f = fixture(t);
  const prepared = await f.call({ serial });
  f.state.pid = '765';
  const confirmation = { serial, confirm: prepared.candidateId };
  const changed = await f.call(confirmation, async () => {
    writeFileSync(f.apk, 'changed');
    return 'HEARD SECOND CLIP';
  });
  assert.equal(changed.exitCode, 1);
  assert.match(changed.reason, /APK SHA-256 mismatch/);
});

test('a differently built distribution artifact is recorded and remains unverified', async t => {
  const f = fixture(t);
  const path = join(f.dir, 'play.aab');
  writeFileSync(path, 'Synthetic Play fixture. This is not an AAB.');
  f.spec.distribution = { artifact: 'play.aab', sha256: sha(readFileSync(path)),
    relationship: 'Separate packaging of the same source' };
  f.writeSpec();
  const pre = await f.call({ serial });
  f.state.pid = '765';
  const result = await f.call({ serial, confirm: pre.candidateId }, async () => 'HEARD SECOND CLIP');
  assert.equal(result.status, 'PASS');
  assert.equal(result.candidate.distribution.identity, 'SEPARATE_UNVERIFIED');
  writeFileSync(path, 'changed distribution fixture');
  assert.match((await f.call()).reason, /Distribution artifact SHA-256 mismatch/);
});
