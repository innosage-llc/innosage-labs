import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const REPO = 'innosage-llc/innosage-labs';
export const PLATFORMS = ['android', 'ios', 'web'];
export const BUNDLE = 'co.innosage.labs.airecorder';
export const sha = value => createHash('sha256').update(value).digest('hex');
export function requireThat(value, reason) { if (!value) throw new Error(reason); }
export function commit(value) { requireThat(/^[a-f0-9]{40}$/.test(value ?? ''), 'invalid commit'); return value; }
export function sameCandidate(a, b) {
  return ['repo', 'pr', 'head', 'base', 'tested', 'tree'].every(key => a[key] === b[key]);
}
export function validateCandidate(c) {
  requireThat(c?.repo === REPO && Number.isSafeInteger(c.pr) && c.pr > 0, 'explicit Labs repository and PR required');
  for (const key of ['head', 'base', 'tested', 'tree']) commit(c[key]);
  return c;
}
export function artifact(path) {
  const files = [];
  function visit(p) {
    const stat = lstatSync(p);
    requireThat(!stat.isSymbolicLink(), 'artifact symlinks are not accepted');
    if (stat.isDirectory()) for (const name of readdirSync(p).sort()) visit(join(p, name));
    else { requireThat(stat.isFile(), 'artifact is not a regular file'); files.push({ path: relative(path, p) || 'artifact', bytes: stat.size, sha256: sha(readFileSync(p)) }); }
  }
  visit(path); requireThat(files.length && files.some(f => f.bytes > 0), 'empty artifact');
  return { sha256: sha(JSON.stringify(files)), files };
}
export function writeJSON(path, value) { writeFileSync(path, JSON.stringify(value, null, 2) + '\n'); }
async function bounded(action, ms, label) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timeout`)),Math.max(1,ms));})]); }
  finally { clearTimeout(timer); }
}

// Parse every name in git diff --name-status -z, including both sides of renames.
export function changedPaths(raw) {
  const fields = raw.toString().split('\0'); if (fields.at(-1) === '') fields.pop();
  const paths = [];
  while (fields.length) {
    const status = fields.shift();
    requireThat(/^[ACDMRTUXB][0-9]*$/.test(status), 'unknown diff status');
    const count = /^[RC]/.test(status) ? 2 : 1;
    requireThat(fields.length >= count, 'truncated diff');
    paths.push(...fields.splice(0, count));
  }
  return [...new Set(paths)];
}
const unrelatedRoots = ['ai-cmo-workbench', 'is-clean-my-mac', 'studio-workspace', 'tibo-reset-post-generator'];
export function recorderImpact(paths) {
  if (!paths.length) return { affected: true, reason: 'empty/unknown change set' };
  const unrelated = paths.every(p => unrelatedRoots.some(root => p.startsWith(`examples/${root}/`)));
  return { affected: !unrelated, reason: unrelated ? 'all paths belong to other known examples; applicable local CI still required' : 'Recorder, shared build/gate input, or unknown path' };
}

// Clock and probes are injected only as JavaScript dependencies for offline fixtures.
// Readiness latency is separate from the uninterrupted stability window.
export async function observe({ probe, responsive, now = () => performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms)), launchedAt, readyTimeout = 30000, window = 5000, maxGap = 1500, onReady = async () => {} }) {
  const launched = launchedAt ?? now(); let readyAt; let identity; let last; const samples = [];
  for (;;) {
    const sample = await bounded(probe, Math.min(maxGap, readyAt === undefined ? readyTimeout - (now() - launched) : maxGap), 'runtime probe'); const at = now();
    requireThat(Number.isFinite(at) && at >= launched && (last === undefined || at >= last), 'non-monotonic observation');
    requireThat(!sample.fatal && sample.alive && sample.identity && sample.foreground, 'fatal, dead, missing or background runtime');
    if (identity) requireThat(identity === sample.identity, 'runtime restarted');
    else identity = sample.identity;
    if (last !== undefined) requireThat(at - last <= maxGap, 'observation coverage gap');
    last = at; samples.push({ elapsed_ms: at - launched, ...sample });
    if (readyAt === undefined) {
      requireThat(at - launched <= readyTimeout, 'readiness timeout');
      if (sample.ready) { readyAt = at; await onReady(); }
    } else {
      requireThat(sample.ready, 'Record control disappeared');
      if (at - readyAt >= window) break;
    }
    await sleep(100);
  }
  requireThat(await bounded(responsive, 10000, 'responsiveness'), 'runtime unresponsive');
  const final = await bounded(probe, maxGap, 'final runtime probe'); const ended = now();
  requireThat(final.ready && final.alive && final.foreground && !final.fatal && final.identity === identity, 'final Record/instance/foreground check failed');
  return { launched_ms: launched, ready_ms: readyAt, ended_ms: ended, readiness_ms: readyAt - launched, stable_ms: last - readyAt, max_gap_ms: maxGap, identity, samples, final, responsive: true };
}

export function validatePlatform(result, candidate, platform) {
  requireThat(result?.status === 'PASS' && result.platform === platform && sameCandidate(result.candidate, candidate), `${platform}: missing, failed or stale receipt`);
  requireThat(result.artifact?.sha256?.match(/^[a-f0-9]{64}$/) && result.artifact.files?.length, `${platform}: artifact evidence missing`);
  const o = result.observation;
  requireThat(result.monitor_started_before_launch === true, `${platform}: pre-launch monitoring evidence missing`);
  requireThat(result.screenshots?.length === (platform === 'web' ? 2 : 1) && result.screenshots.every(s=>s.bytes>8 && /^[a-f0-9]{64}$/.test(s.sha256??'')), `${platform}: screenshot evidence missing`);
  requireThat(result.target && result.runtime && result.commands?.length && o?.stable_ms >= 5000 && o.readiness_ms >= 0 && o.readiness_ms <= 30000 && o.responsive && o.identity && o.final?.identity === o.identity && o.final.ready && o.final.foreground && o.final.alive && !o.final.fatal && o.samples?.length >= 2, `${platform}: incomplete observation`);
}
