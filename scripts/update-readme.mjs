#!/usr/bin/env node
// Conservative local update: only edit if expected existing GATE README markers exist.
import fs from 'node:fs';
const path=process.argv[2]||'README.md';
let source=fs.readFileSync(path,'utf8');
if(!source.startsWith('# GATE — Authority Verification Network'))throw Error('This is not the expected GATE repository README. Refusing to edit.');
const links=`\n## GATE v7 — current Developer Preview\n\n> **Current operational boundary:** one Canadian primary database, **no production regional replicas**, and no independent third-party issuer propagation SLA. \`maxStalenessMs\` measures primary snapshot age only. The Developer Preview is **not enterprise GA**.\n\n- [Try the real hosted two-minute sandbox](https://gate-beta-nu.vercel.app/demo.html) — actual HTTP calls on a clearly labeled **synthetic** two-path graph.\n- [Connect your own ES256 signer](https://gate-beta-nu.vercel.app/integration.html) — live GATE v7 network API, using a disposable Free project.\n- [Read: A valid signature is not live authority](https://gate-beta-nu.vercel.app/article.html).\n- [Apply for the independent developer beta](https://gate-beta-nu.vercel.app/).\n- [V7 API, topology and limitations](docs/GATE-V7-LIVE-STATUS.md).\n- [Real ES256 quickstart](docs/LIVE-ISSUER-QUICKSTART.md).\n\n`;
if(!source.includes('## GATE v7 — current Developer Preview'))source=source.replace('## Where GATE fits',links+'## Where GATE fits');
if(!source.includes('## GATE v7 — current Developer Preview'))throw Error('Expected heading insertion anchor not found');
const olds=[
 ['- `bounded`: edge-local verification against a signed replica lease, with caller-defined maximum staleness; stale replicas fail closed.',
 '- `bounded`: live verification from the canonical primary on v7, with a bounded primary-read snapshot age; **regional replicas are not yet deployed**.'],
 ['- `strict`: synchronous control-plane confirmation; higher latency and lower partition availability in exchange for current-state confirmation.',
 '- `strict`: canonical primary-read verification available only to eligible plans; **not** synchronous confirmation of external issuer systems.']
];
for(const [before,after]of olds)if(source.includes(before))source=source.replace(before,after);
fs.writeFileSync(path,source);
console.log('Updated '+path+' with current v7 links and accurate consistency semantics. Review git diff before committing.');
