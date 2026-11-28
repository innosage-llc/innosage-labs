import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUNDLE, requireThat, sha } from '../core.mjs';

export function observeIOSImport({ command, uuid, output, derived, fixture, forged }) {
  const sim = (...args) => command('xcrun',['simctl', ...args]).trim();
  const device = Object.values(JSON.parse(sim('list','devices','-j')).devices).flat().find(d => d.udid === uuid);
  requireThat(device?.name.startsWith('labs85-') && device.state === 'Booted', 'dedicated import Simulator required');
  const groups = join(device.dataPath, 'Containers/Shared/AppGroup');
  const providers = readdirSync(groups).filter(group => {
    const meta = join(groups,group,'.com.apple.mobile_container_manager.metadata.plist');
    return existsSync(meta) && command('/usr/libexec/PlistBuddy',['-c','Print :MCMMetadataIdentifier',meta]).trim() === 'group.com.apple.FileProvider.LocalStorage';
  });
  requireThat(providers.length === 1, 'local Files provider missing');
  const files = join(groups,providers[0],'File Provider Storage');
  mkdirSync(files, {recursive:true});
  for (const [name, bytes] of [['Labs146Tone.m4a',fixture], ['Labs146Forged.m4a',forged]]) {
    copyFileSync(bytes, join(files,name), 1);
  }
  const products = join(derived,'Build/Products');
  const config = readdirSync(products).find(name => name.endsWith('.xctestrun'));
  const recordings = join(sim('get_app_container',uuid,BUNDLE,'data'),'Documents/recordings');
  const listing = () => existsSync(recordings) ? readdirSync(recordings).sort() : [];
  const before = listing();
  const test = name => {
    const result = join(output, name + '.xcresult');
    command('xcodebuild',['test-without-building','-xctestrun',join(products,config),'-destination','id='+uuid,
      '-parallel-testing-enabled','NO','-only-testing:StartupGateUITests/LibraryImportTests/'+name,'-resultBundlePath',result],{timeout:160000});
    const summary = JSON.parse(command('xcrun',['xcresulttool','get','test-results','summary','--path',result]));
    requireThat(summary.passedTests === 1 && summary.failedTests === 0 && summary.skippedTests === 0, 'Library XCTest incomplete');
  };
  test('testCancelRepeatAndReject');
  requireThat(JSON.stringify(listing()) === JSON.stringify(before), 'cancel/rejection left a recording or sidecar');
  const backup = recordings + '.library-test';
  const hadDirectory = existsSync(recordings);
  requireThat(!existsSync(backup), 'unexpected existing storage fixture');
  if (hadDirectory) renameSync(recordings,backup);
  const marker = 'Library Import storage fixture';
  try {
    writeFileSync(recordings,marker,{flag:'wx'});
    test('testFailedSave');
  } finally {
    if (existsSync(recordings) && readFileSync(recordings,'utf8') === marker) unlinkSync(recordings);
    if (hadDirectory) renameSync(backup,recordings);
  }
  test('testRetry');
  const additions = listing().filter(name => !before.includes(name));
  const id = additions.find(name => /^Import-.+\.m4a$/.test(name));
  requireThat(id && additions.length === 2 && additions.includes(id + '.name'), 'expected exactly one new audio/label pair');
  const digest = sha(readFileSync(fixture));
  const verify = () => requireThat(sha(readFileSync(join(recordings,id))) === digest &&
    readFileSync(join(recordings,id + '.name'),'utf8') === 'Labs146Tone.m4a','import identity or bytes changed');
  verify();
  test('testColdPlayback');
  verify();
  return {id,sha256:digest,cases:['cancel','repeat','forged','save-failure','retry','cold-playback']};
}
