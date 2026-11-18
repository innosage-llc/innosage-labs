#!/usr/bin/env node
// Canonical local CI/startup-only entry point. This command cannot merge.
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cli, loadCandidate, outDir, checkout, sourceIdentity, assertSnapshot, prSnapshot, run } from './host.mjs';
import { changedPaths, writeJSON } from './core.mjs';
import { localCI } from './local-ci.mjs';
import { aggregate } from './aggregate.mjs';

async function main() {
  const o = cli(process.argv.slice(2), ['candidate','output','android','ios-runtime']);
  const candidate = loadCandidate(o.candidate); const output = outDir(o.output);
  const source = join(mkdtempSync(join(tmpdir(), 'labs-startup-')), 'source');
  const receipt = { candidate, status: 'FAIL' };
  try {
    assertSnapshot(candidate, prSnapshot(candidate.repo, candidate.pr)); checkout(candidate, source);
    const paths = changedPaths(run('git', ['diff','--name-status','-z','--find-renames',candidate.base,candidate.head]));
    receipt.ci = localCI(source, paths, output); sourceIdentity(source,candidate);
    receipt.startup = await aggregate({ source,candidate,paths,output,targets:{ android:o.android,iosRuntime:o['ios-runtime'] } });
    sourceIdentity(source,candidate); assertSnapshot(candidate,prSnapshot(candidate.repo,candidate.pr)); receipt.status='PASS';
  } catch(e) { receipt.error=e.message; if(e.ciReceipt) receipt.ci=e.ciReceipt; throw e; }
  finally { writeJSON(join(output,'local-gate.json'),receipt); }
}
main().catch(e=>{ console.error(e.message);process.exitCode=1; });
