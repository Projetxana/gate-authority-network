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

