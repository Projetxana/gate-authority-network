import { randomUUID } from 'node:crypto';
import { GateDeniedError } from '@gate-avn/sdk';

function requiredText(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
}

export function createHttpEffectGuard({
  gate,
  principal,
  actor,
  consistency = 'strict',
  maxStalenessMs,
  reporter = null,
  idFactory = () => `gv_${randomUUID().replaceAll('-', '')}`,
  now = () => new Date().toISOString()
} = {}) {
  if (!gate || typeof gate.verify !== 'function') {
    throw new TypeError('gate.verify is required');
  }

  return {
    async enforce({
      operation,
      resource,
      parameters,
      principal: requestPrincipal,
      actor: requestActor,
      consistency: requestConsistency,
      maxStalenessMs: requestMaxStalenessMs
    } = {}, effect) {
      if (typeof effect !== 'function') {
        throw new TypeError('effect must be a function');
      }

      const normalizedOperation = requiredText(operation, 'operation');
      const resolvedPrincipal =
        requestPrincipal ??
        (typeof principal === 'function' ? await principal() : principal);
      const resolvedActor =
        requestActor ??
        (typeof actor === 'function' ? await actor() : actor);

      requiredText(resolvedPrincipal, 'principal');
      requiredText(resolvedActor, 'actor');

      const effectiveConsistency = requestConsistency ?? consistency;
      const effectiveMaxStaleness =
        requestMaxStalenessMs ?? maxStalenessMs;

      const action = {
        protocol: 'http',
        name: normalizedOperation,
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

      const verifiedEffect = {
        event: 'gate.verified_effect',
        verificationId: idFactory(),
        occurredAt: now(),
        protocol: 'http',
        operation: normalizedOperation,
        authority: decisionResult.authority ?? null,
        decision: decisionResult.decision,
        receiptVersion: decisionResult.receipt?.version ?? null,
        consistency: effectiveConsistency,
        servedBy: decisionResult.servedBy ?? null,
        region: decisionResult.region ?? null
      };

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
