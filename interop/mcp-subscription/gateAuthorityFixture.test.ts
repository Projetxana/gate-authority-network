import {
    CLIENT_CAPABILITIES_META_KEY,
    CLIENT_INFO_META_KEY,
    PROTOCOL_VERSION_META_KEY,
    type AuthInfo
} from '@modelcontextprotocol/core-internal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMcpHandler } from '../../src/server/createMcpHandler';
import type { McpHttpHandler } from '../../src/server/createMcpHandler';
import type { SubscriptionLifetimeOptions } from '../../src/server/listenRouter';
import { McpServer } from '../../src/server/mcp';

const MODERN_REVISION = '2026-07-28';
const DRAFT_CAP = 'io.modelcontextprotocol/subscription-lifetime';
const RESOURCE = 'file:///gate/protected-resource';

type JsonMessage = Record<string, unknown> & {
    params?: Record<string, unknown>;
    error?: {
        code?: number;
        message?: string;
        data?: Record<string, unknown>;
    };
};

let clock = 1_700_000_000_000;

beforeEach(() => {
    vi.useFakeTimers();
    clock = 1_700_000_000_000;
});

afterEach(() => {
    vi.useRealTimers();
});

function factory(): McpServer {
    return new McpServer(
        { name: 'gate-provider-neutral-fixture', version: '1.0.0' },
        { capabilities: { resources: { subscribe: true } } }
    );
}

function unchangedToken(expiresAtMs = clock + 60_000): AuthInfo {
    return {
        token: 'unchanged-access-token',
        clientId: 'fixture-client',
        scopes: ['read'],
        expiresAt: expiresAtMs / 1000,
        extra: { sub: 'fixture-user' }
    };
}

function envelope(): Record<string, unknown> {
    return {
        [PROTOCOL_VERSION_META_KEY]: MODERN_REVISION,
        [CLIENT_INFO_META_KEY]: {
            name: 'gate-provider-neutral-fixture',
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

function handler(options: SubscriptionLifetimeOptions = {}): McpHttpHandler {
    return createMcpHandler(factory, {
        keepAliveMs: 0,
        subscriptionLifetime: {
            now: () => clock,
            ...options
        }
    });
}

async function open(
    h: McpHttpHandler,
    id: number,
    authInfo: AuthInfo
): Promise<{ stream: SseReader; ack: JsonMessage }> {
    const response = await h.fetch(listenRequest(id), { authInfo });
    const stream = new SseReader(response);
    const ack = await stream.next();

    expect(ack?.method).toBe(
        'notifications/subscriptions/acknowledged'
    );

    return { stream, ack: ack! };
}

async function advance(ms: number): Promise<void> {
    clock += ms;
    await vi.advanceTimersByTimeAsync(ms);
}

describe('Stage 18A provider-neutral authority fixture', () => {
    it('fresh upstream revocation: unchanged token, DENY, then zero protected notifications', async () => {
        let authority: 'allow' | 'deny' = 'allow';
        const observedTokens: string[] = [];
        let effectiveDenyAt: number | undefined;

        const h = handler({
            authorize: authInfo => {
                observedTokens.push(authInfo?.token ?? '');

                if (authority === 'deny') {
                    effectiveDenyAt ??= clock;
                    return 'deny';
                }

                return 'allow';
            }
        });

        const token = unchangedToken();
        const { stream } = await open(h, 1, token);

        h.notify.resourceUpdated(RESOURCE);

        const beforeRevocation = await stream.next();

        expect(beforeRevocation?.method).toBe(
            'notifications/resources/updated'
        );

        const lastProtectedNotificationAt = clock;

        await advance(100);

        const upstreamSignalReceivedAt = clock;

        authority = 'deny';

        await advance(7);

        await h.subscriptions.recheckAccess();

        const final = await stream.next();

        expect(final?.error).toMatchObject({
            code: -32_028,
            data: { reason: 'revoked' }
        });

        const effectiveDeny = effectiveDenyAt!;

        h.notify.resourceUpdated(RESOURCE);

        expect(await stream.next()).toBeUndefined();

        expect(new Set(observedTokens)).toEqual(
            new Set(['unchanged-access-token'])
        );

        expect(token.expiresAt! * 1000).toBeGreaterThan(effectiveDeny);

        console.log(
            'GATE_STAGE18A_TRACE',
            JSON.stringify({
                case: 'fresh_upstream_revocation',
                tokenChanged: false,
                tokenStillCryptographicallyLive: true,
                upstreamSignalReceivedAt,
                effectiveDenyAt: effectiveDeny,
                receiptToDenyMs:
                    effectiveDeny - upstreamSignalReceivedAt,
                lastProtectedNotificationAt,
                protectedNotificationsAfterDeny: 0,
                streamEndReason: final?.error?.data?.reason
            })
        );

        await h.close();
    });

    it('authority source unavailable: cached authority expires at freshness deadline, then fail closed', async () => {
        const freshnessWindowMs = 1_000;
        const token = unchangedToken(clock + 60_000);
        const tokenExpiresAt = token.expiresAt! * 1000;
        const freshnessDeadline = clock + freshnessWindowMs;

        let sourceAvailable = true;

        const h = handler({
            maxAuthorizationLifetimeMs: freshnessWindowMs,
            authorize: () => {
                if (sourceAvailable) return 'allow';

                return clock < freshnessDeadline
                    ? 'allow'
                    : 'unavailable';
            }
        });

        const { stream, ack } = await open(h, 2, token);

        expect(ack.params?.authorizedUntil).toBe(
            new Date(freshnessDeadline).toISOString()
        );

        await advance(250);

        const sourceUnavailableAt = clock;
        sourceAvailable = false;

        await advance(250);

        h.notify.resourceUpdated(RESOURCE);

        const cachedWindowNotification = await stream.next();

        expect(cachedWindowNotification?.method).toBe(
            'notifications/resources/updated'
        );

        const lastProtectedNotificationAt = clock;

        await advance(500);

        const final = await stream.next();

        expect(final?.error?.code).toBe(-32_028);

        expect(clock).toBe(freshnessDeadline);
        expect(tokenExpiresAt).toBeGreaterThan(freshnessDeadline);

        h.notify.resourceUpdated(RESOURCE);

        expect(await stream.next()).toBeUndefined();

        console.log(
            'GATE_STAGE18A_TRACE',
            JSON.stringify({
                case: 'authority_source_unavailable',
                tokenChanged: false,
                sourceUnavailableAt,
                freshnessDeadline,
                tokenExpiresAt,
                lastProtectedNotificationAt,
                protectedNotificationsAfterFreshnessDeadline: 0,
                effectiveOutcome: 'fail_closed',
                prototypeEndReason:
                    final?.error?.data?.reason,
                note:
                    'The prototype currently labels the policy-cap deadline token_expiry; this fixture does not infer that the access token expired.'
            })
        );

        await h.close();
    });

    it('expiry-only control: token expiry ends the stream independently of upstream authority', async () => {
        const tokenExpiry = clock + 1_000;
        const token = unchangedToken(tokenExpiry);

        const h = handler({
            authorize: () => 'allow'
        });

        const { stream } = await open(h, 3, token);

        await advance(500);

        h.notify.resourceUpdated(RESOURCE);

        const beforeExpiry = await stream.next();

        expect(beforeExpiry?.method).toBe(
            'notifications/resources/updated'
        );

        const lastProtectedNotificationAt = clock;

        await advance(500);

        const final = await stream.next();

        expect(final?.error).toMatchObject({
            code: -32_028,
            data: { reason: 'token_expiry' }
        });

        h.notify.resourceUpdated(RESOURCE);

        expect(await stream.next()).toBeUndefined();

        console.log(
            'GATE_STAGE18A_TRACE',
            JSON.stringify({
                case: 'expiry_only_control',
                tokenChanged: false,
                tokenExpiresAt: tokenExpiry,
                lastProtectedNotificationAt,
                protectedNotificationsAfterExpiry: 0,
                streamEndReason:
                    final?.error?.data?.reason
            })
        );

        await h.close();
    });
});
