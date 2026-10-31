#!/usr/bin/env node
/**
 * Bounded Free GATE E2E pilot probe: real MCP tools/call, hosted live authority,
 * developer-owned ephemeral ES256 issuer, true revocation, local marker only.
 * Requires a NEW disposable Free project with zero active issuers.
 * Does not test third-party issuer propagation or Stage18 work-specific permits.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network';
const EVENT = 'urn:gate:event:authority-edge-state:v1';
const apiKey = process.env.GATE_API_KEY;
const baseUrl = (process.env.GATE_URL || BASE).replace(/\/$/, '');
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const ensure = (condition, message) => {if (!condition) throw new Error(message);};
const random = () => crypto.randomUUID().replaceAll('-', '');

function validateConfiguration() {
  ensure(/^gate_sk_/.test(apiKey || ''), 'Use GATE_API_KEY from a NEW disposable Free project');
  const url = new URL(baseUrl);
  ensure(url.protocol === 'https:' ||
    (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)),
    'GATE_URL must use HTTPS (except local fixture)');
  // Never transmit a real project bearer to arbitrary HTTPS endpoints.
  // Loopback override is exclusively for the self-contained local fixture test.
  const localFixture = process.env.GATE_PILOT_TEST_FIXTURE === '1' &&
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  ensure(baseUrl === BASE || (localFixture && url.pathname.endsWith('/gate-network')),
    'GATE_URL must be the canonical Free network endpoint (or explicit local fixture)');
}

async function api(route, method = 'GET', data) {
  let response;
  try {
    response = await fetch(`${baseUrl}${route}`, {
      method, redirect: 'error',
      headers: {
        authorization: `Bearer ${apiKey}`,
        ...(data === undefined ? {} : {'content-type':'application/json'})
      },
      ...(data === undefined ? {} : {body: JSON.stringify(data)}),
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    throw new Error(`GATE request failed (${route}, ${error?.name || 'network'})`);
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error(`GATE returned non-JSON (${route}, HTTP ${response.status})`); }
  ensure(response.ok && result?.ok !== false,
    `GATE returned failure (${route}, HTTP ${response.status}, ${result?.error || 'unknown'})`);
  return result;
}

function signedEvent({issuer, privateKey, kid, audience, edgeId, principal, actor, seq, status}) {
  const now = new Date();
  const authorityEdge = {
    edge_id: edgeId, issuer_principal: principal, subject_principal: actor,
    status, sequence: seq, event_timestamp: now.toISOString(),
    ...(status === 'ACTIVE' ? {valid_until: new Date(now.getTime() + 120000).toISOString()} : {})
  };
  const head = encode({alg:'ES256',typ:'secevent+jwt',kid});
  const body = encode({iss:issuer,aud:audience,iat:Math.floor(now.getTime()/1000),
    jti:`pilot-${random()}`,events: {[EVENT]:authorityEdge}});
  const signature = crypto.sign('sha256', Buffer.from(`${head}.${body}`),
    {key: privateKey, dsaEncoding:'ieee-p1363'}).toString('base64url');
  return `${head}.${body}.${signature}`;
}

function parseTool(result) {
  const entry = result.content?.find(x => x.type === 'text');
  ensure(entry?.text, 'MCP returned no JSON text');
  return JSON.parse(entry.text);
}

async function run() {
  validateConfiguration();
  const project = await api('/v1/project');
  ensure(project.plan === 'free' && project.activeIssuers === 0,
    'Stop: use a NEW disposable Free project with zero active issuers');
  ensure(/^[0-9a-f-]{36}$/i.test(project.projectId || ''), 'Invalid project ID');
  const id = random();
  const issuer = `urn:gate:pilot:${id}`;
  const principal = `user:pilot:${id}`;
  const actor = `agent:pilot:${id}`;
  const edgeId = `edge:pilot:${id}`;
  const {publicKey, privateKey} = crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
  const kid = `pilot-${id.slice(0,20)}`;
  const publicJwk = {...publicKey.export({format:'jwk'}),alg:'ES256',use:'sig',kid};
  const audience = `urn:gate:project:${project.projectId}`;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gate-pilot-mcp-'));
  const marker = path.join(dir, 'effect.log');
  let registered = false;
  let connected = false;
  const client = new Client({name:'gate-live-free-pilot-runner', version:'0.1.0'},
    {versionNegotiation: {mode:'auto'}});
  try {
    const childEnv = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined));
    Object.assign(childEnv, {
      GATE_URL:baseUrl, GATE_API_KEY: apiKey,
      GATE_PILOT_PRINCIPAL:principal, GATE_PILOT_ACTOR:actor,
      GATE_EFFECT_FILE:marker
    });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(ROOT,'examples','mcp-pilot-live-free-server.mjs')], env:childEnv
    });
    await client.connect(transport);
    connected = true;
    async function callExpected({label,allow}) {
      const reply = await client.callTool({
        name:'pilot_write_marker', arguments:{value:'authorized-marker'}
      });
      const body = parseTool(reply);
      const expected = allow ? {authority:'VALID',decision:'ALLOW'} : null;
      if (allow) {
        ensure(reply.isError !== true && body.executed === true &&
          body.decision?.authority === expected.authority &&
          body.decision?.decision === expected.decision,
          `${label}: expected VALID / ALLOW and local effect`);
      } else {
        ensure(reply.isError === true && body.executed === false &&
          body.decision?.decision === 'DENY', `${label}: expected DENY and no effect`);
      }
      const content = await fs.readFile(marker,'utf8').catch(e => e.code === 'ENOENT' ? '' : Promise.reject(e));
      const lineCount = content.trim() ? content.trim().split('\n').length : 0;
      ensure(lineCount === (allow || label === 'after_revocation' ? 1 : 0),
        `${label}: incorrect protected-effect count ${lineCount}`);
      process.stdout.write(`PASS ${label}: ${body.decision?.authority} / ${body.decision?.decision}; effects=${lineCount}\n`);
    }
    await callExpected({label:'before_grant',allow:false});
    await api('/v1/issuers/register','POST',{
      issuer,publicJwk,principalPatterns:[principal]
    });
    registered = true;
    await api('/v1/authority/events','POST',{
      set:signedEvent({issuer,privateKey,kid,audience,edgeId,principal,actor,seq:1,status:'ACTIVE'})
    });
    await callExpected({label:'after_signed_active',allow:true});
    await api('/v1/authority/events','POST',{
      set:signedEvent({issuer,privateKey,kid,audience,edgeId,principal,actor,seq:2,status:'REVOKED'})
    });
    await callExpected({label:'after_revocation',allow:false});
    const counter = parseTool(await client.callTool({name:'pilot_effect_counts',arguments:{}}));
    ensure(counter.total === 3 && counter.allow === 1 && counter.deny === 2,
      `Bad counter: ${counter.total}/${counter.allow}/${counter.deny}`);
    process.stdout.write('PASS: actual MCP tools/call + hosted GATE signed revoke + no second effect\n');
    process.stdout.write('LIMIT: developer-controlled ES256 issuer, disposable local effect, bounded Free; NOT independent issuer, scoped work permit, or SLA.\n');
  } finally {
    if (connected) await client.close().catch(() => {});
    if (registered) {
      try {await api('/v1/issuers/revoke','POST',{issuer,keyId:kid});
        process.stdout.write('CLEANUP: test issuer trust revoked\n');}
      catch {
        process.stderr.write('WARNING: issuer trust cleanup FAILED; manually revoke it in disposable project\n');
        process.exitCode = 1;
      }
    }
    await fs.rm(dir,{recursive:true,force:true});
  }
}

run().catch(error => {
  // Sanitized messages: do not echo bearer keys, JWTs or private keys.
  process.stderr.write(`FAIL: ${error.message}\n`);
  process.exitCode = 1;
});
