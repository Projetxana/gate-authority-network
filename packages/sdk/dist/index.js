export const GATE_SDK_VERSION = '0.1.0-dev.4';
export const GATE_SANDBOX_URL = 'https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-sandbox';

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
      catch { throw new Error(`gate_invalid_json:${response.status}`); }
      if (!response.ok) throw new Error(result?.error || `gate_http_${response.status}`);
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
