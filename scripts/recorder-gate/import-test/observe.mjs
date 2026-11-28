import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { noPlayableSamples } from '../../../examples/ai-recorder/scripts/fixtures/library-import.mjs';
import { observeIOSImport } from './ios.mjs';

export async function observeImport({platform, command, source, output, candidate, artifact, uuid, derived, serial, built}) {
  const app = join(source,'examples/ai-recorder');
  const fixture = join(app,'scripts/fixtures/recorder-test-tone.m4a');
  const forged = join(output,'forged.m4a');
  writeFileSync(forged,noPlayableSamples(readFileSync(fixture)));
  let result;
  if (platform === 'ios') {
    result = observeIOSImport({command, uuid, output, derived, fixture, forged});
  } else {
    if (platform === 'web') {
      command(process.execPath,['scripts/library-import-web.mjs',built, output],{timeout:120000});
    } else {
      command('python3',[join(source,'scripts/recorder-gate/import-test/android.py'),serial,app,output,built],{timeout:240000});
    }
    result = JSON.parse(readFileSync(join(output,'library-'+platform+'.json'),'utf8'));
  }
  return {...result,outcome:'library-import',platform,candidate,artifact:artifact.sha256};
}
