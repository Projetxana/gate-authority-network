import { randomUUID } from 'node:crypto';
import { GateDeniedError } from '@gate-avn/sdk';

export function createVerifiedEffectCounter({
  idFactory = () => `gv_${randomUUID().replaceAll('-', '')}`,
  now = () => new Date().toISOString()
} = {}) {
  const events = [];

  return {
    record({
      protocol = 'mcp',
      operation,
      authority,
      decision,
      receiptVersion = null,
      consistency = null,
      servedBy = null,
      region = null
    }) {
      if (!operation) throw new TypeError('operation is required');

      const event = {
        event: 'gate.verified_effect',
        verificationId: idFactory(),
        occurredAt: now(),
        protocol,
        operation,
        authority: authority ?? null,
        decision,
        receiptVersion,
        consistency,
        servedBy,
        region
      };

      events.push(event);
      return event;
    },

    snapshot() {
      const allow = events.filter(event => event.decision === 'ALLOW').length;
      const deny = events.filter(event => event.decision === 'DENY').length;
      const unknown = events.filter(event => event.authority === 'UNKNOWN').length;
      const invalid = events.filter(event => event.authority === 'INVALID').length;

      return {
        metric: 'verified_effects',
        total: events.length,
        allow,
        deny,
        unknown,
        invalid,
        events: events.map(event => ({ ...event }))
      };
    }
  };
}

export function createMcpEffectGuard({
  gate,
  principal,
  actor,
  consistency = 'strict',
  maxStalenessMs,
  counter = createVerifiedEffectCounter(),
  reporter = null
} = {}) {
  if (!gate || typeof gate.verify !== 'function') {
    throw new TypeError('gate.verify is required');
  }

  return {
    counter,

    async enforceToolCall({
      toolName,
      principal: requestPrincipal,
      actor: requestActor,
      resource,
      parameters,
      consistency: requestConsistency,
      maxStalenessMs: requestMaxStalenessMs
    } = {}, effect) {
      if (!toolName) throw new TypeError('toolName is required');
      if (typeof effect !== 'function') throw new TypeError('effect must be a function');

      // A tool caller must not replace identities pinned by the trusted tool server.
      const trustedPrincipal = typeof principal === 'function' ? await principal() : principal;
      const trustedActor = typeof actor === 'function' ? await actor() : actor;
      const denyUntrustedOverride = reason => {
        throw new GateDeniedError({authority: 'UNKNOWN', decision: 'DENY', reason});
      };
      // A configured trusted identity resolver must never fall back to a
      // caller-supplied value, including if it returns undefined/null/blank.
      if (principal !== undefined &&
          (typeof trustedPrincipal !== 'string' || !trustedPrincipal.trim())) {
        denyUntrustedOverride('trusted_principal_unavailable');
      }
      if (actor !== undefined &&
          (typeof trustedActor !== 'string' || !trustedActor.trim())) {
        denyUntrustedOverride('trusted_actor_unavailable');
      }
      if (trustedPrincipal && requestPrincipal !== undefined && requestPrincipal !== trustedPrincipal) {
        denyUntrustedOverride('principal_override_rejected');
      }
      if (trustedActor && requestActor !== undefined && requestActor !== trustedActor) {
        denyUntrustedOverride('actor_override_rejected');
      }
      // Only a server handler that has independently validated caller identity
      // should use the unconfigured, request-supplied identity path.
      const resolvedPrincipal = principal === undefined ? requestPrincipal : trustedPrincipal;
      const resolvedActor = actor === undefined ? requestActor : trustedActor;

      if (typeof resolvedPrincipal !== 'string' || !resolvedPrincipal.trim()) {
        throw new TypeError('principal is required');
      }
      if (typeof resolvedActor !== 'string' || !resolvedActor.trim()) {
        throw new TypeError('actor is required');
      }

      const effectiveConsistency = requestConsistency ?? consistency;
      if (!['bounded', 'strict'].includes(effectiveConsistency)) throw new TypeError('unsupported consistency');
      if (consistency === 'strict' && effectiveConsistency !== 'strict') {
        denyUntrustedOverride('strict_consistency_downgrade_rejected');
      }
      // Per-call requests may tighten, never relax, the trusted freshness budget.
      const effectiveMaxStaleness = Number.isFinite(maxStalenessMs)
        ? (Number.isFinite(requestMaxStalenessMs)
          ? Math.min(maxStalenessMs, requestMaxStalenessMs)
          : maxStalenessMs)
        : requestMaxStalenessMs;

      const action = {
        protocol: 'mcp',
        name: `tools/call:${toolName}`,
        ...(resource ? { resource } : {}),
        ...(parameters ? { parameters } : {})
      };

      const request = {
        principal: resolvedPrincipal,
        actor: resolvedActor,
        action,
        consistency: effectiveConsistency,
        ...(Number.isFinite(effectiveMaxStaleness)
          ? { maxStalenessMs: effectiveMaxStaleness }
          : {})
      };

      const rawDecision = await gate.verify(request);
      // Permit only an explicit, internally consistent VALID / ALLOW.
      // This also guards any caller-supplied GateClient or test adapter.
      const decisionResult = rawDecision?.decision === 'ALLOW' && rawDecision?.authority === 'VALID'
        ? rawDecision
        : rawDecision?.decision === 'DENY'
          ? rawDecision
          : {authority: 'UNKNOWN', decision: 'DENY', reason: 'malformed_or_contradictory_gate_result'};

      const verifiedEffect = counter.record({
        protocol: 'mcp',
        operation: action.name,
        authority: decisionResult.authority,
        decision: decisionResult.decision,
        receiptVersion: decisionResult.receipt?.version ?? null,
        consistency: effectiveConsistency,
        servedBy: decisionResult.servedBy ?? null,
        region: decisionResult.region ?? null
      });

      const networkMetering =
        reporter && typeof reporter.report === 'function'
          ? await reporter.report(verifiedEffect)
          : null;

      if (decisionResult.decision !== 'ALLOW') {
        const error = new GateDeniedError(decisionResult);
        error.verifiedEffect = verifiedEffect;
        error.networkMetering = networkMetering;
        throw error;
      }

      const result = await effect(decisionResult, verifiedEffect);

      return {
        decision: decisionResult,
        verifiedEffect,
        networkMetering,
        result
      };
    }
  };
}
