const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const m = JSON.parse(fs.readFileSync(path.join(root, '.innosage-ui-manifest.json')));
const check = (ok, message) => { if (!ok) throw new Error(message); };
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const names = ['LICENSE','components.tsx','index.ts','theme.tsx'];
check(m.schemaVersion === 1 && m.license === 'MIT', 'Invalid manifest/license');
check(/^[a-f0-9]{40}$/.test(m.designCommit) && /^[a-f0-9]{40}$/.test(m.releaseCommit), 'Missing immutable provenance');
check(/^[a-f0-9]{64}$/.test(m.releaseSha256) && /^[a-f0-9]{64}$/.test(m.registrySha256), 'Missing metadata hashes');
check(m.files.length === 4, 'Expected complete four-file snapshot');
const seen = new Set();
for (const f of m.files) {
  const name = path.basename(f.targetPath);
  check(names.includes(name) && f.targetPath === `ui/${name}` && f.canonicalPath === `ui-system/source/${name}` && !seen.has(name), 'Unexpected snapshot path');
  seen.add(name);
  check(hash(f.targetPath) === f.localHash, `Local drift: ${f.targetPath}`);
  check(Array.isArray(f.localModifications), 'Missing modification record');
  check(f.localModifications.length > 0 || f.sourceHash === f.localHash, 'Unrecorded source divergence');
}
check(JSON.stringify(fs.readdirSync(path.join(root,'ui')).sort()) === JSON.stringify(names), 'Unlisted UI file');
const ids = new Set();
for(const c of m.components) {
  check(!ids.has(c.id), 'Duplicate component'); ids.add(c.id);
  const f = m.files.find(f=>f.canonicalPath===c.canonicalPath);
  check(f && ['targetPath','sourceHash','localHash','localModifications'].every(k=>JSON.stringify(f[k])===JSON.stringify(c[k])), 'Component/file mismatch');
}
check(ids.size === 13, 'Incomplete0.1.0 registry');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
for(const [name,version] of Object.entries(m.dependencyVersions)) check(pkg.dependencies[name] === version, `Qualified dependency drift: ${name}`);
console.log('PASS: local snapshot hashes, complete allowlist, component mappings and qualified dependencies. Upstream authenticity requires access to the pinned Design metadata; this offline check does not fetch it.');
