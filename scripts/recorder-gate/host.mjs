import { spawnSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO, requireThat, validateCandidate, commit, writeJSON } from './core.mjs';

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const appPath = 'examples/ai-recorder';
export function run(command, args, { cwd = root, timeout = 120000, env = {}, onResult, ...rest } = {}) {
  const result = spawnSync(command, args, { cwd, timeout, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'], ...rest });
  onResult?.(result);
  if (result.error || result.status !== 0 || result.signal) throw Object.assign(result.error ?? new Error(`${command} failed (${result.status ?? result.signal})`), { status: result.status, stdout: result.stdout, stderr: result.stderr });
  return result.stdout;
}
export const git = (...args) => run('git', args).trim();
export function clean(cwd = root) { requireThat(!run('git', ['status', '--porcelain=v1', '--untracked-files=normal'], { cwd }).trim(), 'candidate worktree is dirty'); }
export function cli(argv, allowed) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    requireThat(argv[i]?.startsWith('--') && allowed.includes(key) && !options[key] && argv[i + 1] && !argv[i + 1].startsWith('--'), 'unknown, duplicate or missing option');
    options[key] = argv[i + 1];
  }
  return options;
}
export function prSnapshot(repo, pr) {
  requireThat(repo === REPO, 'wrong repository');
  requireThat(/^[1-9]\d*$/.test(String(pr)) && Number.isSafeInteger(Number(pr)), 'invalid PR number');
  const data = JSON.parse(run('gh', ['api', `repos/${repo}/pulls/${pr}`]));
  const base = JSON.parse(run('gh', ['api', `repos/${repo}/git/ref/heads/main`])).object.sha;
  requireThat(data.state === 'open' && data.base.ref === 'main' && data.base.repo.full_name === repo && data.head.repo.full_name === repo, 'PR must be open, same-repository and target main');
  requireThat(data.base.sha === base, 'PR base snapshot differs from current main');
  return { repo, pr: Number(pr), head: commit(data.head.sha), base: commit(base), draft: data.draft };
}
export function assertSnapshot(candidate, current) {
  requireThat(['repo', 'pr', 'head', 'base'].every(k => candidate[k] === current[k]), 'head/base/repository drift');
}
export function integrationRevision(base, head, cwd = root) {
  commit(base); commit(head);
  const g = (...args) => run('git', args, { cwd }).trim();
  const tree = g('merge-tree', '--write-tree', base, head).split('\n')[0]; commit(tree);
  const date = g('show', '-s', '--format=%ct', head);
  const tested = run('git', ['commit-tree', tree, '-p', base, '-p', head], { input: `Local integration gate: ${base} + ${head}\n`, env: {
    GIT_AUTHOR_NAME: 'Local gate', GIT_AUTHOR_EMAIL: 'local-gate@example.invalid', GIT_COMMITTER_NAME: 'Local gate', GIT_COMMITTER_EMAIL: 'local-gate@example.invalid', GIT_AUTHOR_DATE: `@${date} +0000`, GIT_COMMITTER_DATE: `@${date} +0000`,
  }, cwd }).trim();
  return { tested, tree };
}
export function prepare({ repo, pr, head, base, output }) {
  requireThat(repo === REPO && output && !existsSync(resolve(output)), 'explicit repo and new candidate output required'); clean();
  requireThat(!resolve(output).startsWith(root + '/'), 'candidate manifest must be outside repository');
  const current = prSnapshot(repo, pr);
  requireThat(current.head === commit(head) && current.base === commit(base) && git('rev-parse', 'HEAD') === head, 'explicit head/base and checkout must match PR');
  // Fetching changes only this task repository. No alternate host or remote CI.
  run('git', ['fetch', '--no-tags', 'origin', `refs/pull/${Number(pr)}/head`, 'main']);
  const { tested, tree } = integrationRevision(base, head);
  const candidate = validateCandidate({ ...current, tested, tree });
  assertSnapshot(candidate, prSnapshot(repo, pr)); writeJSON(resolve(output), candidate); return candidate;
}
export function checkout(candidate, path) {
  validateCandidate(candidate); requireThat(git('rev-parse', `${candidate.tested}^{tree}`) === candidate.tree, 'candidate tree drift');
  const parents = git('show', '-s', '--format=%P', candidate.tested).split(' ');
  requireThat(parents.length === 2 && parents[0] === candidate.base && parents[1] === candidate.head, 'candidate is not exact base/head integration');
  requireThat(git('merge-tree', '--write-tree', candidate.base, candidate.head).split('\n')[0] === candidate.tree, 'integration result drift');
  requireThat(git('rev-parse', `${candidate.tested}:scripts`) === git('rev-parse', `${candidate.head}:scripts`), 'base changed gate scripts: reconcile PR before testing');
  run('git', ['worktree', 'add', '--detach', path, candidate.tested]); clean(path);
}
export function sourceIdentity(source, candidate) {
  clean(source);
  requireThat(run('git', ['rev-parse', 'HEAD'], { cwd: source }).trim() === candidate.tested && run('git', ['rev-parse', 'HEAD^{tree}'], { cwd: source }).trim() === candidate.tree, 'tested checkout revision/tree changed');
}
export function monitor(command, args, file, options = {}) {
  writeFileSync(file, '');
  const child = spawn(command, args, { cwd: options.cwd ?? root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...options.env } });
  let content = ''; let error; let exited = false;
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { content += data.toString(); if (content.length > 8 * 1024 * 1024) { error = new Error('monitor output limit'); child.kill(); } });
  child.on('error', e => { error = e; }); child.on('exit', () => { exited = true; });
  const text = () => { if (error) throw error; requireThat(!exited, 'scoped monitor exited'); return content; };
  return { child, text, async waitFor(token, timeout = 5000) { const began=performance.now(); while(!text().includes(token)) { requireThat(performance.now()-began<timeout,'monitor readiness timeout'); await new Promise(r=>setTimeout(r,50)); } }, async stop() { if (!exited) { child.kill('SIGTERM'); await Promise.race([new Promise(r => child.once('close', r)), new Promise(r => setTimeout(r, 1500))]); } writeFileSync(file, content); requireThat(exited, 'scoped monitor cleanup unverified'); } };
}
export function loadCandidate(path) { return validateCandidate(JSON.parse(readFileSync(path, 'utf8'))); }
export function outDir(path) { const p = resolve(path); requireThat(!existsSync(p) || readdirSync(p).length === 0, 'use a fresh empty evidence directory'); mkdirSync(p, { recursive: true }); return p; }
