#!/usr/bin/env node
// Production source has no test-control import or switch.
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=process.argv[2]&&resolve(process.argv[2]);
if(!output||existsSync(output)||!output.endsWith('.apk')||!process.env.ANDROID_HOME||!process.env.JAVA_HOME)
  throw Error('Supply a new output .apk path, ANDROID_HOME and JAVA_HOME. Use a dedicated checkout.');
const source=join(app,'captureSession.ts'),helper=join(app,'saveBoundary.test-only.ts');
const original=readFileSync(source,'utf8');
const boundary='const savedUri = await this.dependencies.save(status.url);';
if(existsSync(helper)||original.split(boundary).length!==2)throw Error('Unexpected source or existing QA helper.');
const run=(command,args)=>{
  const r=spawnSync(command,args,{cwd:app,stdio:'inherit',env:{...process.env,CI:'1',EXPO_OFFLINE:'1',EXPO_NO_TELEMETRY:'1',EXPO_NO_DOTENV:'1'}});
  if(r.error||r.status!==0)throw r.error??Error(`${command} exited ${r.status}`);
};
let gradle,normalGradle;
try {
  run('./node_modules/.bin/expo',['prebuild','--platform','android','--no-install']);
  gradle=join(app,'android/app/build.gradle');normalGradle=readFileSync(gradle,'utf8');
  if(!normalGradle.includes('release {')||/debuggable true/.test(normalGradle))throw Error('Expected ordinary generated Release configuration.');
  writeFileSync(gradle,normalGradle.replace('release {','release {\n            debuggable true'));
  writeFileSync(helper,`import { File, Paths } from 'expo-file-system';
export async function saveBoundary(point: string, uri: string) {
  const config = new File(Paths.document, 'labs95-test.json');
  if (!config.exists) return;
  const settings = JSON.parse(config.textSync());
  if (settings.pauseAt !== point) return;
  new File(Paths.document, 'labs95-checkpoint.json').write(JSON.stringify({point, uri, runId:settings.runId, at: Date.now()}));
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 200));
    if (config.exists && JSON.parse(config.textSync()).release === true) return;
  }
}
`);
  writeFileSync(source,"import { saveBoundary } from './saveBoundary.test-only';\n"+original.replace(boundary,"await saveBoundary('A', status.url);\n      "+boundary+"\n      await saveBoundary('B', savedUri);"));
  run('./android/gradlew',['-p','android','app:assembleRelease','--offline','--no-daemon','--max-workers=2','-PreactNativeArchitectures=arm64-v8a','-Porg.gradle.java.installations.auto-download=false',...(process.env.LABS85_JAVA_TOOLCHAINS?[`-Porg.gradle.java.installations.paths=${process.env.LABS85_JAVA_TOOLCHAINS}`]:[])]);
  mkdirSync(dirname(output),{recursive:true});copyFileSync(join(app,'android/app/build/outputs/apk/release/app-release.apk'),output);
  console.log(JSON.stringify({kind:'TEST_ONLY_INTERRUPTION_APK',sha256:createHash('sha256').update(readFileSync(output)).digest('hex')}));
}finally{
  writeFileSync(source,original);if(existsSync(helper))unlinkSync(helper);
  if(normalGradle!==undefined)writeFileSync(gradle,normalGradle);
}
