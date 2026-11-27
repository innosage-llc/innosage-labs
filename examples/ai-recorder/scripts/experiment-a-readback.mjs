// Compare synthetic evidence saved outside the repository. Never print its contents.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const cases = JSON.parse(await readFile(new URL('../docs/release-verification/experiment-a/transcripts.json', import.meta.url), 'utf8'));

function normalize(value) {
  return value.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\n+$/, '');
}

export function compareBody(fixture, stage, actual) {
  if (!Object.hasOwn(cases, fixture) || !['file', 'page', 'mcp'].includes(stage)) {
    throw new Error('Expected meeting or note and file, page or mcp.');
  }
  // Browser paragraph elements can add blank lines to an innerText readback.
  // The file comparison preserves every authored paragraph boundary.
  const body = normalize(cases[fixture].edited ?? cases[fixture].original);
  const format = text => stage === 'file' ? text : text.replace(/\n{2,}/g, '\n');
  const wanted = format(body);
  const observed = format(normalize(actual));
  if (observed !== wanted && !observed.endsWith('\n' + wanted)) {
    throw new Error('Saved revision, paragraph content or final line differs.');
  }
  const prefix = observed.slice(0, -wanted.length);
  // Metadata may precede the body. A stale or duplicated fixture must not.
  for (const item of Object.values(cases)) {
    const knownLines = [item.original, item.edited].filter(Boolean).flatMap(value => value.split('\n')).filter(Boolean);
    if (knownLines.some(line => prefix.includes(line))) {
      throw new Error('Extra fixture content precedes the selected transcript.');
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [fixture, stage, path, ...extra] = process.argv.slice(2);
    if (!path || extra.length) throw new Error('Usage: node scripts/experiment-a-readback.mjs <meeting|note> <file|page|mcp> <local-artifact>');
    const bytes = await readFile(path);
    compareBody(fixture, stage, new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    console.log('PASS: ' + fixture + ' ' + stage + ' synthetic transcript content');
  } catch (error) {
    console.error(error.code ? 'Cannot read the local evidence file.' : error.message);
    process.exitCode = 1;
  }
}
