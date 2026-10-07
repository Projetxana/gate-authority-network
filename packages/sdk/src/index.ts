export type GateSource = "sdk" | "mcp" | "api" | "internal" | "unknown";
export declare const GATE_SDK_VERSION = "0.1.0-dev.3";
export declare const GATE_SANDBOX_URL = "https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-sandbox";

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
  evaluation?: {
    established: boolean;
    source?: string;
    fresh?: boolean;
    ageMs?: number;
    [key: string]: unknown;
  };
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
  source?: GateSource;
  clientVersion?: string;
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

export interface SandboxClientOptions extends Omit<GateClientOptions, "endpoint"> { apiKey: string; }
export declare function createSandboxClient(options: SandboxClientOptions): GateClient;
