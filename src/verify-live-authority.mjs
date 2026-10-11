import { evaluateEdgeSourceFreshness, summarizeSourceFreshness } from './source-freshness.mjs';
import { buildAuthorityReceipt } from './authority-receipt.mjs';


function finalize(result, { requireFreshSources = false } = {}) {
  return {
    ...result,
    receipt: buildAuthorityReceipt(result, {
      sequenceContinuityVerified: requireFreshSources
    })
  };
}

function parseTimeMs(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function verifyLiveAuthority({
  principal,
  actor,
  edges,
  maxDepth = 12,
  sourceStates = null,
  requireFreshSources = false,
  nowMs = Date.now()
}) {
  if (!principal || !actor) return finalize({ authority: 'INVALID', decision: 'DENY', reason: 'missing_principal_or_actor', principal, actor, sourceFreshness: [], evaluatedPathCount: 0 }, { requireFreshSources });
  if (principal === actor) {
    return finalize({
      authority: 'VALID',
      decision: 'ALLOW',
      principal,
      actor,
      selectedPath: [principal],
      validPathCount: 1,
      evaluatedPathCount: 1,
      freshnessLane: requireFreshSources ? 'issuer-derived' : 'graph-only',
      sourceFreshness: [],
      paths: [{ status: 'VALID', nodePath: [principal], edgeIds: [], checks: [] }]
    }, { requireFreshSources });
  }

  const outgoing = new Map();
  for (const edge of edges ?? []) {
    if (!outgoing.has(edge.issuer)) outgoing.set(edge.issuer, []);
    outgoing.get(edge.issuer).push(edge);
  }

  const candidates = [];
  const queue = [{ node: principal, nodePath: [principal], edgePath: [], visited: new Set([principal]) }];
  while (queue.length) {
    const current = queue.shift();
    if (current.edgePath.length >= maxDepth) continue;
    for (const edge of outgoing.get(current.node) ?? []) {
      if (current.visited.has(edge.subject)) continue;
      const nodePath = [...current.nodePath, edge.subject];
      const edgePath = [...current.edgePath, edge];
      if (edge.subject === actor) {
        candidates.push({ nodePath, edgePath });
        continue;
      }
      const visited = new Set(current.visited);
      visited.add(edge.subject);
      queue.push({ node: edge.subject, nodePath, edgePath, visited });
    }
  }

  if (!candidates.length) {
    return finalize({
      authority: 'INVALID',
      decision: 'DENY',
      reason: 'no_authority_path',
      principal,
      actor,
      evaluatedPathCount: 0,
      freshnessLane: requireFreshSources ? 'issuer-derived' : 'graph-only',
      sourceFreshness: [],
      paths: []
    }, { requireFreshSources });
  }

  const evaluated = candidates.map(({ nodePath, edgePath }) => {
    const checks = edgePath.map(edge => {
      const validUntil = edge.validUntil ?? edge.valid_until ?? null;
      const validUntilMs = parseTimeMs(validUntil);
      const hardExpired = validUntilMs != null && nowMs >= validUntilMs;
      const sourceFreshness = requireFreshSources
        ? evaluateEdgeSourceFreshness(edge, sourceStates, { nowMs })
        : null;
      return {
        edgeId: edge.edgeId,
        issuer: edge.issuer,
        subject: edge.subject,
        authorityStatus: edge.status,
        revokedAt: edge.revokedAt ?? null,
        validUntil,
        hardExpired,
        reason: edge.reason ?? null,
        sourceFreshness
      };
    });

    if (checks.some(check => check.authorityStatus === 'REVOKED')) {
      return { status: 'INVALID', reason: 'upstream_authority_revoked', nodePath, edgeIds: edgePath.map(e => e.edgeId), checks };
    }
    if (checks.some(check => check.hardExpired)) {
      return { status: 'INVALID', reason: 'delegation_hard_expired', nodePath, edgeIds: edgePath.map(e => e.edgeId), checks };
    }
    if (checks.some(check => check.authorityStatus === 'UNKNOWN')) {
      return { status: 'UNKNOWN', reason: 'authority_status_unknown', nodePath, edgeIds: edgePath.map(e => e.edgeId), checks };
    }
    if (checks.some(check => check.authorityStatus !== 'ACTIVE')) {
      return { status: 'UNKNOWN', reason: 'unsupported_authority_status', nodePath, edgeIds: edgePath.map(e => e.edgeId), checks };
    }
    if (requireFreshSources && checks.some(check => check.sourceFreshness?.freshness !== 'FRESH')) {
      return { status: 'UNKNOWN', reason: 'source_authority_freshness_not_met', nodePath, edgeIds: edgePath.map(e => e.edgeId), checks };
    }
    return { status: 'VALID', reason: null, nodePath, edgeIds: edgePath.map(e => e.edgeId), checks };
  });

  const valid = evaluated.find(path => path.status === 'VALID');
  if (valid) {
    return finalize({
      authority: 'VALID',
      decision: 'ALLOW',
      principal,
      actor,
      selectedPath: valid.nodePath,
      selectedEdges: valid.edgeIds,
      validPathCount: evaluated.filter(path => path.status === 'VALID').length,
      evaluatedPathCount: evaluated.length,
      freshnessLane: requireFreshSources ? 'issuer-derived' : 'graph-only',
      sourceFreshness: summarizeSourceFreshness(valid.checks),
      paths: evaluated
    }, { requireFreshSources });
  }

  const allChecks = evaluated.flatMap(path => path.checks ?? []);
  if (evaluated.some(path => path.status === 'UNKNOWN')) {
    return finalize({
      authority: 'UNKNOWN',
      decision: 'DENY',
      reason: 'no_active_path_and_authority_state_unknown',
      principal,
      actor,
      evaluatedPathCount: evaluated.length,
      freshnessLane: requireFreshSources ? 'issuer-derived' : 'graph-only',
      sourceFreshness: summarizeSourceFreshness(allChecks),
      paths: evaluated
    }, { requireFreshSources });
  }

  return finalize({
    authority: 'INVALID',
    decision: 'DENY',
    reason: 'all_authority_paths_revoked_or_invalid',
    principal,
    actor,
    evaluatedPathCount: evaluated.length,
    freshnessLane: requireFreshSources ? 'issuer-derived' : 'graph-only',
    sourceFreshness: summarizeSourceFreshness(allChecks),
    paths: evaluated
  }, { requireFreshSources });
}
