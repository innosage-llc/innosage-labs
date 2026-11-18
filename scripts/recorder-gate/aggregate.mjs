import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PLATFORMS, recorderImpact, validatePlatform, writeJSON, requireThat } from './core.mjs';
import { clean } from './host.mjs';
import { platformGate } from './platform.mjs';

export async function aggregate({ source, candidate, paths, output, targets }, gate = platformGate) {
  clean(source); const impact = recorderImpact(paths);
  const receipt = { candidate, impact, status: 'FAIL', platforms: {} };
  try {
    if (impact.affected) {
      // Do not short circuit: give each independent platform a stage-specific result.
      for (const platform of PLATFORMS) {
        const out = join(output, platform); mkdirSync(out, { recursive: true });
        try {
          const result = await gate({ platform, source, candidate, output: out, targets });
          validatePlatform(result, candidate, platform); receipt.platforms[platform] = result;
        } catch (error) { receipt.platforms[platform] = { status: 'FAIL', error: error.message }; }
      }
      requireThat(PLATFORMS.every(p => receipt.platforms[p]?.status === 'PASS'), 'one or more platform gates incomplete or failed');
    }
    clean(source); receipt.status = 'PASS'; return receipt;
  } finally { writeJSON(join(output, 'startup-gate.json'), receipt); }
}
