#!/usr/bin/env node
/**
 * GATE developer activation: real hosted Free network + locally-controlled
 * ES256 authority issuer. Not independent upstream issuer integration.
 * No external effect, payment or hosted Stage18 bounded work is executed.
 * Node 20+. Does not print tokens or private keys.
 */
import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_URL = 'https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network';
const EVENT_TYPE = 'urn:gate:event:authority-edge-state:v1';
const slug = () => crypto.randomUUID().replaceAll('-', '');
const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const fail = message => { throw new Error(message); };
function requireCondition(ok, reason) { if (!ok) fail(reason); }
function isAllowedBase(url) {
  const parsed = new URL(url);
  return parsed.protocol === 'https:' ||
    (parsed.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(parsed.hostname));
}
async function api({ baseUrl, apiKey, fetchImpl }, route, method = 'GET', body) {
  const url = `${baseUrl.replace(/\/$/, '')}${route}`;
  const headers = {authorization: `Bearer ${apiKey}`};
  if (body !== undefined) headers['content-type'] = 'application/json';
  let response;
  try { response = await fetchImpl(url, {method,headers, ...(body !== undefined ? {body:JSON.stringify(body)} : {}), signal: AbortSignal.timeout(10000)}); }
  catch (e) { throw new Error(`GATE connection failed at ${route}: ${e?.name ?? 'network_error'}`); }
  let data;
  try { data = await response.json(); } catch { throw new Error(`GATE returned non-JSON at ${route} (HTTP ${response.status})`); }
  if (!response.ok || data?.ok === false) throw new Error(`GATE ${route}: ${data?.error || `HTTP_${response.status}`}`);
  return data;
}
function signEvent({ privateKey, kid, issuer, audience, edge, principal, actor, sequence, status }) {
  const now = new Date();
  const event = {
    edge_id: edge, issuer_principal: principal, subject_principal: actor,
    status, sequence, event_timestamp: now.toISOString(),
    ...(status === 'ACTIVE' ? { valid_until: new Date(now.getTime() + 120_000).toISOString() } : {})
  };
  const claims = {iss:issuer,aud:audience,iat:Math.floor(now.getTime()/1000),
    jti:`activation-${slug()}`,events:{[EVENT_TYPE]:event}};
  const head = b64({alg:'ES256',typ:'secevent+jwt',kid});
  const payload = b64(claims);
  const signature = crypto.sign('sha256',Buffer.from(`${head}.${payload}`),
    {key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  return `${head}.${payload}.${signature}`;
}
function ensureDecision(reply, expected, label) {
  requireCondition(reply && reply.decision === expected, `${label}: expected ${expected}, got ${reply?.decision ?? 'no_decision'}`);
  requireCondition(expected !== 'ALLOW' || reply.authority === 'VALID', `${label}: ALLOW without VALID authority`);
}
/**
 * The only effect is a local test callback, never a payment/email. The trusted
 * tool/resource owner must invoke this check. Action is merely audit context in
 * Stage17; work-scope/parameters are NOT authorized by the live v7 API.
 */
export async function runActivation({
  apiKey, baseUrl = DEFAULT_URL, fetchImpl = fetch,
  onEffect = async () => {}, log = console.log
} = {}) {
  requireCondition(typeof apiKey === 'string' && /^gate_sk_/.test(apiKey),
    'Set GATE_API_KEY from a new disposable Free project (not your production key).');
  requireCondition(isAllowedBase(baseUrl), 'GATE endpoint requires HTTPS (except loopback tests)');
  const ctx = {baseUrl,apiKey,fetchImpl};
  const info = await api(ctx,'/v1/project');
  const projectId = info.projectId;
  requireCondition(typeof projectId === 'string' && /^[0-9a-f-]{36}$/i.test(projectId), 'invalid_project_id');
  requireCondition(info.plan === 'free' && info.activeIssuers === 0,
    'For safety use a NEW disposable Free project without any existing authority issuer.');
  const id = slug();
  const issuer = `urn:gate:external-activation:${id}`;
  const principal = `user:activation:${id}`;
  const actor = `agent:activation:${id}`;
  const edge = `edge:activation:${id}`;
  const action = {protocol:'mcp',name:'tools/call:write_local_marker',resource:`local:activation:${id}`};
  const {privateKey,publicKey} = crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
  const kid = `gate-activation-${id.slice(0,20)}`;
  const publicJwk = {...publicKey.export({format:'jwk'}),alg:'ES256',use:'sig',kid};
  const audience = `urn:gate:project:${projectId}`;
  let issuerRegistered = false;
  let effectCount = 0;
  const verify = () => api(ctx,'/v1/authority/verify','POST',{
    principal,actor,action,consistency:'bounded'
  });
  const guardedEffect = async () => {
    const decision = await verify();
    if (decision.decision !== 'ALLOW' || decision.authority !== 'VALID') return {executed:false,decision};
    await onEffect({action,principal,actor});
    effectCount++;
    return {executed:true,decision};
  };
  try {
    const before = await verify();
    ensureDecision(before,'DENY','before_grant');
    log('PASS: before signed grant => DENY');
    await api(ctx,'/v1/issuers/register','POST',{
      issuer,publicJwk,principalPatterns:[principal]
    });
    issuerRegistered = true;
    await api(ctx,'/v1/authority/events','POST',{
      set:signEvent({privateKey,kid,issuer,audience,edge,principal,actor,sequence:1,status:'ACTIVE'})
    });
    const allowed = await guardedEffect();
    ensureDecision(allowed.decision,'ALLOW','after_signed_grant');
    requireCondition(allowed.executed && effectCount === 1,'authorized_effect_missing');
    log('PASS: signed ACTIVE grant => VALID / ALLOW; one guarded local effect');
    await api(ctx,'/v1/authority/events','POST',{
      set:signEvent({privateKey,kid,issuer,audience,edge,principal,actor,sequence:2,status:'REVOKED'})
    });
    const after = await guardedEffect();
    ensureDecision(after.decision,'DENY','after_revocation');
    requireCondition(!after.executed && effectCount === 1,'revoked_effect_was_executed');
    log('PASS: signed REVOKED grant => DENY; no second effect');
    return {ok:true,projectId,steps:3,localEffects:effectCount,
      authenticatedNetwork:true,source:'developer-controlled ES256 issuer',
      independentExternalSource:false,stage18BoundedWork:false};
  } finally {
    if (issuerRegistered) {
      try {
        await api(ctx,'/v1/issuers/revoke','POST',{issuer,keyId:kid});
        log('CLEANUP: disposable issuer trust revoked');
      } catch {
        log('WARNING: issuer trust cleanup failed; revoke it manually in this disposable project');
      }
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const apiKey = process.env.GATE_API_KEY;
  const baseUrl = process.env.GATE_URL || DEFAULT_URL;
  let dir;
  try {
    dir = await fs.mkdtemp(path.join(os.tmpdir(),'gate-activation-'));
    const marker = path.join(dir,'effect.log');
    const report = await runActivation({apiKey,baseUrl,
      onEffect: async () => fs.appendFile(marker,'GATE authorized local effect\n','utf8')});
    const content = await fs.readFile(marker,'utf8');
    requireCondition(content.trim().split('\n').length === 1,'local_effect_count_mismatch');
    console.log(JSON.stringify(report,null,2));
    console.log('PASS: GATE live activation complete; no external side effects performed.');
  } catch (e) { console.error(`FAIL: ${e?.message ?? 'activation_failed'}`); process.exitCode = 1; }
  finally { if (dir) await fs.rm(dir,{recursive:true,force:true}); }
}
