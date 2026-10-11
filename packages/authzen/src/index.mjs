import { randomUUID } from 'node:crypto';
import { GateDeniedError } from '@gate-avn/sdk';

function requiredText(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
}

async function resolve(value, context) {
  return typeof value === 'function' ? await value(context) : value;
}

function normalizeResource(resource) {
  if (!resource || typeof resource !== 'object') return null;
  const type = typeof resource.type === 'string' ? resource.type.trim() : '';
  const id = typeof resource.id === 'string' ? resource.id.trim() : '';
  if (type && id) return `${type}:${id}`;
  if (type) return type;
  return null;
}

export function createAuthZenEffectGuard({
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
      evaluationRequest,
      evaluationResponse
    } = {}, effect) {
      if (typeof effect !== 'function') {
        throw new TypeError('effect must be a function');
      }

      const subject = evaluationRequest?.subject;
      const action = evaluationRequest?.action;
      const resource = evaluationRequest?.resource;

      requiredText(subject?.type, 'evaluationRequest.subject.type');
      requiredText(subject?.id, 'evaluationRequest.subject.id');
      const actionName = requiredText(
        action?.name,
        'evaluationRequest.action.name'
      );
      requiredText(resource?.type, 'evaluationRequest.resource.type');
      requiredText(resource?.id, 'evaluationRequest.resource.id');

      if (typeof evaluationResponse?.decision !== 'boolean') {
        throw new TypeError('evaluationResponse.decision must be boolean');
      }

      // AuthZEN PDP denial is authoritative for policy. GATE is not called
      // because the PEP will not execute the effect.
      if (evaluationResponse.decision !== true) {
        return {
          allowed: false,
          policyDecision: evaluationResponse,
          gateEvaluated: false,
          decision: null,
          verifiedEffect: null,
          networkMetering: null,
          result: null
        };
      }

      const context = {
        evaluationRequest,
        evaluationResponse
      };

      const resolvedPrincipal = await resolve(principal, context);
      const resolvedActor = await resolve(actor, context);

      requiredText(resolvedPrincipal, 'principal');
      requiredText(resolvedActor, 'actor');

      const decision = await gate.verify({
        principal: resolvedPrincipal,
        actor: resolvedActor,
        action: {
          protocol: 'authzen',
          name: actionName,
          resource: normalizeResource(resource),
          parameters: {
            subjectType: subject.type,
            resourceType: resource.type
          }
        },
        consistency,
        ...(Number.isFinite(maxStalenessMs)
          ? { maxStalenessMs }
          : {})
      });

      const verifiedEffect = {
        event: 'gate.verified_effect',
        verificationId: idFactory(),
        occurredAt: now(),
        protocol: 'authzen',
        operation: actionName,
        authority: decision.authority ?? null,
        decision: decision.decision,
        receiptVersion: decision.receipt?.version ?? null,
        consistency,
        servedBy: decision.servedBy ?? null,
        region: decision.region ?? null
      };

      const networkMetering =
        reporter && typeof reporter.report === 'function'
          ? await reporter.report(verifiedEffect)
          : null;

      if (decision.decision !== 'ALLOW') {
        const error = new GateDeniedError(decision);
        error.authzenDecision = evaluationResponse;
        error.verifiedEffect = verifiedEffect;
        error.networkMetering = networkMetering;
        throw error;
      }

      const result = await effect(decision, verifiedEffect);

      return {
        allowed: true,
        policyDecision: evaluationResponse,
        gateEvaluated: true,
        decision,
        verifiedEffect,
        networkMetering,
        result
      };
    }
  };
}
