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

export declare const GATE_AUTHORITY_EDGE_EVENT:
  'urn:gate:event:authority-edge-state:v1';

export declare function caepSessionRevokedToGateAuthorityEvent(
  options: {
    signal: ReturnType<typeof normalizeCaepSessionRevoked>;
    mapping: {
      subjectFormat: string;
      subjectId: string;
      edgeId: string;
      issuerPrincipal: string;
      subjectPrincipal: string;
    };
    bridgeIssuer: string;
    audience: string;
    sequence: number;
    iatSec?: number;
    jti?: string;
  }
): Record<string, unknown>;

export declare const SSF_POLL_DELIVERY: 'urn:ietf:rfc:8936';
export declare function discoverSsfTransmitter(options: any): Promise<any>;
export declare function fetchSsfJwks(options: any): Promise<any>;
export declare function createSsfPollStream(options: any): Promise<any>;
export declare function getExistingSsfStream(options: any): Promise<any>;
export declare function addSsfStreamSubject(options: any): Promise<{supported:boolean}>;
export declare function pollSsfStream(options: any): Promise<{sets:Record<string,string>,moreAvailable:boolean}>;
export declare function deleteSsfStream(options: any): Promise<void>;
export declare function verifySsfSetWithJwks(token: string, options: any): {header:Record<string,any>,payload:Record<string,any>,jwk:JsonWebKey};
