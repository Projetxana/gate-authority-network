import { GateClient, type GateDecision, type GateHttpError } from '@gate-avn/sdk';

// A consumer must handle absent/error-path fields and SQL nulls without casts.
const unavailable: NonNullable<GateDecision['freshness']> = {
  fresh: false, snapshotAt: null, snapshotAgeMs: null, maxStalenessMs: null
};
const minimal: NonNullable<GateDecision['freshness']> = { fresh: false };
void unavailable; void minimal;

export async function evaluate(client: GateClient) {
  try {
    const result = await client.verify({
      principal: 'test:owner', actor: 'test:agent', consistency: 'bounded'
    });
    const age: number | null | undefined = result.freshness?.snapshotAgeMs;
    const limit: number | undefined = result.freshness?.effectiveSnapshotLimitMs;
    const snapshotAt: string | null | undefined = result.freshness?.snapshotAt;
    return { decision: result.decision, age: typeof age === 'number' ? age.toFixed(0) : null,
      limit: limit ?? null, snapshotAt: snapshotAt ?? null };
  } catch (error: unknown) {
    if (error instanceof Error && 'status' in error && 'diagnostics' in error) {
      const http = error as GateHttpError;
      const status: number = http.status;
      const observed: 'ALLOW' | 'DENY' | undefined = http.diagnostics.decision;
      const observedAge: number | null | undefined = http.diagnostics.freshness?.snapshotAgeMs;
      // Diagnostic observation does not turn the failed request into admission.
      return { failed: true, status, observed: observed ?? null, observedAge: observedAge ?? null };
    }
    throw error;
  }
}

// @ts-expect-error snapshot age must never be an unvalidated string
const invalid: NonNullable<GateDecision['freshness']> = { fresh: true, snapshotAgeMs: 'old' };
void invalid;
declare const failure: GateHttpError;
// @ts-expect-error diagnostics are immutable observations
failure.diagnostics.reason = 'made_up';
// @ts-expect-error transport errors do not expose a top-level admission decision
failure.decision;
