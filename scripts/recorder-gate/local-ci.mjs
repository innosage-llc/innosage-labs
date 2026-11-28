import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { run, clean } from './host.mjs';
import { requireThat, writeJSON } from './core.mjs';

export function localCI(source, paths, output, deps = { run, clean }) {
  deps.clean(source); const commands = []; const receipt = { status:'FAIL',commands };
  function check(command, args, cwd = source, env = {}) {
    const entry={ command, args, cwd: cwd === source ? '.' : cwd.slice(source.length + 1) };commands.push(entry);
    const began=performance.now();let captured;
    try { deps.run(command, args, { cwd, timeout: 1800000, onResult:r=>{captured=r;}, env: { CI: '1', EXPO_NO_TELEMETRY: '1', npm_config_offline: 'true', PYTHONDONTWRITEBYTECODE: '1', ...env } }); }
    finally { entry.exit_code=captured?.status??null;entry.signal=captured?.signal??null;entry.duration_ms=performance.now()-began;writeFileSync(join(output,`ci-${commands.length}.log`),`${captured?.stdout??''}\n${captured?.stderr??''}`); }
  }
  try {
  check('git', ['diff', '--check', 'HEAD^1', 'HEAD']);
  check(process.execPath, ['--test', 'scripts/recorder-gate/gate.test.mjs', 'scripts/recorder-gate/native-markdown.test.mjs']);
  const npm = dir => { const cwd = join(source, 'examples', dir); check('npm', ['ci', '--offline', '--no-audit', '--no-fund'], cwd); check('npm', ['run', 'typecheck'], cwd); check('npm', ['test'], cwd); };
  // Recorder CI also runs for unknown/shared paths; it never becomes an unrelated skip.
  npm('ai-recorder');
  check('npm', ['run', 'test:browser-parity'], join(source, 'examples/ai-recorder'));
  check('npm', ['run', 'test:ios-device'], join(source, 'examples/ai-recorder'));
  if (paths.some(p => p.startsWith('examples/ai-recorder/server/'))) check(process.env.LABS85_PYTHON ?? 'python3', ['-B','-m','unittest','discover','-s','server','-v'], join(source,'examples/ai-recorder'));
  for (const owner of new Set(paths.map(p => p.split('/')[0] === 'examples' ? p.split('/')[1] : null))) {
    requireThat(!owner || ['README.md','ai-recorder','studio-workspace','ai-cmo-workbench','is-clean-my-mac','tibo-reset-post-generator'].includes(owner), 'unknown example: add its applicable local CI before merging');
    if (owner === 'studio-workspace') npm(owner);
    if (owner === 'ai-cmo-workbench') check('bash', ['scripts/run-checks.sh'], join(source, 'examples', owner));
    if (owner === 'is-clean-my-mac') {
      const cwd = join(source, 'examples', owner);
      check('python3', ['-B', 'tests/check_runtime_boundary.py'], cwd);
      // The owning README requires native lsof/execution fixtures as well as
      // ordinary discovery. This runner rejects unavailable/skipped coverage.
      check('python3', ['-B', join(source, 'scripts/recorder-gate/required-mac-fixtures.py'), join(cwd, 'tests')], cwd);
    }
    if (owner === 'is-clean-my-mac' || owner === 'tibo-reset-post-generator') check('python3', ['-B', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], join(source, 'examples', owner));
  }
  deps.clean(source);receipt.status='PASS';return receipt;
  } catch (error) { receipt.error=error.message;error.ciReceipt=receipt;throw error; } finally { writeJSON(join(output,'applicable-ci.json'),receipt); }
}
