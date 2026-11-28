// Package the static shell and every emitted asset as one verifiable release.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const outputArg = args.indexOf('--output-dir');
const directory = resolve(outputArg === -1 ? 'dist-web' : args[outputArg + 1]);
const exported = spawnSync(process.execPath, ['node_modules/expo/bin/cli', 'export', '--platform', 'web',
  ...(outputArg === -1 ? ['--output-dir', directory] : []), ...args], { stdio: 'inherit' });
if (exported.status !== 0) process.exit(exported.status ?? 1);

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [];
async function visit(relative) {
  const entries = await readdir(join(directory, relative), { withFileTypes: true });
  for (const entry of entries) {
    const name = relative + '/' + entry.name;
    if (entry.isDirectory()) await visit(name);
    else if (entry.isFile()) files.push({ path: name, sha256: sha256(await readFile(join(directory, name))) });
  }
}
for (const directoryName of ['_expo/static', 'assets']) await visit(directoryName);
files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
const index = await readFile(join(directory, 'index.html'));
await writeFile(join(directory, 'recorder-shell.json'), JSON.stringify({ version: 1, index: sha256(index), files }) + '\n');
