import type {
  Consistency,
  GateClient,
  GateDecision
} from '@gate-avn/sdk';

export interface HttpEffectInput {
  operation: string;
  resource?: string;
  parameters?: Record<string, unknown>;
  principal?: string;
  actor?: string;
  consistency?: Consistency;
  maxStalenessMs?: number;
}

export interface VerifiedEffectEvent {
  event: 'gate.verified_effect';
  verificationId: string;
  occurredAt: string;
  protocol: 'http';
  operation: string;
  authority: 'VALID' | 'INVALID' | 'UNKNOWN' | null;
  decision: 'ALLOW' | 'DENY';
  receiptVersion: string | null;
  consistency: Consistency;
  servedBy: string | null;
  region: string | null;
}

export interface VerifiedEffectReportResult {
  sent: boolean;
  metered?: boolean;
  deduplicated?: boolean;
  eventId?: string | null;
  verificationId?: string;
  reason?: string;
}

export interface HttpEffectGuardOptions {
  gate: Pick<GateClient, 'verify'>;
  principal?: string | (() => string | Promise<string>);
  actor?: string | (() => string | Promise<string>);
  consistency?: Consistency;
  maxStalenessMs?: number;
  reporter?: {
    report(event: VerifiedEffectEvent): Promise<VerifiedEffectReportResult>;
  } | null;
  idFactory?: () => string;
  now?: () => string;
}

export interface HttpEffectOutcome<T> {
  decision: GateDecision;
  verifiedEffect: VerifiedEffectEvent;
  networkMetering: VerifiedEffectReportResult | null;
  result: T;
}

export interface HttpEffectGuard {
  enforce<T>(
    input: HttpEffectInput,
    effect: (
      decision: GateDecision,
      verifiedEffect: VerifiedEffectEvent
    ) => Promise<T> | T
  ): Promise<HttpEffectOutcome<T>>;
}

export declare function createHttpEffectGuard(
  options: HttpEffectGuardOptions
): HttpEffectGuard;
