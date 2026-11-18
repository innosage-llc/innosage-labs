#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { REPO, sameCandidate, validateCandidate, requireThat, changedPaths, writeJSON } from './recorder-gate/core.mjs';
import { cli, root, git, run, clean, prepare, prSnapshot, assertSnapshot, checkout, sourceIdentity, loadCandidate, outDir } from './recorder-gate/host.mjs';
import { localCI } from './recorder-gate/local-ci.mjs';
import { aggregate } from './recorder-gate/aggregate.mjs';

export function reviewGate(review, candidate) {
  requireThat(review?.decision === 'PASS' && sameCandidate(review.candidate ?? {}, candidate), 'independent review missing or stale');
  requireThat(review.role === 'independent-reviewer' && review.effort === 'high' && /^gpt-[0-9.]+-sol$/.test(review.model ?? '') && /^[a-f0-9]{64}$/.test(review.catalog_sha256 ?? '') && /^[a-f0-9]{64}$/.test(review.report_sha256 ?? ''), 'independent exact-route review receipt incomplete');
}
export function mergeArguments(c) { return ['api', '--method', 'PUT', `repos/${REPO}/pulls/${c.pr}/merge`, '-f', `sha=${c.head}`, '-f', 'merge_method=squash']; }
export const production = {
  clean, snapshot: prSnapshot, assertSnapshot, checkout, sourceIdentity,
  paths: c => changedPaths(run('git', ['diff', '--name-status', '-z', '--find-renames', c.base, c.head])),
  head: () => git('rev-parse', 'HEAD'),
  ci: localCI, aggregate,
  // Ordinary GitHub merge preserves server-side review/protection requirements.
  // No admin flag, native auto-merge, status publishing or branch deletion.
  merge: c => JSON.parse(run('gh', mergeArguments(c))),
};

export async function mergeCandidate({ candidate, review, output, targets }, deps = production) {
  validateCandidate(candidate); reviewGate(review, candidate); deps.clean();
  requireThat(deps.head() === candidate.head, 'local head drift');
  const initial = deps.snapshot(candidate.repo, candidate.pr);
  requireThat(initial.draft === false, 'draft or unknown PR readiness cannot merge');
  deps.assertSnapshot(candidate, initial);
  const source = join(mkdtempSync(join(tmpdir(), 'labs-startup-')), 'source');
  const receipt = { candidate, review, status: 'FAIL', merge_attempted: false };
  try {
    deps.checkout(candidate, source);
    const paths = deps.paths(candidate); receipt.paths = paths;
    receipt.ci = await deps.ci(source, paths, output);
    requireThat(receipt.ci?.status === 'PASS', 'applicable local CI failed');
    deps.sourceIdentity(source, candidate);
    receipt.startup = await deps.aggregate({ source, candidate, paths, output, targets });
    requireThat(receipt.startup?.status === 'PASS' && sameCandidate(receipt.startup.candidate ?? {}, candidate), 'startup gate incomplete or stale');
    // Independently validate aggregate completeness at the merge boundary.
    const { recorderImpact, PLATFORMS, validatePlatform } = await import('./recorder-gate/core.mjs');
    if (recorderImpact(paths).affected) for (const p of PLATFORMS) validatePlatform(receipt.startup.platforms?.[p], candidate, p);
    deps.sourceIdentity(source, candidate); deps.clean(); requireThat(deps.head() === candidate.head, 'local head changed during gates');
    const current = deps.snapshot(candidate.repo, candidate.pr);
    requireThat(current.draft === false, 'PR became draft or readiness is unknown');
    deps.assertSnapshot(candidate, current);
    receipt.merge_attempted = true;
    receipt.merge = await deps.merge(candidate);
    requireThat(receipt.merge?.merged === true && /^[a-f0-9]{40}$/.test(receipt.merge.sha ?? ''), 'server refused merge');
    receipt.status = 'PASS'; return receipt;
  } catch (error) { receipt.error = error.message; throw error; }
  finally { writeJSON(join(output, 'merge-gate.json'), receipt); }
}

export async function main(argv = process.argv.slice(2), deps = production) {
  const options = cli(argv, ['repo', 'pr', 'head', 'base', 'prepare', 'candidate', 'review', 'output', 'android', 'ios-runtime']);
  requireThat(options.repo === REPO, `--repo ${REPO} is required`);
  if (options.prepare) {
    requireThat(!options.candidate && !options.review && !options.output, 'prepare cannot merge');
    return prepare({ repo: options.repo, pr: options.pr, head: options.head, base: options.base, output: options.prepare });
  }
  requireThat(options.candidate && options.review && options.output && options.pr && options.head && options.base, 'explicit candidate/review/output/PR/head/base required');
  const candidate = loadCandidate(resolve(options.candidate));
  requireThat(String(candidate.pr) === options.pr && candidate.head === options.head && candidate.base === options.base, 'CLI candidate binding mismatch');
  const output = outDir(options.output);
  requireThat(!output.startsWith(root + '/') && output !== root, 'evidence must be outside repository');
  return mergeCandidate({ candidate, review: JSON.parse(readFileSync(resolve(options.review), 'utf8')), output, targets: { android: options.android, iosRuntime: options['ios-runtime'] } }, deps);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().then(r => console.log(JSON.stringify({ status: r.status ?? 'PREPARED', candidate: r.candidate ?? r }))).catch(e => { console.error(e.message); process.exitCode = 1; });
