import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const [root, expected, ...extra] = process.argv.slice(2);
if (!root || !/^[a-f0-9]{40}$/.test(expected ?? '') || extra.length) {
  throw new Error('Usage: node scripts/stage-recorder-draft.mjs <private Draft worktree> <exact source SHA>');
}
const draft = realpathSync(root);
const git = (...args) => execFileSync('git', ['-C', draft, ...args], {encoding:'utf8'}).trim();
if (git('rev-parse', 'HEAD') !== expected || git('status', '--porcelain')) {
  throw new Error('Build Draft from the specified exact, clean commit.');
}
const origin = git('remote', 'get-url', 'origin');
if (!/^(?:git@github\.com:|https:\/\/github\.com\/)innosage-llc\/notion-style-markdown-editor-web(?:\.git)?$/.test(origin)) {
  throw new Error('The asset source must be the canonical Draft worktree.');
}
const source = join(draft, 'dist', 'recorder-editor');
if (realpathSync(source) !== source) throw new Error('The Draft build must not be symlinked.');
const release = JSON.parse(readFileSync(join(source, 'release.json'), 'utf8'));
if (release.source_revision !== expected || release.contract !== 'draft-recorder-local-v1') {
  throw new Error('The Draft build does not match the specified source SHA and contract.');
}

const app = fileURLToPath(new URL('..', import.meta.url));
const assets = join(app, 'modules','recorder-draft-editor','android','src','main','assets');
const output = join(assets, 'recorder-draft');
execFileSync('git', ['-C', app, 'check-ignore', '-q', join(output, 'index.html')]);
if (existsSync(output)) throw new Error('Private staged assets already exist. Preserve them or use a fresh checkout.');
mkdirSync(assets, {recursive:true, mode:0o700});
const staging = join(app, 'modules', 'recorder-draft-editor', 'android', 'build', 'private-staging');
mkdirSync(staging, {recursive:true, mode:0o700});
const scratch = mkdtempSync(join(staging, 'recorder-draft-'));
chmodSync(scratch, 0o700);
const sum = createHash('sha256');
let count = 0;
function stage(path) {
  for (const entry of readdirSync(path).sort()) {
    if (!/^[A-Za-z0-9._-]+$/.test(entry) || entry.startsWith('.') || /\.map$/i.test(entry)) {
      throw new Error('Unexpected Draft asset name.');
    }
    const item = join(path, entry);
    const stat = lstatSync(item);
    const rel = relative(source, item);
    if (stat.isDirectory()) { stage(item); continue; }
    if (!stat.isFile()) throw new Error('Draft builds must contain regular files only.');
    const target = join(scratch, rel);
    mkdirSync(dirname(target), {recursive:true, mode:0o700});
    copyFileSync(item, target);
    chmodSync(target, 0o600);
    const hash = createHash('sha256').update(readFileSync(target)).digest('hex');
    sum.update(rel + '\0' + hash + '\n');
    count++;
  }
}
stage(source);
if (count < 3 || !existsSync(join(scratch, 'index.html'))) throw new Error('Incomplete Draft asset set.');
renameSync(scratch, output);
console.log(JSON.stringify({sourceRevision:expected, assetCount:count, treeSha256:sum.digest('hex')}));
