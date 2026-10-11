import type {
  Consistency,
  GateClient,
  VerifiedEffectReportResult
} from '@gate-avn/sdk';

export interface A2AJsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface A2AEffectGuardOptions {
  gate: Pick<GateClient, 'verify'>;
  principal:
    | string
    | ((request: A2AJsonRpcRequest) => string | Promise<string>);
  actor:
    | string
    | ((request: A2AJsonRpcRequest) => string | Promise<string>);
  consistency?: Consistency;
  maxStalenessMs?: number;
  reporter?: {
    report(event: {
      event: 'gate.verified_effect';
      verificationId: string;
      occurredAt: string;
      protocol: 'a2a';
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

export declare function createA2AEffectGuard(
  options: A2AEffectGuardOptions
): {
  enforceJsonRpc<T>(
    request: A2AJsonRpcRequest,
    effect: (...args: unknown[]) => Promise<T> | T
  ): Promise<{
    decision: unknown;
    verifiedEffect: unknown;
    networkMetering: VerifiedEffectReportResult | null;
    result: T;
  }>;
};

export declare function gateDeniedToA2AError(
  error: unknown,
  requestId?: string | number | null
): {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: -32080;
    message: string;
    data: {
      authority: string;
      reason: string;
    };
  };
};
