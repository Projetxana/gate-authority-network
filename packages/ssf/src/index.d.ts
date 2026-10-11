export declare const CAEP_SESSION_REVOKED:
  'https://schemas.openid.net/secevent/caep/event-type/session-revoked';

export declare function verifySsfSet(
  token: string,
  options: {
    publicJwk: JsonWebKey;
    issuer?: string;
    audience?: string;
    nowSec?: number;
    maxIatSkewSec?: number;
  }
): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
};

export declare function normalizeCaepSessionRevoked(
  payload: Record<string, unknown>
): {
  profile: 'caep-1.0';
  eventType: string;
  issuer: string;
  jti: string;
  txn: string | null;
  subject: Record<string, unknown>;
  eventTimestamp: number;
  reasonAdmin: unknown;
  reasonUser: unknown;
};

export declare function applyCaepSessionRevokedToEdges(options: {
  edges: Array<Record<string, unknown>>;
  signal: ReturnType<typeof normalizeCaepSessionRevoked>;
  resolveEdgeIds: (
    subject: Record<string, unknown>,
    signal: unknown
  ) => Promise<string[]> | string[];
}): Promise<Array<Record<string, unknown>>>;
