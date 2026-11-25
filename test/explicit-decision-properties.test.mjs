import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {permitsEffect} from '../src/admission-policy.mjs';
test('inherited authority and decision are not explicit authorization evidence',()=>{assert.equal(permitsEffect(Object.create({authority:'VALID',decision:'ALLOW'})),false);});
test('SDK ignores polluted prototype authorization on empty HTTP JSON',()=>{
 const module=new URL('../packages/sdk/dist/index.js',import.meta.url).href;
 const child=spawnSync(process.execPath,['--input-type=module','-e',`import {GateClient} from ${JSON.stringify(module)};let effects=0;Object.defineProperties(Object.prototype,{authority:{value:'VALID',configurable:true},decision:{value:'ALLOW',configurable:true}});try{const gate=new GateClient({endpoint:'https://fixture.invalid',fetchImpl:async()=>new Response('{}',{status:200})});await gate.enforce({principal:'p',actor:'a'},()=>++effects);}catch{}finally{delete Object.prototype.authority;delete Object.prototype.decision;}console.log(JSON.stringify({effects}));`],{encoding:'utf8',timeout:5000});
 assert.equal(child.status,0);assert.equal(JSON.parse(child.stdout).effects,0);
});
