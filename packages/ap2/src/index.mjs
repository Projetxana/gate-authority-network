import { randomUUID } from 'node:crypto';
import { GateDeniedError } from '@gate-avn/sdk';

const SUPPORTED_VCT = new Set([
  'mandate.checkout.1',
  'mandate.checkout.open.1',
  'mandate.payment.1',
  'mandate.payment.open.1'
]);

function requiredText(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
}

export function assertVerifiedAp2Evidence(evidence) {
  if (!evidence || evidence.verified !== true) {
    throw new Error('ap2_mandate_not_verified');
  }

  const vct = requiredText(evidence.vct, 'evidence.vct');
  if (!SUPPORTED_VCT.has(vct)) {
    throw new Error('unsupported_ap2_mandate_vct');
  }

  return {
    verified: true,
    vct,
    mandateType: vct.includes('checkout') ? 'checkout' : 'payment',
    open: vct.includes('.open.'),
    reference:
      typeof evidence.reference === 'string'
        ? evidence.reference
        : null
  };
}

export function createAp2EffectGuard({
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
      evidence,
      operation,
      resource,
      parameters
    } = {}, effect) {
      if (typeof effect !== 'function') {
        throw new TypeError('effect must be a function');
      }

      const ap2 = assertVerifiedAp2Evidence(evidence);
      const normalizedOperation = requiredText(operation, 'operation');
      const resolvedPrincipal =
        typeof principal === 'function'
          ? await principal({ evidence: ap2, operation, resource })
          : principal;
      const resolvedActor =
        typeof actor === 'function'
          ? await actor({ evidence: ap2, operation, resource })
          : actor;

      requiredText(resolvedPrincipal, 'principal');
      requiredText(resolvedActor, 'actor');

      const decision = await gate.verify({
        principal: resolvedPrincipal,
        actor: resolvedActor,
        action: {
          protocol: 'ap2',
          name: normalizedOperation,
          ...(resource ? { resource } : {}),
          parameters: {
            mandateVct: ap2.vct,
            mandateType: ap2.mandateType,
            openMandate: ap2.open,
            ...(parameters ?? {})
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
        protocol: 'ap2',
        operation: normalizedOperation,
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
        error.ap2Evidence = ap2;
        error.verifiedEffect = verifiedEffect;
        error.networkMetering = networkMetering;
        throw error;
      }

      const result = await effect(decision, verifiedEffect);

      return {
        decision,
        ap2Evidence: ap2,
        verifiedEffect,
        networkMetering,
        result
      };
    }
  };
}
