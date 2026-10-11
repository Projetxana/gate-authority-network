function normalizeSourceEvidence(sourceFreshness = []) {
  return sourceFreshness.map(item => ({
    source: item?.source ?? null,
    checkpointSeq: item?.checkpointSeq ?? item?.lastSeq ?? null,
    acceptedSeq: item?.acceptedSeq ?? null,
    lastTs: item?.lastTs ?? null,
    notAfterMs: item?.notAfterMs ?? null,
    checkpointAgeMs: item?.checkpointAgeMs ?? null,
    method: item?.method ?? null,
    state: item?.state ?? item?.freshness ?? 'UNKNOWN',
    reason: item?.reason ?? null
  }));
}

function collectDecisionSources(decision) {
  const fromPaths = [];
  for (const path of decision?.paths ?? []) {
    for (const check of path?.checks ?? []) {
      if (check?.sourceFreshness) fromPaths.push(check.sourceFreshness);
    }
  }
  const source = fromPaths.length ? fromPaths : (decision?.sourceFreshness ?? []);
  const normalized = normalizeSourceEvidence(source);
  const seen = new Set();
  const out = [];
  for (const item of normalized) {
    const key = item.source ?? `unknown:${out.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function buildAuthorityReceipt(decision, {
  replicaFreshness = null,
  sequenceContinuityVerified = false,
  receiptVersion = 'gate.authority-receipt.v2'
} = {}) {
  const sources = collectDecisionSources(decision);
  const signedSourceEvidence = sources.length > 0 && sources.every(item =>
    typeof item.method === 'string' && item.method.toLowerCase().includes('signed')
  );

  return {
    version: receiptVersion,
    authority: decision?.authority ?? 'UNKNOWN',
    decision: decision?.decision ?? 'DENY',
    reason: decision?.reason ?? null,
    principal: decision?.principal ?? null,
    actor: decision?.actor ?? null,
    selectedPath: decision?.selectedPath ?? null,
    selectedEdges: decision?.selectedEdges ?? null,
    validPathCount: Number(decision?.validPathCount ?? 0),
    evaluatedPathCount: Number(decision?.evaluatedPathCount ?? 0),
    freshness: {
      gateReplica: replicaFreshness,
      sources
    },
    evidence: {
      issuerCurrentStateIncluded: false,
      signedSourceEvidence,
      sequenceContinuityVerified: Boolean(sequenceContinuityVerified),
      hardExpiryEnforced: true
    }
  };
}
