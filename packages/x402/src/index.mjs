import { randomUUID } from 'node:crypto';

function requiredText(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
}

async function resolve(value, context) {
  return typeof value === 'function' ? await value(context) : value;
}

function paymentParameters(context = {}) {
  const requirements = context.requirements ?? {};
  return {
    scheme: requirements.scheme ?? null,
    network: requirements.network ?? null,
    amount: requirements.amount ?? null,
    asset: requirements.asset ?? null,
    paymentFlow: requirements.extra?.paymentFlow ?? null
  };
}

export function createX402AuthorityEnforcer({
  gate,
  principal,
  actor,
  operation,
  resource,
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
    async evaluate(context = {}, boundary = 'after-verify') {
      const resolvedPrincipal = await resolve(principal, context);
      const resolvedActor = await resolve(actor, context);
      const resolvedOperation = await resolve(operation, context);
      const resolvedResource = await resolve(resource, context);

      requiredText(resolvedPrincipal, 'principal');
      requiredText(resolvedActor, 'actor');
      const normalizedOperation = requiredText(
        resolvedOperation,
        'operation'
      );

      const action = {
        protocol: 'x402',
        name: normalizedOperation,
        ...(resolvedResource ? { resource: resolvedResource } : {}),
        parameters: {
          ...paymentParameters(context),
          boundary
        }
      };

      const request = {
        principal: resolvedPrincipal,
        actor: resolvedActor,
        action,
        consistency,
        ...(Number.isFinite(maxStalenessMs)
          ? { maxStalenessMs }
          : {})
      };

      const decision = await gate.verify(request);

      const verifiedEffect = {
        event: 'gate.verified_effect',
        verificationId: idFactory(),
        occurredAt: now(),
        protocol: 'x402',
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

      const allowed = decision.decision === 'ALLOW';

      return {
        allowed,
        boundary,
        decision,
        verifiedEffect,
        networkMetering,
        hookResult: allowed
          ? undefined
          : {
              abort: true,
              reason: 'gate_authority_denied',
              message:
                decision.reason ??
                'GATE live authority verification denied this x402 effect'
            }
      };
    }
  };
}

export function registerGateX402AuthorityHooks(
  resourceServer,
  options = {}
) {
  if (
    !resourceServer ||
    typeof resourceServer.onAfterVerify !== 'function' ||
    typeof resourceServer.onBeforeSettle !== 'function'
  ) {
    throw new TypeError(
      'x402 resource server with onAfterVerify/onBeforeSettle is required'
    );
  }

  const enforcer = createX402AuthorityEnforcer(options);

  resourceServer.onAfterVerify(async context => {
    // x402 authorization flow: verify -> GATE -> handler -> settle.
    // Defensive check even though this hook is expected after successful verify.
    if (context?.result?.isValid !== true) {
      return {
        abort: true,
        reason: 'x402_payment_not_verified',
        message: 'x402 payment authorization is not valid'
      };
    }

    const outcome = await enforcer.evaluate(context, 'after-verify');
    options.onDecision?.(outcome, context);
    return outcome.hookResult;
  });

  resourceServer.onBeforeSettle(async context => {
    // x402 upfront/escrow flows establish validity with a pre-handler settle.
    // Do not run again for ordinary after-handler settlement.
    if (context?.phase !== 'before-handler') return;

    const outcome = await enforcer.evaluate(
      context,
      'before-handler-settle'
    );
    options.onDecision?.(outcome, context);
    return outcome.hookResult;
  });

  return {
    resourceServer,
    enforcer
  };
}
