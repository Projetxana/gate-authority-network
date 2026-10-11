function toMs(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toSeq(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function getSourceState(sourceStates, source) {
  if (!sourceStates || !source) return null;
  if (sourceStates instanceof Map) return sourceStates.get(source) ?? null;
  if (Array.isArray(sourceStates)) return sourceStates.find(x => x?.source === source) ?? null;
  if (typeof sourceStates === 'object') return sourceStates[source] ?? null;
  return null;
}

export function evaluateSourceFreshness(state, { nowMs = Date.now() } = {}) {
  if (!state) {
    return {
      source: null,
      lastSeq: null,
      acceptedSeq: null,
      lastTs: null,
      method: null,
      notAfterMs: null,
      freshness: 'UNKNOWN',
      reason: 'source_checkpoint_missing'
    };
  }

  const lastSeq = toSeq(state.lastSeq ?? state.last_seq ?? state.issuerLastSeq);
  const acceptedSeq = toSeq(state.acceptedSeq ?? state.accepted_seq ?? state.localAcceptedSeq);
  const lastTs = state.lastTs ?? state.last_ts ?? null;
  const notAfterMs = toMs(state.notAfterMs ?? state.not_after_ms ?? state.notAfter);
  const method = state.method ?? 'unknown';
  const source = state.source ?? null;

  let freshness = 'FRESH';
  let reason = null;

  if (lastSeq == null || acceptedSeq == null || notAfterMs == null) {
    freshness = 'UNKNOWN';
    reason = 'source_checkpoint_incomplete';
  } else if (nowMs > notAfterMs) {
    freshness = 'UNKNOWN';
    reason = 'source_checkpoint_expired';
  } else if (lastSeq > acceptedSeq) {
    freshness = 'STALE';
    reason = 'source_sequence_lag';
  } else if (lastSeq < acceptedSeq) {
    freshness = 'STALE';
    reason = 'source_checkpoint_behind';
  }

  const lastTsMs = toMs(lastTs);
  return {
    source,
    lastSeq,
    acceptedSeq,
    lastTs,
    method,
    notAfterMs,
    checkpointAgeMs: lastTsMs == null ? null : Math.max(0, nowMs - lastTsMs),
    freshness,
    reason
  };
}

export function evaluateEdgeSourceFreshness(edge, sourceStates, options = {}) {
  const source = edge?.source?.transmitter ?? edge?.source?.source ?? null;
  if (!source) {
    return {
      source: null,
      lastSeq: null,
      acceptedSeq: null,
      lastTs: null,
      method: null,
      notAfterMs: null,
      freshness: 'UNKNOWN',
      reason: 'source_provenance_missing'
    };
  }
  const state = getSourceState(sourceStates, source);
  return evaluateSourceFreshness(state ? { ...state, source } : null, options);
}

export function summarizeSourceFreshness(checks = []) {
  const seen = new Set();
  const out = [];
  for (const check of checks) {
    const item = check?.sourceFreshness;
    if (!item) continue;
    const key = item.source ?? `unknown:${out.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
