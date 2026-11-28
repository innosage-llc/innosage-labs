import assert from 'node:assert/strict';
import test from 'node:test';
import loadConfig from './app.config.js';

const keys = ['RECORDER_STAGING_ANDROID_RELEASE', 'RECORDER_PARITY_ANDROID_RELEASE',
  'EXPO_PUBLIC_RECORDER_VOICE_PROFILES', 'EXPO_PUBLIC_RECORDER_GATEWAY_URL',
  'EXPO_PUBLIC_RECORDER_PRODUCTION_GATEWAY_URL'];
function configure(given) {
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, given);
    return loadConfig({ config: {} });
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}
const optIn = { EXPO_PUBLIC_RECORDER_VOICE_PROFILES: 'true' };
const stage = { RECORDER_STAGING_ANDROID_RELEASE:'1',
  EXPO_PUBLIC_RECORDER_GATEWAY_URL:'https://rd.innosage.co:8443/recorder' };
test('an enabled voice bundle is rejected unless built as an exact staging Android candidate', () => {
  assert.deepEqual(configure({}), {});
  assert.throws(() => configure(optIn), /explicitly staged/);
  assert.throws(() => configure({ ...optIn, RECORDER_PARITY_ANDROID_RELEASE:'1' }), /explicitly staged/);
  assert.throws(() => configure({ ...optIn,...stage, RECORDER_PARITY_ANDROID_RELEASE:'1' }), /exclude the Production/);
  assert.throws(() => configure({ ...optIn,...stage, EXPO_PUBLIC_RECORDER_PRODUCTION_GATEWAY_URL:'https://speech-router.innosage.co:8443/recorder' }),
    /exclude the Production/);
  assert.throws(() => configure({...optIn, ...stage, EXPO_PUBLIC_RECORDER_GATEWAY_URL:'https://unverified.invalid'}), /approved Staging/);
  assert.deepEqual(configure({ ...stage,...optIn }), {});
});
