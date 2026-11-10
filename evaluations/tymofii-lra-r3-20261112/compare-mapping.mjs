import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {sha} from './ops.mjs';
const args=process.argv.slice(2),v=n=>args[args.indexOf('--'+n)+1];
if(!args.includes('--candidate')||!args.includes('--out')){console.error('CANDIDATE_AND_OUTPUT_REQUIRED');process.exit(1);}
const baseline=fileURLToPath(new URL('./evidence/GATE-LRA-MAPPING-r3.md',import.meta.url)),candidate=v('candidate'),out=v('out');
const a=fs.readFileSync(baseline),b=fs.readFileSync(candidate),diff=spawnSync('diff',['-u',baseline,candidate],{encoding:'utf8'});
if(![0,1].includes(diff.status)){console.error('DIFF_FAILED');process.exit(1);}
fs.mkdirSync(out,{recursive:true,mode:0o700});fs.writeFileSync(path.join(out,'mapping-diff.patch'),diff.stdout,{mode:0o600});
fs.writeFileSync(path.join(out,'mapping-review.json'),JSON.stringify({baselineRevision:3,baselineSha256:sha(a),candidateSha256:sha(b),identical:a.equals(b),candidateMentionsRevision3:/revision\s*3/i.test(b.toString()),manualReviewRequired:true,approved:false,reviewTopics:['23 calls / 42 attempts / 50 cap','LRA06 graph vs credential binding','two SDK clients / one primary','LRA04 revoked vs LRA10 expiry','timelines and no retries','author-produced attribution','cleanup and timing exclusions']},null,2)+'\n',{mode:0o600});
console.log('DIFF_PREPARED_NOT_APPROVED');
