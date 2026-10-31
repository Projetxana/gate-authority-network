import crypto from 'node:crypto';

/** STAGE 18 EXPERIMENTAL: NOT EXPORTED FROM PACKAGE; NOT HOSTED OR PUBLISHED. */
export const BOUNDED_WORK_PERMIT_TYP = 'gate-bounded-work-effect-permit+jwt';
const SCOPE_KIND = 'oauth-bounded-work';
const IDENTIFIER = value => typeof value === 'string' && value.length > 0 && value.length <= 256 &&
  value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value);
const allowed = (x, keys) => x && typeof x === 'object' && !Array.isArray(x) &&
  Object.keys(x).every(k => keys.includes(k));
const fail = message => { throw new Error(message); };
const sameScope = (a, b) => allowed(a, ['kind','issuer','id']) && allowed(b, ['kind','issuer','id']) &&
  a.kind === SCOPE_KIND && b.kind === SCOPE_KIND && a.issuer === b.issuer && a.id === b.id &&
  IDENTIFIER(a.issuer) && IDENTIFIER(a.id);
function need(condition, code) { if (!condition) fail(code); }

// Deterministic input binding. This is an integrity hash, NOT an amount/semantic policy.
function normalizeJson(value, depth = 0, seen = new WeakSet()) {
  need(depth <= 12, 'invalid_mcp_input');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    need(Number.isFinite(value) && !Object.is(value, -0), 'invalid_mcp_input');
    return value;
  }
  need(value && typeof value === 'object' && !seen.has(value), 'invalid_mcp_input');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    need(value.length <= 512 && Object.keys(value).length === value.length, 'invalid_mcp_input');
    result = value.map(x => normalizeJson(x, depth + 1, seen));
  } else {
    need(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null,
      'invalid_mcp_input');
    const keys = Object.keys(value).sort();
    need(keys.length <= 512 && !keys.some(k => ['__proto__','constructor','prototype'].includes(k)),
      'invalid_mcp_input');
    result = Object.create(null);
    for (const key of keys) result[key] = normalizeJson(value[key], depth + 1, seen);
  }
  seen.delete(value);
  return result;
}
function deepFreeze(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(deepFreeze); Object.freeze(v); }
  return v;
}
function encodeInput(input) {
  const canonical = JSON.stringify(normalizeJson(input));
  need(canonical && Buffer.byteLength(canonical) <= 65536, 'mcp_input_too_large');
  return { input:deepFreeze(JSON.parse(canonical)),
    digest:crypto.createHash('sha256').update(canonical,'utf8').digest('hex') };
}
function jwtPart(part) {
  need(typeof part === 'string' && /^[A-Za-z0-9_-]+$/.test(part), 'invalid_bounded_permit');
  try { return JSON.parse(Buffer.from(part,'base64url').toString('utf8')); }
  catch { return fail('invalid_bounded_permit'); }
}
function identicalKeys(value, keys) {
  return Boolean(allowed(value, keys) && keys.every(key => Object.hasOwn(value,key)) &&
    Object.keys(value).length === keys.length);
}
function verifyPermit(jwt, trust, expected, nowMs, maxLeaseSec) {
  need(typeof jwt === 'string' && jwt.length < 10000, 'bounded_permit_required');
  const parts = jwt.split('.');
  need(parts.length === 3, 'invalid_bounded_permit');
  const head = jwtPart(parts[0]);
  const payload = jwtPart(parts[1]);
  need(identicalKeys(head,['alg','typ','kid']) && head.alg==='ES256' &&
    head.typ===BOUNDED_WORK_PERMIT_TYP && head.kid===trust.publicJwk.kid,
    'untrusted_bounded_permit_header');
  need(trust.publicJwk?.kty==='EC' && trust.publicJwk?.crv==='P-256' &&
    trust.publicJwk?.alg==='ES256' && IDENTIFIER(trust.publicJwk?.kid),
    'invalid_pinned_gate_key');
  let key;
  try { key=crypto.createPublicKey({key:trust.publicJwk,format:'jwk'}); }
  catch { return fail('invalid_pinned_gate_key'); }
  need(crypto.verify('sha256',Buffer.from(`${parts[0]}.${parts[1]}`),
    {key,dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')),
  'invalid_bounded_permit_signature');
  need(identicalKeys(payload,['iss','aud','jti','project_id','principal','actor',
    'authority_context','action','input_sha256','decision','authority','accepted_seq',
    'iat','exp','checkpoint_not_after_ms']), 'unsupported_bounded_permit_claim');
  need(payload.iss===trust.issuer && payload.aud===trust.audience &&
    payload.project_id===trust.projectId && payload.principal===expected.principal &&
    payload.actor===expected.actor && sameScope(payload.authority_context,expected.authorityContext),
    'bounded_permit_binding_mismatch');
  need(payload.decision==='ALLOW' && payload.authority==='VALID' &&
    Number.isSafeInteger(payload.accepted_seq) && payload.accepted_seq>0 &&
    IDENTIFIER(payload.jti), 'invalid_bounded_permit_decision');
  need(identicalKeys(payload.action,['protocol','name','resource']) &&
    payload.action.protocol==='mcp' && payload.action.name===expected.action.name &&
    payload.action.resource===expected.action.resource &&
    payload.input_sha256===expected.inputSha256,
    'bounded_permit_action_mismatch');
  need(Number.isSafeInteger(payload.iat) && Number.isSafeInteger(payload.exp) &&
    Number.isSafeInteger(payload.checkpoint_not_after_ms), 'invalid_bounded_permit_clock');
  const nowSec=Math.floor(nowMs/1000);
  need(payload.iat<=nowSec && payload.exp>nowSec && payload.exp>payload.iat &&
    payload.exp-payload.iat<=maxLeaseSec && nowSec-payload.iat<=maxLeaseSec &&
    payload.checkpoint_not_after_ms>nowMs &&
    payload.checkpoint_not_after_ms<=payload.iat*1000+30_000 &&
    payload.exp*1000<=payload.checkpoint_not_after_ms,
    'bounded_permit_expired_or_stale');
  return payload;
}

export class BoundedWorkEffectDenied extends Error {
  constructor(reason) {
    super(reason);
    this.name='BoundedWorkEffectDenied';
    this.code='GATE_BOUNDED_WORK_EFFECT_DENIED';
    this.decision='DENY';
    this.authority='UNKNOWN';
  }
}

/**
 * An opt-in preview integration for a trusted MCP tool handler.
 * No network URL can be implicitly upgraded to this contract: authorize MUST
 * obtain a GATE-issued, ES256-signed, exact-work/exact-action permit, and
 * consumePermit MUST atomically prevent its replay in a shared durable store.
 * No endpoint currently issues these permits in production. A local mock signer
 * is permitted for QA only. This DOES NOT close the DB-to-EXTERNAL-effect
 * revocation race; external effect owners must enforce at their own boundary.
 */
export function createBoundedWorkMcpEffectGuard({
  trust, trustedPrincipal, trustedActor, trustedAuthorityContext,
  authorize, consumePermit, clock = () => Date.now(), maxPermitLeaseSec = 5
} = {}) {
  need(trust && IDENTIFIER(trust.projectId) && IDENTIFIER(trust.issuer) &&
    IDENTIFIER(trust.audience) && trust.publicJwk, 'trusted_gate_verifier_required');
  need(IDENTIFIER(trustedPrincipal) && IDENTIFIER(trustedActor) &&
    trustedPrincipal !== trustedActor && sameScope(trustedAuthorityContext,trustedAuthorityContext),
    'trusted_bounded_work_context_required');
  need(typeof authorize==='function' && typeof consumePermit==='function',
    'trusted_authorize_and_durable_consume_required');
  need(Number.isSafeInteger(maxPermitLeaseSec) && maxPermitLeaseSec>=1 && maxPermitLeaseSec<=5,
    'invalid_permit_lease_policy');
  const pinned = {projectId:trust.projectId,issuer:trust.issuer,audience:trust.audience,
    publicJwk:structuredClone(trust.publicJwk)};
  const pinnedScope=deepFreeze(structuredClone(trustedAuthorityContext));
  return {
    async enforceToolCall({toolName,resource,input={}}={},effect) {
      need(typeof effect==='function','trusted_effect_required');
      let exactInput, request, permit;
      try {
        need(IDENTIFIER(toolName) && IDENTIFIER(resource) && toolName!=='*' &&
          resource!=='*', 'bounded_effect_action_required');
        const normalized=encodeInput(input);
        exactInput=normalized.input;
        const digest=normalized.digest;
        const action=deepFreeze({protocol:'mcp',name:`tools/call:${toolName}`,resource});
        request=deepFreeze({principal:trustedPrincipal,actor:trustedActor,
          authorityContext:pinnedScope,action,inputSha256:digest});
        const result=await authorize(request);
        // Neither legacy graph ALLOW nor a client-provided workState is acceptable.
        permit=verifyPermit(result?.permitJwt,pinned,request,clock(),maxPermitLeaseSec);
        const consumed=await consumePermit({
          jti:permit.jti,projectId:pinned.projectId,scope:pinnedScope,
          action,inputSha256:digest,expiresAtMs:permit.exp*1000
        });
        need(consumed===true || consumed?.consumed===true,'bounded_permit_replay_or_consume_failed');
        need(clock()<permit.exp*1000 && clock()<permit.checkpoint_not_after_ms,
          'bounded_permit_expired_before_effect');
      } catch(e) {
        if (e instanceof BoundedWorkEffectDenied) throw e;
        throw new BoundedWorkEffectDenied('bounded_work_effect_not_authorized');
      }
      // Effect errors must NOT be disguised as GATE DENY: the effect may already
      // have mutated the destination. Replay has already been consumed.
      const output=await effect(exactInput,request);
      return {result:output,decision:{authority:'VALID',decision:'ALLOW',
        source:'signed-bounded-work-preview',acceptedSeq:permit.accepted_seq}};
    }
  };
}
