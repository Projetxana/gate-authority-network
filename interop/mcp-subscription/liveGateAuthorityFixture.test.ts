import {
  generateKeyPairSync,
  randomUUID,
  sign
} from 'node:crypto';

import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  type AuthInfo
} from '@modelcontextprotocol/core-internal';

import { describe, expect, it } from 'vitest';

import { createMcpHandler } from '../../src/server/createMcpHandler';
import type { McpHttpHandler } from '../../src/server/createMcpHandler';
import { McpServer } from '../../src/server/mcp';

import { GateClient } from '../../../../gate-sdk/index.mjs';

const GATE =
  process.env.GATE_CANONICAL_URL ||
  ['https:', '', 'ufqtoyakmrddqytrkcje.supabase.co', 'functions', 'v1', 'gate-network'].join('/');

const MODERN_REVISION = '2026-07-28';
const DRAFT_CAP = 'io.modelcontextprotocol/subscription-lifetime';
const RESOURCE = 'file:///gate/stage18b/protected-resource';
const EVENT_TYPE = 'urn:gate:event:authority-edge-state:v1';

type JsonMessage = Record<string, unknown> & {
  params?: Record<string, unknown>;
  error?: {
    code?: number;
    message?: string;
    data?: Record<string, unknown>;
  };
};

function factory(): McpServer {
  return new McpServer(
    { name: 'gate-stage18b-live', version: '1.0.0' },
    { capabilities: { resources: { subscribe: true } } }
  );
}

function authInfo(): AuthInfo {
  return {
    token: 'unchanged-mcp-access-token',
    clientId: 'stage18b-client',
    scopes: ['read'],
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    extra: { sub: 'stage18b-user' }
  };
}

function envelope(): Record<string, unknown> {
  return {
    [PROTOCOL_VERSION_META_KEY]: MODERN_REVISION,
    [CLIENT_INFO_META_KEY]: {
      name: 'gate-stage18b-live',
      version: '1.0.0'
    },
    [CLIENT_CAPABILITIES_META_KEY]: {
      experimental: {
        [DRAFT_CAP]: {}
      }
    }
  };
}

function listenRequest(id: number): Request {
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MODERN_REVISION,
      'mcp-method': 'subscriptions/listen'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'subscriptions/listen',
      params: {
        _meta: envelope(),
        notifications: {
          resourceSubscriptions: [RESOURCE]
        }
      }
    })
  });
}

class SseReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();
  private buffer = '';

  constructor(response: Response) {
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    this.reader = response.body!.getReader();
  }

  async next(): Promise<JsonMessage | undefined> {
    for (;;) {
      const idx = this.buffer.indexOf('\n\n');

      if (idx !== -1) {
        const frame = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 2);

        const data = frame
          .split('\n')
          .find(line => line.startsWith('data: '));

        if (data !== undefined) {
          return JSON.parse(data.slice(6)) as JsonMessage;
        }

        continue;
      }

      const { done, value } = await this.reader.read();

      if (done) return undefined;

      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }
}

async function open(
  h: McpHttpHandler,
  id: number,
  auth: AuthInfo
): Promise<{ stream: SseReader; ack: JsonMessage }> {
  const response = await h.fetch(
    listenRequest(id),
    { authInfo: auth }
  );

  const stream = new SseReader(response);
  const ack = await stream.next();

  expect(ack?.method).toBe(
    'notifications/subscriptions/acknowledged'
  );

  return { stream, ack: ack! };
}

function b64u(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signJwt(
  payload: Record<string, unknown>,
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  kid: string
): string {
  const header = b64u({
    alg: 'ES256',
    kid,
    typ: 'secevent+jwt'
  });

  const body = b64u(payload);
  const input = `${header}.${body}`;

  const signature = sign(
    'sha256',
    Buffer.from(input),
    {
      key: privateKey,
      dsaEncoding: 'ieee-p1363'
    }
  ).toString('base64url');

  return `${input}.${signature}`;
}

async function api(
  path: string,
  {
    apiKey,
    body,
    expected
  }: {
    apiKey?: string;
    body?: unknown;
    expected: number;
  }
): Promise<any> {
  const response = await fetch(`${GATE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey
        ? { authorization: `Bearer ${apiKey}` }
        : {})
    },
    body: JSON.stringify(body ?? {})
  });

  const text = await response.text();

  let parsed: any = null;

  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (response.status !== expected) {
    throw new Error(
      `${path} expected ${expected}, got ${response.status}: ${JSON.stringify(parsed)}`
    );
  }

  return parsed;
}

describe('Stage 18B live GATE -> MCP subscription authority', () => {
  it(
    'live gate.verify ALLOW becomes DENY after signed upstream revocation and MCP stops protected delivery',
    async () => {
      const nonce = randomUUID();

      const principal = `stage18b:principal:${nonce}`;
      const actor = `stage18b:actor:${nonce}`;
      const edgeId = `stage18b-edge-${nonce}`;
      const issuer = `urn:gate:stage18b:${nonce}`;
      const kid = `stage18b-${nonce}`;

      let apiKey: string | undefined;
      let registeredIssuer = false;
      let h: McpHttpHandler | undefined;

      try {
        const registration = await api(
          '/projects/register',
          {
            expected: 201,
            body: {
              name: `GATE Stage 18B ${nonce.slice(0, 8)}`
            }
          }
        );

        apiKey = registration?.apiKey;

        const projectId = registration?.project?.id;
        const audience = registration?.audience;

        expect(apiKey).toBeTruthy();
        expect(projectId).toBeTruthy();
        expect(audience).toBeTruthy();

        const keys = generateKeyPairSync(
          'ec',
          { namedCurve: 'P-256' }
        );

        const publicJwk = {
          ...keys.publicKey.export({ format: 'jwk' }),
          kid,
          alg: 'ES256',
          use: 'sig'
        };

        await api(
          '/v1/issuers/register',
          {
            apiKey,
            expected: 201,
            body: {
              issuer,
              publicJwk,
              principalPatterns: [
                'stage18b:principal:*'
              ]
            }
          }
        );

        registeredIssuer = true;

        const activeNow =
          Math.floor(Date.now() / 1000);

        const active = {
          iss: issuer,
          aud: audience,
          iat: activeNow,
          jti: `active-${randomUUID()}`,
          events: {
            [EVENT_TYPE]: {
              edge_id: edgeId,
              issuer_principal: principal,
              subject_principal: actor,
              status: 'ACTIVE',
              sequence: 1,
              event_timestamp:
                new Date().toISOString(),
              valid_until:
                new Date(
                  Date.now() + 10 * 60 * 1000
                ).toISOString()
            }
          }
        };

        await api(
          '/v1/authority/events',
          {
            apiKey,
            expected: 202,
            body: {
              set: signJwt(
                active,
                keys.privateKey,
                kid
              )
            }
          }
        );

        const gate = new GateClient({
          endpoint: GATE,
          apiKey,
          timeoutMs: 5000,
          source: 'mcp',
          clientVersion:
            'stage18b-live-subscription'
        });

        const decisions: Array<{
          authority: string;
          decision: string;
          reason: string | null;
        }> = [];

        const observedMcpTokens: string[] = [];

        h = createMcpHandler(factory, {
          keepAliveMs: 0,
          subscriptionLifetime: {
            authorize: async (
              auth,
              target
            ) => {
              observedMcpTokens.push(
                auth?.token ?? ''
              );

              if (
                target.kind !== 'resource' ||
                target.uri !== RESOURCE
              ) {
                return 'deny';
              }

              try {
                const decision =
                  await gate.verify({
                    principal,
                    actor,
                    action: {
                      protocol: 'mcp',
                      name:
                        'subscriptions/listen',
                      resource: RESOURCE
                    },
                    consistency: 'bounded'
                  });

                decisions.push({
                  authority:
                    decision.authority,
                  decision:
                    decision.decision,
                  reason:
                    decision.reason ?? null
                });

                if (
                  decision.decision ===
                  'ALLOW'
                ) {
                  return 'allow';
                }

                if (
                  decision.authority ===
                  'UNKNOWN'
                ) {
                  return 'unavailable';
                }

                return 'deny';
              } catch {
                return 'unavailable';
              }
            }
          }
        });

        const token = authInfo();

        const { stream } =
          await open(h, 18, token);

        h.notify.resourceUpdated(
          RESOURCE
        );

        const beforeRevocation =
          await stream.next();

        expect(
          beforeRevocation?.method
        ).toBe(
          'notifications/resources/updated'
        );

        expect(
          decisions.some(
            d =>
              d.authority === 'VALID' &&
              d.decision === 'ALLOW'
          )
        ).toBe(true);

        const revokeNow =
          Math.floor(Date.now() / 1000);

        const revoke = {
          iss: issuer,
          aud: audience,
          iat: revokeNow,
          jti: `revoke-${randomUUID()}`,
          events: {
            [EVENT_TYPE]: {
              edge_id: edgeId,
              issuer_principal: principal,
              subject_principal: actor,
              status: 'REVOKED',
              sequence: 2,
              event_timestamp:
                new Date().toISOString(),
              reason:
                'stage18b_live_revocation'
            }
          }
        };

        const signalSentAt = Date.now();

        await api(
          '/v1/authority/events',
          {
            apiKey,
            expected: 202,
            body: {
              set: signJwt(
                revoke,
                keys.privateKey,
                kid
              )
            }
          }
        );

        await h.subscriptions
          .recheckAccess();

        const final =
          await stream.next();

        const effectiveDenyAt =
          Date.now();

        expect(final?.error).toMatchObject({
          code: -32_028,
          data: {
            reason: 'revoked'
          }
        });

        const denyDecision =
          [...decisions]
            .reverse()
            .find(
              d =>
                d.decision === 'DENY'
            );

        expect(denyDecision).toBeTruthy();
        expect(
          denyDecision?.authority
        ).toBe('INVALID');

        h.notify.resourceUpdated(
          RESOURCE
        );

        expect(
          await stream.next()
        ).toBeUndefined();

        expect(
          new Set(observedMcpTokens)
        ).toEqual(
          new Set([
            'unchanged-mcp-access-token'
          ])
        );

        console.log(
          'GATE_STAGE18B_TRACE',
          JSON.stringify({
            projectId,
            disposableProject: true,
            gateNetwork: 'live',
            gateVerifyUsed: true,
            mcpPrototype:
              'RamjotSingh/typescript-sdk',
            tokenChanged: false,
            before: {
              authority: 'VALID',
              decision: 'ALLOW'
            },
            after: {
              authority:
                denyDecision?.authority,
              decision:
                denyDecision?.decision,
              reason:
                denyDecision?.reason
            },
            signalSentAt,
            effectiveDenyAt,
            observedSignalToDenyMs:
              effectiveDenyAt -
              signalSentAt,
            protectedNotificationsAfterDeny:
              0,
            streamEndReason:
              final?.error?.data?.reason,
            apiKeyPrinted: false
          })
        );
      } finally {
        if (h) {
          await h.close().catch(
            () => {}
          );
        }

        if (
          apiKey &&
          registeredIssuer
        ) {
          await api(
            '/v1/issuers/revoke',
            {
              apiKey,
              expected: 200,
              body: {
                issuer,
                keyId: kid
              }
            }
          ).catch(() => {});
        }
      }
    },
    30_000
  );
});
