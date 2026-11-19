#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { cli } from './host.mjs';
import { artifact, requireThat } from './core.mjs';
import { serveExport } from './web.mjs';

const options=cli(process.argv.slice(2),['receipt']);
const path=resolve(options.receipt);const receipt=JSON.parse(readFileSync(path,'utf8'));
requireThat(receipt.platform==='web'&&receipt.status==='PASS','a successful exact Web receipt is required');
const directory=join(dirname(path),'export');
requireThat(artifact(directory).sha256===receipt.artifact.sha256,'preview export digest differs from tested artifact');
const server=await serveExport(directory);
console.log(JSON.stringify({url:server.url,tested:receipt.candidate.tested,artifact:server.artifact.sha256,scope:'loopback only; Ctrl-C stops preview'}));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void server.close().then(()=>process.exit(0)));
