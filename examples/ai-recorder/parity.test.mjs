import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { freeTargets } from './freeTargets.ts';
import { productionFreeEligible as appleAndWeb } from './productionFreeEligible.ts';
import { productionFreeEligible as android } from './productionFreeEligible.android.ts';

const approved = JSON.parse(readFileSync(new URL('./recorder-free-targets.json', import.meta.url)));
for (const [platform, eligible] of Object.entries({ android, ios: appleAndWeb, web: appleAndWeb })) {
  test(platform + ' honors separate build inputs and the protected Production rollout', () => {
    const targets = inputs => freeTargets(approved, inputs, eligible);
    assert.deepEqual(targets({}), { staging: undefined, production: undefined });
    assert.deepEqual(targets({ staging: approved.staging }), { staging: approved.staging, production: undefined });
    assert.deepEqual(targets({ staging: approved.production, production: approved.staging }),
      { staging: undefined, production: undefined });
    assert.deepEqual(targets({ production: approved.production }), {
      staging: undefined, production: platform === 'android' ? approved.production : undefined,
    });
    for (const input of [approved.staging + '.invalid', approved.staging + '/other', 'https://example.invalid']) {
      assert.equal(targets({ staging: input }).staging, undefined);
    }
  });
}

test('recording and provider policies have one implementation across platforms', () => {
  // Platform suffixes here would silently replace shared policy in Metro. Add or change
  // reviewed adapter exceptions in the parity matrix when an OS needs different primitives.
  const shared = ['freeTargets', 'ServiceConfig', 'GatewayGuest', 'ProClient', 'operationRecovery',
    'transcriptCompletion', 'transcriptExport', 'captureSession', 'audioShareFilename'];
  for (const name of shared) {
    const source = readFileSync(new URL('./' + name + '.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bPlatform\s*\.\s*(OS|select)\b/, name);
    for (const platform of ['android', 'ios', 'web', 'native']) {
      for (const ext of ['ts', 'tsx', 'js', 'jsx']) {
        const variant = new URL('./' + name + '.' + platform + '.' + ext, import.meta.url);
        assert.equal(existsSync(variant), false, name + ' is shared; review its platform boundary before forking.');
      }
    }
  }
});
