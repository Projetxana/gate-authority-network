import { verifyLiveAuthority } from './verify-live-authority.mjs';

// Stage 18 local kernel ONLY. The caller must supply workState and edges from a
// trusted source. No issuer signature, tenancy, or canonical store is verified here.
const KINDS = new Set(['oauth-bounded-work']);

function normalizedScope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { kind, issuer, id } = value;
  if (!KINDS.has(kind)) return null;
  for (const field of [issuer, id]) {
    if (typeof field !== 'string' || !field || field.length > 256 || field !== field.trim() || /[\u0000-\u001f\u007f]/u.test(field)) return null;
  }
  return { kind, issuer, id };
}

function sameScope(candidate, expected) {
  const normalized = normalizedScope(candidate);
  return Boolean(normalized && expected && normalized.kind === expected.kind &&
    normalized.issuer === expected.issuer && normalized.id === expected.id);
}

function denied(authority, reason, scope, principal, actor) {
  return {
    authority,
    decision: 'DENY',
    reason,
    principal,
    actor,
    authorityContext: scope,
    selectedEdges: null,
    validPathCount: 0,
    evaluatedPathCount: 0,
    workScopeEvidence: {
      origin: 'local-fixture-only',
      independentIssuerAttestationVerified: false
    }
  };
}

/**
 * Experimental, local-only verifier kernel. `workState` and `edges` MUST already
 * have been independently authenticated and project-isolated by a future trusted
 * ingestion layer. The public hosted API does not call this function yet.
 *
 * Work-scoped delegation-path revocation is distinct from revocation of the
 * governing work authorization itself. Work-level REVOKED always wins.
 */
export function verifyBoundedWorkAuthority({
  principal,
  actor,
  authorityContext,
  workState,
  edges = [],
  sourceStates = null,
  requireFreshSources = false,
  nowMs = Date.now()
} = {}) {
  const requested = normalizedScope(authorityContext);
  if (!requested) return denied('UNKNOWN', 'governing_work_context_invalid', null, principal, actor);
  if (principal === actor) return denied('UNKNOWN', 'governing_work_requires_explicit_delegation', requested, principal, actor);
  if (!principal || !actor) return denied('UNKNOWN', 'missing_principal_or_actor', requested, principal, actor);

  // Treat these as *trusted inputs* only inside the controlled fixture. Never
  // accept workState or edge scope directly from a public verification request.
  if (!workState || !sameScope(workState.authorityContext, requested)) {
    return denied('UNKNOWN', 'governing_work_state_unavailable', requested, principal, actor);
  }
  if (workState.status === 'REVOKED') {
    return denied('INVALID', 'governing_work_revoked', requested, principal, actor);
  }
  if (workState.status !== 'ACTIVE') {
    return denied('UNKNOWN', 'governing_work_state_unknown', requested, principal, actor);
  }
  if (workState.evidenceState !== 'FRESH') {
    return denied('UNKNOWN', 'governing_work_evidence_stale_or_unknown', requested, principal, actor);
  }
  const expires = Date.parse(workState.validUntil);
  if (!Number.isFinite(expires)) {
    return denied('UNKNOWN', 'governing_work_expiry_unverifiable', requested, principal, actor);
  }
  if (nowMs >= expires) {
    return denied('INVALID', 'governing_work_expired', requested, principal, actor);
  }

  const scopedEdges = edges.filter(edge => sameScope(edge.authorityContext, requested));
  if (!scopedEdges.length) {
    return denied('UNKNOWN', 'governing_work_delegation_not_observed', requested, principal, actor);
  }

  const result = verifyLiveAuthority({
    principal, actor, edges: scopedEdges, sourceStates, requireFreshSources, nowMs
  });

  return {
    ...result,
    authorityContext: requested,
    workScopeEvidence: {
      origin: 'local-fixture-only',
      independentIssuerAttestationVerified: false
    }
  };
}
