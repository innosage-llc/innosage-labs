import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PLATFORMS, sameCandidate, requireThat } from './core.mjs';

const app = 'examples/ai-recorder/';
const matrix = app + 'docs/platform-parity.md';
const readme = app + 'README.md';
const dependency = 'b4aca59089eeaf519220b80b39e1ceca3a4b9cb7';
export const contracts = {
  'library-import': {
    policy: ['libraryImport.ts','m4aDuration.ts'],
    entry: 'App.tsx',
    inputs: ['index.ts','captureSession.ts','ui/RootShell.tsx','ui/AppChrome.tsx','browserDatabase.web.ts',
      'scripts/fixtures/library-import.mjs','scripts/fixtures/recorder-test-tone.m4a','package.json','package-lock.json','app.config.js','app.json',
      'modules/recorder-media-probe/','scripts/library-import-web.mjs'],
    adapters: {
      android:['ui/RootShell.tsx','ui/AppChrome.tsx','mediaLibrary.ts','modules/recorder-media-probe/android/'],
      ios:['ui/RootShell.ios.tsx','mediaLibrary.ts','modules/recorder-media-probe/ios/'],
      web:['ui/RootShell.tsx','ui/AppChrome.web.tsx','mediaLibrary.web.ts','localFiles.web.ts'],
    },
  },
};

function rows(text) {
  const section = text.split('## Candidate outcomes')[1]?.split(/^## /m)[0] ?? '';
  return section.split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| Outcome |'));
}

export function changedOutcomes(before, after, promiseChanged) {
  const previous = rows(before), current = rows(after);
  requireThat(current.length > 0, 'Recorder outcome matrix missing');
  const changed = current.filter(row => !previous.includes(row));
  const removed = previous.filter(row => !current.includes(row));
  requireThat((!promiseChanged && !removed.length) || changed.length, 'changed PRD needs a revised outcome row');
  return changed.map(row => {
    const key = row.match(/<!-- outcome:([a-z0-9-]+) -->/)?.[1];
    requireThat(key && Object.hasOwn(contracts,key), 'changed outcome needs its shared policy, adapters and platform observers');
    requireThat(row.split('|').slice(1,-1).length === 4 && row.split('|').slice(2,-1).every(cell => cell.trim()), 'changed outcome lacks a platform');
    return key;
  });
}

export function requiredOutcomes(source, candidate, paths) {
  const read = file => readFileSync(join(source,file),'utf8');
  const git = (...args) => execFileSync('git',args,{cwd:source,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  let base = candidate.base;
  // #146 adopts the matrix from the explicit build 18 dependency. Once main
  // contains the matrix, every comparison uses the candidate's current base.
  if (!git('ls-tree',base,'--',matrix).trim()) {
    git('merge-base','--is-ancestor',base,dependency);
    git('merge-base','--is-ancestor',dependency,candidate.head);
    base = dependency;
  }
  const promise = text => text.split('## Product promise and release status')[1]?.split('\n### ')[0]?.trim();
  const required = new Set(changedOutcomes(git('show',base+':'+matrix),read(matrix),
    promise(git('show',base+':'+readme)) !== promise(read(readme))));
  for (const [key,contract] of Object.entries(contracts)) {
    const files = [contract.entry,...contract.policy,...contract.inputs,...Object.values(contract.adapters).flat()];
    if (paths.some(path => files.some(file => file.endsWith('/') ? path.startsWith(app+file) : path === app+file)) ||
        paths.some(path => path.startsWith('scripts/recorder-gate/import-test/') || path.startsWith('scripts/recorder-gate/prd-outcomes') ||
          path === 'scripts/recorder-gate/LibraryImportTests.swift')) required.add(key);
    for (const file of files) requireThat(existsSync(join(source,app,file)), 'missing outcome source: '+file);
    for (const [platform, adapters] of Object.entries(contract.adapters)) {
      for (const file of [contract.entry, ...adapters].filter(name => /\.tsx?$/.test(name))) {
        const stem = file.replace(/(?:\.(?:android|ios|web|native))?\.tsx?$/, '');
        // Metro prefers platform, then native, then the unsuffixed implementation.
        const suffixes = [platform,...(platform === 'web' ? [] : ['native']),''];
        const selected = suffixes.flatMap(suffix => ['tsx','ts','jsx','js'].map(ext =>
          [stem,suffix,ext].filter(Boolean).join('.'))).find(name => existsSync(join(source,app,name)));
        requireThat(selected === file, 'unregistered '+platform+' adapter or entry: '+selected);
      }
    }
    for (const policy of contract.policy) {
      const folder = dirname(join(source,app,policy)), stem = basename(policy,'.ts');
      requireThat(!readdirSync(folder).some(name => name.startsWith(stem+'.') && /\.(android|ios|native|web)\.[cm]?[jt]sx?$/.test(name)), 'platform fork: '+policy);
      requireThat(!/\bPlatform\s*\.\s*(OS|select)\b/.test(read(app+policy)), 'platform branching in '+policy);
    }
    requireThat(PLATFORMS.every(p => contract.adapters[p]?.length), 'missing adapter registration');
    requireThat(read(matrix).includes('<!-- outcome:'+key+' -->'), 'registered outcome missing from matrix');
  }
  return [...required];
}

export function verifyOutcome(receipt, platform, candidate, artifact) {
  requireThat(receipt?.candidate && sameCandidate(receipt.candidate,candidate) && receipt.platform === platform &&
    receipt.artifact === artifact?.sha256 && /^[0-9a-f]{64}$/.test(receipt.artifact), 'outcome evidence missing or stale');
  requireThat(receipt.outcome === 'library-import' && /^Import-\d+-[a-f0-9-]+\.m4a$/.test(receipt.id) &&
    receipt.sha256 === '07b0d24a10e960aa9b45bfff066318cd946da98d521d39b2ad2e51f8575fecb7', 'Library identity or fixture digest missing');
  if (platform === 'ios') requireThat(receipt.offline === 'Simulator Recorder HTTP transport' && receipt.offlineLaunches === 4,
    'missing Simulator network failure controls');
  const cases = ['cancel','repeat','forged','save-failure','retry', 'offline-playback'];
  requireThat(cases.every(test => receipt.cases?.includes(test)), 'incomplete Library entry scenarios');
}
