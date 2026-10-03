export class GateClient {
  constructor({ endpoint, apiKey, timeoutMs = 2000, fetchImpl = globalThis.fetch }) {
    if (!endpoint) throw new TypeError('endpoint is required');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
    this.endpoint = endpoint.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async verify({ principal, actor, action, consistency = 'bounded', maxStalenessMs, signal } = {}) {
    if (!principal) throw new TypeError('principal is required');
    if (!actor) throw new TypeError('actor is required');
    if (!['bounded', 'strict'].includes(consistency)) throw new TypeError('consistency must be bounded or strict');

    const controller = signal ? null : new AbortController();
    const timeout = controller ? setTimeout(() => controller.abort(new Error('gate_verify_timeout')), this.timeoutMs) : null;
    const body = { principal, actor, consistency };
    if (Number.isFinite(maxStalenessMs)) body.maxStalenessMs = maxStalenessMs;
    // GATE verifies authority, not business policy. Action is carried for correlation/audit only.
    if (action) body.action = action;

    try {
      const response = await this.fetch(`${this.endpoint}/v1/authority/verify`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
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
}

export function createGateClient(options) { return new GateClient(options); }
