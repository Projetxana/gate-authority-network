export function verifyLiveAuthority({ principal, actor, edges, maxDepth = 12 }) {
  if (!principal || !actor) return { authority: 'INVALID', decision: 'DENY', reason: 'missing_principal_or_actor' };
  if (principal === actor) {
    return { authority: 'VALID', decision: 'ALLOW', principal, actor, selectedPath: [principal], validPathCount: 1, evaluatedPathCount: 1, paths: [{ status: 'VALID', nodePath: [principal], edgeIds: [], checks: [] }] };
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

  if (!candidates.length) return { authority: 'INVALID', decision: 'DENY', reason: 'no_authority_path', principal, actor, evaluatedPathCount: 0, paths: [] };

  const evaluated = candidates.map(({ nodePath, edgePath }) => {
    const checks = edgePath.map(edge => ({ edgeId: edge.edgeId, issuer: edge.issuer, subject: edge.subject, authorityStatus: edge.status, revokedAt: edge.revokedAt ?? null, reason: edge.reason ?? null }));
    if (edgePath.some(edge => edge.status === 'UNKNOWN')) return { status: 'UNKNOWN', reason: 'authority_status_unknown', nodePath, edgeIds: edgePath.map(e => e.edgeId), checks };
    if (edgePath.some(edge => edge.status === 'REVOKED')) return { status: 'INVALID', reason: 'upstream_authority_revoked', nodePath, edgeIds: edgePath.map(e => e.edgeId), checks };
    if (edgePath.some(edge => edge.status !== 'ACTIVE')) return { status: 'UNKNOWN', reason: 'unsupported_authority_status', nodePath, edgeIds: edgePath.map(e => e.edgeId), checks };
    return { status: 'VALID', reason: null, nodePath, edgeIds: edgePath.map(e => e.edgeId), checks };
  });

  const valid = evaluated.find(path => path.status === 'VALID');
  if (valid) return { authority: 'VALID', decision: 'ALLOW', principal, actor, selectedPath: valid.nodePath, selectedEdges: valid.edgeIds, validPathCount: evaluated.filter(path => path.status === 'VALID').length, evaluatedPathCount: evaluated.length, paths: evaluated };
  if (evaluated.some(path => path.status === 'UNKNOWN')) return { authority: 'UNKNOWN', decision: 'DENY', reason: 'no_active_path_and_authority_state_unknown', principal, actor, evaluatedPathCount: evaluated.length, paths: evaluated };
  return { authority: 'INVALID', decision: 'DENY', reason: 'all_authority_paths_revoked_or_invalid', principal, actor, evaluatedPathCount: evaluated.length, paths: evaluated };
}
