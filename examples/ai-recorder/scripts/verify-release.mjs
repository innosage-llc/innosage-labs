import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { artifact, BUNDLE, commit, requireThat, sha, validateCandidate, validatePlatform } from '../../../scripts/recorder-gate/core.mjs';

const exitCodes = { PASS: 0, FAIL: 1, PENDING_MANUAL: 2 };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const pid = value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value);

export function readCandidate(path, run = runLocal) {
  const spec = json(path);
  const sourceRevision = commit(spec?.sourceRevision);
  requireThat(spec.schemaVersion === 1 && typeof spec.versionName === 'string' && spec.versionName.trim() &&
    Number.isSafeInteger(spec.versionCode) && spec.versionCode > 0, 'Invalid candidate schema or version');
  const localPath = (value, label) => {
    requireThat(typeof value === 'string' && value.trim(), `Missing ${label} path`);
    return resolve(dirname(path), value);
  };
  const apk = localPath(spec.apk, 'staging APK');
  requireThat(apk.endsWith('.apk'), 'Staging artifact must be an APK');
  const apkArtifact = artifact(apk);
  const apkFile = apkArtifact.files[0];
  requireThat(apkArtifact.files.length === 1 && apkFile.path === 'artifact' && hash(spec.apkSha256) &&
    apkFile.sha256 === spec.apkSha256, 'Staging APK SHA-256 mismatch');
  const receiptBytes = readFileSync(localPath(spec.androidReceipt, 'Android startup receipt'));
  requireThat(hash(spec.androidReceiptSha256) && sha(receiptBytes) === spec.androidReceiptSha256,
    'Android startup receipt SHA-256 mismatch');
  const startup = JSON.parse(receiptBytes);
  const buildCandidate = validateCandidate(startup?.candidate);
  requireThat(buildCandidate.tested === sourceRevision, 'Android startup receipt is for a different source revision');
  validatePlatform(startup, buildCandidate, 'android');
  requireThat(startup.artifact.sha256 === apkArtifact.sha256 && same(startup.artifact.files, [apkFile]),
    'Staging APK differs from the Android startup receipt artifact');

  const badging = run(process.env.AAPT2 || 'aapt2', ['dump', 'badging', apk]);
  const metadata = badging.match(/^package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'/m);
  requireThat(metadata && metadata[1] === BUNDLE && metadata[2] === String(spec.versionCode) &&
    metadata[3] === spec.versionName, 'Staging APK package or version differs from the candidate');

  let distribution = null;
  if (spec.distribution !== undefined) {
    const item = spec.distribution;
    requireThat(hash(item?.sha256) && typeof item.relationship === 'string' && item.relationship.trim(),
      'Distribution requires a SHA-256 and staging relationship');
    const { files } = artifact(localPath(item.artifact, 'distribution artifact'));
    requireThat(files.length === 1 && files[0].path === 'artifact' && files[0].sha256 === item.sha256,
      'Distribution artifact SHA-256 mismatch');
    distribution = { sha256: item.sha256, relationship: item.relationship.trim(),
      identity: item.sha256 === apkFile.sha256 ? 'SAME_APK_BYTES' : 'SEPARATE_UNVERIFIED' };
  }
  return { package: BUNDLE, versionName: spec.versionName, versionCode: spec.versionCode,
    sourceRevision, apkSha256: apkFile.sha256, androidReceiptSha256: spec.androidReceiptSha256, distribution };
}

function installed(serial, candidate, run) {
  requireThat(/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(serial) && !/^emulator-/i.test(serial),
    'Provide the explicit USB serial of the authorized physical Android phone');
  const adb = (...args) => run(process.env.ADB || 'adb', ['-s', serial, ...args]).trim();
  requireThat(adb('get-state') === 'device', 'Android device is unavailable');
  for (const property of ['ro.kernel.qemu', 'ro.boot.qemu']) {
    requireThat(/^(?:0)?$/.test(adb('shell', 'getprop', property)), 'Physical Android phone required');
  }
  requireThat(adb('shell', 'settings', 'get', 'global', 'airplane_mode_on') === '1' &&
    /^\s*Active default network:\s*none\s*$/m.test(adb('shell', 'dumpsys', 'connectivity')),
    'Enable airplane mode, turn Wi-Fi off and confirm there is no active default network');
  const installedPath = adb('shell', 'pm', 'path', BUNDLE);
  const path = installedPath.slice('package:'.length);
  requireThat(installedPath.startsWith('package:') && /^\/data\/app\/(?:[A-Za-z0-9._~+=-]+\/)+base\.apk$/.test(path) &&
    !path.split('/').some(part => part === '.' || part === '..'), 'A single installed staging APK is required');
  const [apkSha256] = adb('shell', 'sha256sum', path).split(/\s+/);
  requireThat(apkSha256 === candidate.apkSha256, 'Installed APK SHA-256 differs from the staging candidate');
  const processId = adb('shell', 'pidof', BUNDLE);
  requireThat(pid(processId), 'Open Recorder on the offline phone and leave it running');
  return { serialSha256: sha(serial), installationSha256: sha(path), apkSha256, processId, offline: true };
}

function matchingInstall(before, after) {
  return before.serialSha256 === after.serialSha256 && before.installationSha256 === after.installationSha256 &&
    before.apkSha256 === after.apkSha256 && before.offline === true && after.offline === true;
}

function runLocal(binary, args) {
  try {
    return execFileSync(binary, args, { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw new Error(`${binary.split('/').at(-1)} ${args[0]} failed (${error.code ?? error.status ?? error.signal ?? 'unknown'})`);
  }
}

export function humanListening(input = process.stdin, output = process.stdout) {
  if (!input.isTTY || !output.isTTY) return undefined;
  const terminal = createInterface({ input, output });
  return new Promise(resolveAnswer => {
    terminal.once('close', () => resolveAnswer(undefined));
    terminal.question(
      'Did you supervise saving both distinct clips, force-stop and cold-open Recorder offline, then hear only the second clip from Library?\n' +
      'Type HEARD SECOND CLIP or FAILED. Leave blank to defer: ',
      answer => {
        resolveAnswer(answer.trim() || undefined);
        terminal.close();
      }
    );
  });
}

export async function verifyRelease({ candidatePath, serial, confirm }, {
  run = runLocal, listen = humanListening,
} = {}) {
  const path = resolve(candidatePath);
  let manifestSha256;
  let candidate;
  let candidateId;
  let receiptPath;
  let lock;
  let lockPath;
  let preserveReceipt = false;
  let before = null;
  let after = null;
  let manual = null;
  let status = 'FAIL';
  let reason;

  try {
    manifestSha256 = sha(readFileSync(path));
    candidate = readCandidate(path, run);
    candidateId = sha(JSON.stringify(candidate));
    receiptPath = resolve(dirname(path), `release-${candidateId}.json`);
    lockPath = `${receiptPath}.lock`;
    lock = openSync(lockPath, 'wx', 0o600);
    let prior;
    try {
      const { integritySha256, ...body } = json(receiptPath);
      if (sha(JSON.stringify(body)) === integritySha256 && body.schemaVersion === 1 &&
        body.evidence === 'SUPERVISED_RELEASE_VERIFICATION' && body.candidateId === candidateId &&
        same(body.candidate, candidate)) prior = body;
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    preserveReceipt = prior?.status === 'PASS';
    requireThat(!preserveReceipt, 'A completed PASS receipt exists for this exact candidate; use a separate directory for a fresh run');
    if (confirm !== undefined) {
      requireThat(confirm === candidateId, 'Confirmation candidate ID mismatch');
      requireThat(serial, 'Confirmation requires the original physical device serial');
      requireThat(prior?.status === 'PENDING_MANUAL' && prior.before?.offline === true &&
        pid(prior.before.processId), 'Missing or invalid prepared receipt for this candidate and device');
      before = prior.before;
      const reopened = installed(serial, candidate, run);
      after = reopened;
      requireThat(matchingInstall(before, reopened), 'Verification device or installation changed');
      requireThat(reopened.processId !== before.processId, 'Recorder did not reopen in a new process');
      const response = await listen();
      if (response === undefined) {
        status = 'PENDING_MANUAL';
        reason = 'Supervised listening has not been confirmed';
      } else {
        requireThat(response === 'HEARD SECOND CLIP' || response === 'FAILED', 'Unrecognized human listening response');
        manual = { result: response === 'HEARD SECOND CLIP' ? 'HEARD_SECOND_CLIP' : 'FAILED',
          attestedAt: new Date().toISOString() };
        requireThat(same(candidate, readCandidate(path, run)), 'Candidate changed during confirmation');
        after = installed(serial, candidate, run);
        requireThat(same(reopened, after), 'Offline Recorder process or installation changed during confirmation');
        requireThat(response === 'HEARD SECOND CLIP', 'Operator reported the offline listening check failed');
        status = 'PASS';
        reason = 'Verified staging APK and supervised offline Library playback of the second clip';
      }
    } else {
      if (serial !== undefined) before = installed(serial, candidate, run);
      else if (prior?.status === 'PENDING_MANUAL') before = prior.before;
      status = 'PENDING_MANUAL';
      reason = serial !== undefined ? 'Device verified. Complete the offline listening steps, then confirm with the candidate ID.'
        : before ? 'A device checkpoint already exists. Confirm on the original device.'
          : 'A physical staging install and supervised listening are still required';
    }
  } catch (error) {
    reason = error.message;
  }

  const receipt = { schemaVersion: 1, evidence: 'SUPERVISED_RELEASE_VERIFICATION', checkedAt: new Date().toISOString(),
    status, reason, candidateId: candidateId ?? null, candidate: candidate ?? null, before, after, manual };
  try {
    if (!preserveReceipt && (lock !== undefined || (!candidateId && manifestSha256))) {
      receiptPath ??= resolve(dirname(path), `release-invalid-${manifestSha256}.json`);
      const temporary = `${receiptPath}.${process.pid}.tmp`;
      try {
        writeFileSync(temporary, JSON.stringify({ ...receipt, integritySha256: sha(JSON.stringify(receipt)) }, null, 2) + '\n',
          { flag: 'wx', mode: 0o600 });
        renameSync(temporary, receiptPath);
      } finally {
        rmSync(temporary, { force: true });
      }
    } else {
      receiptPath = undefined;
    }
    return { ...receipt, receiptPath, exitCode: exitCodes[status] };
  } finally {
    if (lock !== undefined) {
      closeSync(lock);
      rmSync(lockPath);
    }
  }
}

function parseArgs(args) {
  const options = {};
  const keys = new Map([['--candidate', 'candidatePath'], ['--serial', 'serial'], ['--confirm', 'confirm']]);
  for (let index = 0; index < args.length; index += 2) {
    const key = keys.get(args[index]);
    const value = args[index + 1];
    requireThat(key && options[key] === undefined && value && !value.startsWith('--'),
      'Usage: verify-release --candidate <manifest.json> [--serial <USB-serial>] [--confirm <candidate-id>]');
    options[key] = value;
  }
  requireThat(options.candidatePath, '--candidate is required');
  return options;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const result = await verifyRelease(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(JSON.stringify({ status: 'FAIL', reason: error.message }));
    process.exitCode = exitCodes.FAIL;
  }
}
