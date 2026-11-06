export const GATE_SDK_VERSION = '0.1.0-dev.4';
export const GATE_SANDBOX_URL = 'https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-sandbox';

// Closed vocabulary: never copy arbitrary error text, headers or response bodies.
const diagnosticCodes = new Set([
  'invalid_api_key', 'principal_and_actor_required', 'invalid_consistency',
  'invalid_max_staleness_ms', 'strict_consistency_not_in_plan',
  'monthly_verification_limit_reached', 'plan_entitlements_missing',
  'client_supplied_replica_snapshots_not_supported', 'invalid_region',
  'invalid_json', 'internal_error', 'authority_store_unavailable',
  'canonical_snapshot_stale', 'authority_snapshot_invalid',
  'authority_snapshot_timestamp_invalid', 'authority_snapshot_clock_skew',
  'canonical_primary_required', 'regional_replica_not_configured',
  'authority_lease_expired', 'no_authority_path',
  'all_authority_paths_revoked_or_invalid', 'authority_issuer_revoked',
  'upstream_authority_revoked'
]);

function verificationHttpError(response, result) {
  const status = response.status;
  const diagnostics = {};
  for (const key of ['error', 'reason']) {
    if (diagnosticCodes.has(result?.[key])) diagnostics[key] = result[key];
  }
  if (['VALID', 'INVALID', 'UNKNOWN'].includes(result?.authority)) diagnostics.authority = result.authority;
  if (['ALLOW', 'DENY'].includes(result?.decision)) diagnostics.decision = result.decision;
  const raw = result?.freshness;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const freshness = {};
    for (const key of ['ageMs', 'leaseRemainingMs', 'maxStalenessMs', 'snapshotAgeMs',
      'effectiveSnapshotLimitMs', 'lastEventAgeMs', 'replicaLagMs', 'externalIssuerLagMs']) {
      if (raw[key] === null && key !== 'effectiveSnapshotLimitMs') freshness[key] = null;
      else if (Number.isSafeInteger(raw[key]) && raw[key] >= 0) freshness[key] = raw[key];
    }
    for (const key of ['fresh', 'isPrimary']) if (typeof raw[key] === 'boolean') freshness[key] = raw[key];
    if (raw.snapshotAt === null) freshness.snapshotAt = null;
    else if (typeof raw.snapshotAt === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw.snapshotAt) &&
      Number.isFinite(Date.parse(raw.snapshotAt))) freshness.snapshotAt = raw.snapshotAt;
    if (['canonical-primary', 'unavailable', 'postgres-replica-unverified'].includes(raw.source)) freshness.source = raw.source;
    if (Object.keys(freshness).length) diagnostics.freshness = Object.freeze(freshness);
  }
  const error = new Error(diagnostics.error || `gate_http_${status}`);
  // Non-enumerable: callers opt into reading diagnostics; no automatic reporting.
  Object.defineProperties(error, {
    status: {value: status},
    diagnostics: {value: Object.freeze(diagnostics)}
  });
  return error;
}

export class GateDeniedError extends Error {
  constructor(decision) {
    super(decision?.reason || 'gate_authority_denied');
    this.name = 'GateDeniedError';
    this.code = 'GATE_AUTHORITY_DENIED';
    this.decision = decision;
  }
}

export class GateClient {
  constructor({ endpoint, apiKey, timeoutMs = 2000, fetchImpl = globalThis.fetch, source = 'sdk', clientVersion = GATE_SDK_VERSION }) {
    if (!endpoint) throw new TypeError('endpoint is required');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
    this.endpoint = endpoint.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
    this.source = source;
    this.clientVersion = clientVersion;
  }

  async verify({ principal, actor, action, consistency = 'bounded', maxStalenessMs, signal } = {}) {
    if (!principal) throw new TypeError('principal is required');
    if (!actor) throw new TypeError('actor is required');
    if (!['bounded', 'strict'].includes(consistency)) throw new TypeError('consistency must be bounded or strict');

    const controller = signal ? null : new AbortController();
    const timeout = controller ? setTimeout(() => controller.abort(new Error('gate_verify_timeout')), this.timeoutMs) : null;
    const body = { principal, actor, consistency };
    if (Number.isFinite(maxStalenessMs)) body.maxStalenessMs = maxStalenessMs;
    if (action) body.action = action;

    try {
      const response = await this.fetch(`${this.endpoint}/v1/authority/verify`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-gate-source': this.source,
          'x-gate-client-version': this.clientVersion,
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify(body),
        signal: signal ?? controller.signal
      });
      const text = await response.text();
      let result;
      try { result = text ? JSON.parse(text) : {}; }
      catch {
        if (!response.ok) throw verificationHttpError(response, null);
        throw new Error(`gate_invalid_json:${response.status}`);
      }
      if (!response.ok) throw verificationHttpError(response, result);
      return action ? { ...result, action } : result;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async enforce(request, effect) {
    if (typeof effect !== 'function') throw new TypeError('effect must be a function');
    const decision = await this.verify(request);
    if (decision.decision !== 'ALLOW') throw new GateDeniedError(decision);
    const result = await effect(decision);
    return { decision, result };
  }
}

export function createGateClient(options) {
  return new GateClient(options);
}

export function createSandboxClient({ apiKey, ...options } = {}) {
  return new GateClient({ ...options, endpoint: GATE_SANDBOX_URL, apiKey, source: options.source || 'sdk', clientVersion: options.clientVersion || GATE_SDK_VERSION });
}

export function createVerifiedEffectReporter({
  endpoint,
  apiKey,
  timeoutMs = 1200,
  fetchImpl = globalThis.fetch
} = {}) {
  const base =
    typeof endpoint === 'string' && endpoint.trim()
      ? endpoint.replace(/\/$/, '')
      : null;

  const enabled = Boolean(base && typeof fetchImpl === 'function');

  return {
    enabled,

    async report(event = {}) {
      if (!enabled) return { sent: false, reason: 'disabled' };
      if (!apiKey) return { sent: false, reason: 'missing_api_key' };

      const payload = {
        event: 'gate.verified_effect',
        verificationId: event.verificationId,
        protocol: event.protocol ?? 'unknown',
        operation: event.operation,
        authority: event.authority ?? null,
        decision: event.decision,
        receiptVersion: event.receiptVersion ?? null,
        consistency: event.consistency ?? null,
        servedBy: event.servedBy ?? null,
        region: event.region ?? null
      };

      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error('gate_verified_effect_timeout')),
        timeoutMs
      );

      try {
        const response = await fetchImpl(`${base}/verified-effects`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        const raw = await response.text();
        let body = null;
        try {
          body = raw ? JSON.parse(raw) : null;
        } catch {
          body = null;
        }

        if (!response.ok) {
          return {
            sent: false,
            reason: body?.error ?? `verified_effect_http_${response.status}`
          };
        }

        return {
          sent: true,
          metered: body?.metered === true,
          deduplicated: body?.deduplicated === true,
          eventId: body?.event_id ?? null,
          verificationId: body?.verification_id ?? event.verificationId
        };
      } catch (error) {
        return {
          sent: false,
          reason: error instanceof Error ? error.message : String(error)
        };
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
