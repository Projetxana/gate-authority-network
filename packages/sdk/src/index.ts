export type Consistency = "bounded" | "strict";

export interface GateAction {
  protocol?: string;
  name: string;
  resource?: string;
  parameters?: Record<string, unknown>;
}

export interface VerifyRequest {
  principal: string;
  actor: string;
  action?: GateAction;
  consistency?: Consistency;
  maxStalenessMs?: number;
  signal?: AbortSignal;
}

export interface GateDecision {
  authority: "VALID" | "INVALID" | "UNKNOWN";
  decision: "ALLOW" | "DENY";
  reason?: string;
  principal?: string;
  actor?: string;
  consistency?: Consistency;
  servedBy?: string;
  region?: string;
  revision?: number;
  freshness?: {
    ageMs: number;
    leaseRemainingMs: number;
    maxStalenessMs: number;
    fresh: boolean;
  };
  action?: GateAction;
  [key: string]: unknown;
}

export interface GateClientOptions {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export declare class GateDeniedError extends Error {
  readonly code: "GATE_AUTHORITY_DENIED";
  readonly decision: GateDecision;
  constructor(decision: GateDecision);
}

export declare class GateClient {
  constructor(options: GateClientOptions);
  verify(request: VerifyRequest): Promise<GateDecision>;
  enforce<T>(request: VerifyRequest, effect: (decision: GateDecision) => Promise<T> | T): Promise<{ decision: GateDecision; result: T }>;
}

export declare function createGateClient(options: GateClientOptions): GateClient;
