#!/usr/bin/env node
// Canonical local CI/startup-only entry point. This command cannot merge.
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { clean, git, cli, loadCandidate, outDir, checkout, sourceIdentity, assertSnapshot, prSnapshot, run } from './host.mjs';
import { changedPaths, requireThat, writeJSON } from './core.mjs';

async function main() {
  const o = cli(process.argv.slice(2), ['candidate','output','android','ios-runtime']);
  const candidate = loadCandidate(o.candidate); const output = outDir(o.output);
  const source = join(mkdtempSync(join(tmpdir(), 'labs-startup-')), 'source');
  const receipt = { candidate, status: 'FAIL' };
  try {
    requireThat(git('rev-parse', 'HEAD') === candidate.head, 'launch the local gate from the exact PR head');
    clean();
    assertSnapshot(candidate, prSnapshot(candidate.repo, candidate.pr));
    checkout(candidate, source);
    const observers = join(source, 'scripts', 'recorder-gate');
    const [{ localCI }, { aggregate }] = await Promise.all([
      import(pathToFileURL(join(observers, 'local-ci.mjs')).href),
      import(pathToFileURL(join(observers, 'aggregate.mjs')).href),
    ]);
    const paths = changedPaths(run('git', ['diff','--name-status','-z','--find-renames',candidate.base,candidate.head]));
    receipt.ci = localCI(source, paths, output); sourceIdentity(source,candidate);
    receipt.startup = await aggregate({ source,candidate,paths,output,targets:{ android:o.android,iosRuntime:o['ios-runtime'] } });
    sourceIdentity(source,candidate); assertSnapshot(candidate,prSnapshot(candidate.repo,candidate.pr)); receipt.status='PASS';
  } catch(e) { receipt.error=e.message; if(e.ciReceipt) receipt.ci=e.ciReceipt; throw e; }
  finally { writeJSON(join(output,'local-gate.json'),receipt); }
}
main().catch(e=>{ console.error(e.message);process.exitCode=1; });
