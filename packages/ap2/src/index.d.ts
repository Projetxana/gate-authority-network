import type {
  Consistency,
  GateClient,
  GateDecision,
  VerifiedEffectReportResult
} from '@gate-avn/sdk';

export interface VerifiedAp2Evidence {
  verified: true;
  vct:
    | 'mandate.checkout.1'
    | 'mandate.checkout.open.1'
    | 'mandate.payment.1'
    | 'mandate.payment.open.1';
  reference?: string | null;
}

export interface Ap2EffectGuardOptions {
  gate: Pick<GateClient, 'verify'>;
  principal: string | ((context: unknown) => string | Promise<string>);
  actor: string | ((context: unknown) => string | Promise<string>);
  consistency?: Consistency;
  maxStalenessMs?: number;
  reporter?: {
    report(event: unknown): Promise<VerifiedEffectReportResult>;
  } | null;
  idFactory?: () => string;
  now?: () => string;
}

export declare function assertVerifiedAp2Evidence(
  evidence: VerifiedAp2Evidence
): {
  verified: true;
  vct: string;
  mandateType: 'checkout' | 'payment';
  open: boolean;
  reference: string | null;
};

export declare function createAp2EffectGuard(
  options: Ap2EffectGuardOptions
): {
  enforce<T>(
    input: {
      evidence: VerifiedAp2Evidence;
      operation: string;
      resource?: string;
      parameters?: Record<string, unknown>;
    },
    effect: (
      decision: GateDecision,
      verifiedEffect: unknown
    ) => Promise<T> | T
  ): Promise<{
    decision: GateDecision;
    ap2Evidence: unknown;
    verifiedEffect: unknown;
    networkMetering: VerifiedEffectReportResult | null;
    result: T;
  }>;
};
