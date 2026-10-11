import type {
  Consistency,
  GateClient,
  GateDecision,
  VerifiedEffectReportResult
} from '@gate-avn/sdk';

export interface AuthZenEntity {
  type: string;
  id: string;
  properties?: Record<string, unknown>;
}

export interface AuthZenAction {
  name: string;
  properties?: Record<string, unknown>;
}

export interface AuthZenEvaluationRequest {
  subject: AuthZenEntity;
  action: AuthZenAction;
  resource: AuthZenEntity;
  context?: Record<string, unknown>;
}

export interface AuthZenDecision {
  decision: boolean;
  context?: Record<string, unknown>;
}

export interface AuthZenEffectGuardOptions {
  gate: Pick<GateClient, 'verify'>;
  principal:
    | string
    | ((context: {
        evaluationRequest: AuthZenEvaluationRequest;
        evaluationResponse: AuthZenDecision;
      }) => string | Promise<string>);
  actor:
    | string
    | ((context: {
        evaluationRequest: AuthZenEvaluationRequest;
        evaluationResponse: AuthZenDecision;
      }) => string | Promise<string>);
  consistency?: Consistency;
  maxStalenessMs?: number;
  reporter?: {
    report(event: {
      event: 'gate.verified_effect';
      verificationId: string;
      occurredAt: string;
      protocol: 'authzen';
      operation: string;
      authority: 'VALID' | 'INVALID' | 'UNKNOWN' | null;
      decision: 'ALLOW' | 'DENY';
      receiptVersion: string | null;
      consistency: Consistency;
      servedBy: string | null;
      region: string | null;
    }): Promise<VerifiedEffectReportResult>;
  } | null;
  idFactory?: () => string;
  now?: () => string;
}

export declare function createAuthZenEffectGuard(
  options: AuthZenEffectGuardOptions
): {
  enforce<T>(
    input: {
      evaluationRequest: AuthZenEvaluationRequest;
      evaluationResponse: AuthZenDecision;
    },
    effect: (
      decision: GateDecision,
      verifiedEffect: unknown
    ) => Promise<T> | T
  ): Promise<{
    allowed: boolean;
    policyDecision: AuthZenDecision;
    gateEvaluated: boolean;
    decision: GateDecision | null;
    verifiedEffect: unknown | null;
    networkMetering: VerifiedEffectReportResult | null;
    result: T | null;
  }>;
};
