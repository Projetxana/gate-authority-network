export function readBearerToken(header) {
  if (typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function createUsageReporter({
  endpoint,
  clientVersion = 'gate-edge-dev',
  timeoutMs = 750,
  fetchImpl = globalThis.fetch
} = {}) {
  const base = typeof endpoint === 'string' ? endpoint.replace(/\/$/, '') : null;
  const enabled = Boolean(base && typeof fetchImpl === 'function');

  return {
    enabled,

    async report({
      apiKey,
      decision,
      authority,
      consistency,
      latencyMs,
      source = 'api',
      errorCode
    } = {}) {
      if (!enabled) return { sent: false, reason: 'disabled' };
      if (!apiKey) return { sent: false, reason: 'missing_api_key' };

      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error('gate_metrics_timeout')),
        timeoutMs
      );

      const payload = {
        source,
        client_version: clientVersion,
        consistency: consistency ?? null,
        decision: decision ?? 'ERROR',
        authority: authority ?? null,
        latency_ms: Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null,
        error_code: errorCode ?? null
      };

      try {
        const response = await fetchImpl(`${base}/events`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (!response.ok) {
          return {
            sent: false,
            reason: `telemetry_http_${response.status}`
          };
        }

        return { sent: true };
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
