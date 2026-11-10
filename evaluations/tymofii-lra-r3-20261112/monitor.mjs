// Filesystem-only monitor. No credentials, HTTP, telemetry or trigger capability.
import fs from 'node:fs';import path from 'node:path';
const i=process.argv.indexOf('--out'),dir=process.argv[i+1];if(i<0||!dir)throw Error('OUTPUT_REQUIRED');let last='';
const timer=setInterval(()=>{const file=path.join(dir,'results.json');if(!fs.existsSync(file))return;try{const r=JSON.parse(fs.readFileSync(file));const s=JSON.stringify({mode:r.mode,status:r.status,attempts:r.attempts,remaining:r.remaining,cleanup:r.cleanup,counts:r.counts,cases:r.cases.map(c=>({id:c.id,status:c.status}))});if(s!==last){console.log(s);last=s;}if(r.finalized===true)clearInterval(timer);}catch{/* a snapshot can be in the middle of its local rewrite */}},1000);
process.on('SIGINT',()=>{clearInterval(timer);process.exit(0);});
