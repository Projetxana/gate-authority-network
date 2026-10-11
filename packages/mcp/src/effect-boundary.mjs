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

      const resolvedPrincipal =
        requestPrincipal ?? (typeof principal === 'function' ? await principal() : principal);
      const resolvedActor =
        requestActor ?? (typeof actor === 'function' ? await actor() : actor);

      if (!resolvedPrincipal) throw new TypeError('principal is required');
      if (!resolvedActor) throw new TypeError('actor is required');

      const effectiveConsistency = requestConsistency ?? consistency;
      const effectiveMaxStaleness = requestMaxStalenessMs ?? maxStalenessMs;

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

      const decisionResult = await gate.verify(request);

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
