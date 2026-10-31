import { verifyBoundedWorkIssuerEvidence } from './verify-bounded-work-issuer-evidence.mjs';
import { verifyBoundedWorkAuthority } from './verify-bounded-work-authority.mjs';

// Stage 18 local demonstration only. This code is NOT an authorization endpoint,
// an effect guard, a canonical state store, or a replacement for hosted GATE.
const SCOPE_KIND = 'oauth-bounded-work';
const isId = value => typeof value === 'string' && value.length > 0 &&
  value.length <= 256 && value === value.trim() &&
  !/[\u0000-\u001f\u007f]/u.test(value);
const exactKeys = (obj, allowed) => obj && typeof obj === 'object' &&
  !Array.isArray(obj) && Object.keys(obj).every(key => allowed.includes(key));
const scopeOkay = scope => exactKeys(scope, ['kind', 'issuer', 'id']) &&
  scope.kind === SCOPE_KIND && isId(scope.issuer) && isId(scope.id);
const scopeSame = (a, b) => scopeOkay(a) && scopeOkay(b) &&
  a.kind === b.kind && a.issuer === b.issuer && a.id === b.id;

function deny(reason, request, authority = 'UNKNOWN') {
  return {
    authority, decision: 'DENY', reason,
    principal: request?.principal ?? null, actor: request?.actor ?? null,
    authorityContext: scopeOkay(request?.authorityContext) ? request.authorityContext : null,
    selectedEdges: null,
    workScopeEvidence: {
      origin: 'local-signed-bridge', signedArtifactsVerified: false,
      canonicalStorageCommitted: false, hostedEnforcementVerified: false
    }
  };
}

/**
 * Tie two issuer-signed artifacts to a local scoped decision, with a mandatory
 * exact action triple. `privileged` MUST come from trusted, project-isolated
 * server state, NOT the request. For research/QA ONLY: no durable anti-replay
 * commit, no independent trust registry, no actual effect guard.
 *
 * A request/privileged split in this function does NOT, by itself, establish
 * that an application really enforced that boundary.
 */
export function verifySignedBoundedWorkLocal({
  request, privileged, eventJwt, checkpointJwt, nowMs = Date.now()
} = {}) {
  if (!request || !exactKeys(request, ['principal', 'actor', 'authorityContext', 'action']) ||
      !isId(request.principal) || !isId(request.actor)) {
    return deny('invalid_work_request', request);
  }
  if (request.principal === request.actor) {
    return deny('governing_work_requires_explicit_delegation', request);
  }
  if (!privileged || !scopeSame(request.authorityContext, privileged.expectedScope)) {
    return deny('untrusted_or_mismatched_governing_work_scope', request);
  }

  const action = request.action;
  if (!exactKeys(action, ['protocol', 'name', 'resource', 'parameters']) ||
      !isId(action.protocol) || !isId(action.name) || !isId(action.resource) ||
      !exactKeys(action.parameters ?? {}, []) ||
      ['protocol', 'name', 'resource'].some(key => action[key] === '*')) {
    // No amount, parameters, wildcard, or unconstrained resource permissions
    // are supported in this local bridge; reject rather than silently ignore.
    return deny('unsupported_or_unbounded_effect_action', request);
  }

  let admitted;
  try {
    admitted = verifyBoundedWorkIssuerEvidence({
      eventJwt, checkpointJwt,
      trust: privileged.trust,
      expectedScope: privileged.expectedScope,
      previousAcceptedSeq: privileged.previousAcceptedSeq,
      maxCheckpointLeaseMs: privileged.maxCheckpointLeaseMs,
      nowMs
    });
  } catch (_error) {
    // Errors from missing/mis-bound/stale issuer evidence mean we cannot
    // establish a current authorization. Never transform them into ALLOW.
    return deny('signed_work_evidence_unavailable_or_invalid', request);
  }

  if (admitted.governingWork.principal !== request.principal ||
      admitted.governingWork.actor !== request.actor) {
    return deny('signed_work_principal_or_actor_mismatch', request, 'INVALID');
  }

  if (!admitted.permissions.some(permission =>
    permission.protocol === action.protocol &&
    permission.name === action.name &&
    permission.resource === action.resource)) {
    return deny('effect_outside_signed_work_permissions', request, 'INVALID');
  }

  const decision = verifyBoundedWorkAuthority({
    principal: request.principal,
    actor: request.actor,
    authorityContext: privileged.expectedScope,
    workState: admitted.governingWork,
    edges: admitted.edges,
    nowMs
  });
  // The legacy graph receipt is NOT work-bound. Suppress it until a dedicated
  // signed-context receipt contract is designed and implemented end-to-end.
  const { receipt: _unscopedReceipt, ...scopedDecision } = decision;
  return {
    ...scopedDecision,
    workScopeEvidence: {
      origin: 'local-signed-bridge',
      issuer: admitted.evidence.issuer,
      projectId: admitted.projectId,
      acceptedSeq: admitted.sequence,
      checkpointSeq: admitted.evidence.checkpointSeq,
      checkpointNotAfterMs: admitted.evidence.notAfterMs,
      signedArtifactsVerified: true,
      independentIssuerCurrentStateProven: false,
      canonicalStorageCommitted: false,
      hostedEnforcementVerified: false
    }
  };
}
