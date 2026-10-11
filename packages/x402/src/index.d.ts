import type {
  Consistency,
  GateClient,
  GateDecision,
  VerifiedEffectReportResult
} from '@gate-avn/sdk';

export interface X402PaymentRequirementsLike {
  scheme?: string;
  network?: string;
  amount?: string;
  asset?: string;
  extra?: {
    paymentFlow?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface X402VerifyContextLike {
  requirements?: X402PaymentRequirementsLike;
  result?: {
    isValid?: boolean;
    [key: string]: unknown;
  };
  transportContext?: unknown;
  [key: string]: unknown;
}

export interface X402SettleContextLike {
  requirements?: X402PaymentRequirementsLike;
  phase?: string;
  transportContext?: unknown;
  [key: string]: unknown;
}

export interface X402VerifiedEffect {
  event: 'gate.verified_effect';
  verificationId: string;
  occurredAt: string;
  protocol: 'x402';
  operation: string;
  authority: 'VALID' | 'INVALID' | 'UNKNOWN' | null;
  decision: 'ALLOW' | 'DENY';
  receiptVersion: string | null;
  consistency: Consistency;
  servedBy: string | null;
  region: string | null;
}

export interface X402AuthorityOutcome {
  allowed: boolean;
  boundary: string;
  decision: GateDecision;
  verifiedEffect: X402VerifiedEffect;
  networkMetering: VerifiedEffectReportResult | null;
  hookResult?:
    | undefined
    | {
        abort: true;
        reason: string;
        message?: string;
      };
}

export interface X402AuthorityOptions {
  gate: Pick<GateClient, 'verify'>;
  principal:
    | string
    | ((context: unknown) => string | Promise<string>);
  actor:
    | string
    | ((context: unknown) => string | Promise<string>);
  operation:
    | string
    | ((context: unknown) => string | Promise<string>);
  resource?:
    | string
    | ((context: unknown) => string | Promise<string>);
  consistency?: Consistency;
  maxStalenessMs?: number;
  reporter?: {
    report(event: X402VerifiedEffect): Promise<VerifiedEffectReportResult>;
  } | null;
  idFactory?: () => string;
  now?: () => string;
  onDecision?: (
    outcome: X402AuthorityOutcome,
    context: unknown
  ) => void;
}

export declare function createX402AuthorityEnforcer(
  options: X402AuthorityOptions
): {
  evaluate(
    context?: X402VerifyContextLike | X402SettleContextLike,
    boundary?: string
  ): Promise<X402AuthorityOutcome>;
};

export interface X402ResourceServerHooksLike {
  onAfterVerify(
    hook: (
      context: X402VerifyContextLike
    ) => Promise<
      | void
      | { abort: true; reason: string; message?: string }
    >
  ): unknown;
  onBeforeSettle(
    hook: (
      context: X402SettleContextLike
    ) => Promise<
      | void
      | { abort: true; reason: string; message?: string }
    >
  ): unknown;
}

export declare function registerGateX402AuthorityHooks(
  resourceServer: X402ResourceServerHooksLike,
  options: X402AuthorityOptions
): {
  resourceServer: X402ResourceServerHooksLike;
  enforcer: ReturnType<typeof createX402AuthorityEnforcer>;
};
