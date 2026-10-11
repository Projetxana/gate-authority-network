import { randomUUID } from 'node:crypto';
import { GateDeniedError } from '@gate-avn/sdk';

function requiredText(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
}

function resourceFromRequest(request) {
  const message = request?.params?.message;
  if (!message || typeof message !== 'object') return 'a2a:request';

  if (typeof message.taskId === 'string' && message.taskId) {
    return `a2a:task:${message.taskId}`;
  }
  if (typeof message.contextId === 'string' && message.contextId) {
    return `a2a:context:${message.contextId}`;
  }
  if (typeof message.messageId === 'string' && message.messageId) {
    return `a2a:message:${message.messageId}`;
  }
  return 'a2a:message';
}

export function createA2AEffectGuard({
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
    async enforceJsonRpc(request, effect) {
      if (typeof effect !== 'function') {
        throw new TypeError('effect must be a function');
      }

      if (request?.jsonrpc !== '2.0') {
        throw new TypeError('A2A jsonrpc must be 2.0');
      }

      const method = requiredText(request?.method, 'A2A method');

      if (
        (method === 'message/send' || method === 'message/stream') &&
        (!request?.params?.message ||
          typeof request.params.message !== 'object')
      ) {
        throw new TypeError('A2A message is required');
      }

      const resolvedPrincipal =
        typeof principal === 'function'
          ? await principal(request)
          : principal;
      const resolvedActor =
        typeof actor === 'function'
          ? await actor(request)
          : actor;

      requiredText(resolvedPrincipal, 'principal');
      requiredText(resolvedActor, 'actor');

      const decision = await gate.verify({
        principal: resolvedPrincipal,
        actor: resolvedActor,
        action: {
          protocol: 'a2a',
          name: method,
          resource: resourceFromRequest(request),
          parameters: {
            transport: 'jsonrpc',
            method
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
        protocol: 'a2a',
        operation: method,
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
        error.a2aRequestId = request.id ?? null;
        error.verifiedEffect = verifiedEffect;
        error.networkMetering = networkMetering;
        throw error;
      }

      const result = await effect(decision, verifiedEffect);

      return {
        decision,
        verifiedEffect,
        networkMetering,
        result
      };
    }
  };
}

export function gateDeniedToA2AError(error, requestId = null) {
  return {
    jsonrpc: '2.0',
    id: requestId,
    error: {
      // Custom server error range permitted by JSON-RPC/A2A.
      code: -32080,
      message: 'GATE authority denied',
      data: {
        authority: error?.decision?.authority ?? 'UNKNOWN',
        reason: error?.decision?.reason ?? 'gate_authority_denied'
      }
    }
  };
}
