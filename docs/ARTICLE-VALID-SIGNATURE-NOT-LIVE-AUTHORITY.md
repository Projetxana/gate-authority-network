# A valid signature does not mean an AI agent still has authority

**GATE Developer Preview · Technical article · 8 October 2026**

Picture an AI assistant that can call a tool to export a customer's data. It received a delegation earlier today, and the delegated credential still passes cryptographic signature checks. The user has since revoked that delegation through an administrative console.

Does the agent still have permission to export the data?

A valid signature answers a narrower question: *was this message signed by the relevant private key, and has it been altered?* It does not, by itself, tell the receiving tool whether an upstream grant is **currently** trusted.

This distinction matters whenever an agent acts through several organizations, delegation services or tool servers.

## Two independent questions

**Credential validation:** the token format, issuer identity, signature, audience, expiry and declared claims are valid according to the token verifier.

**Live authority validation:** all necessary grants in the chain remain effective, no relevant upstream delegation has been revoked, and the verifier can establish that answer from an acceptably current authority source.

Identity systems, OAuth implementations and authorization platforms can already provide important pieces of both checks; many have revocation, introspection and policy facilities. GATE does not replace them. The problem we are exploring is whether a small, protocol-neutral *authority-state resolver* is useful when a delegated agent spans independently administered trust domains.

## The path problem

Consider two distinct delegation paths to the same agent:

```text
                           ┌──> Department A ───┐
Human principal ───────────┤                    ├──> Agent C ──> tool action
                           └──> Department B ───┘
```

Initially both paths are valid. Revoking A should not automatically erase B's independent grant. But revoking both should leave the agent with **no valid authority path**.

A useful verifier must distinguish:

| State | Result | Meaning |
| --- | --- | --- |
| At least one valid authority path | `VALID / ALLOW` | An eligible live delegation remains |
| Known paths are revoked or invalid | `INVALID / DENY` | No surviving known eligible path |
| Current authority cannot be established | `UNKNOWN / DENY` | Fail closed rather than assume validity |

The `ALLOW` in this table concerns the *delegated authority state only*. The host application still must authenticate the actor, validate resource permissions and apply its own business policy. In other words: **authority ≠ complete authorization**.

## Try the real hosted demo

[Run GATE's live two-minute sandbox](https://gate-beta-nu.vercel.app/demo.html).

The page executes actual HTTP requests against the hosted GATE sandbox:

1. Register a temporary developer-preview sandbox project.
2. Verify the agent while both demo paths are active: `ALLOW`.
3. Revoke path A, verify again: `ALLOW` because B survives.
4. Revoke path B, verify again: `DENY`.

This is an actual API integration test but **not an external issuer proof**. The sandbox graph is synthetic, with pre-seeded authority relationships. The sandbox revocation endpoints are administrative demo controls, not independently signed third-party authority events.

## What about signed issuer events?

On GATE's separate live API, a project can register a trusted ES256 issuer key, submit signed authority-state events with project-specific audience claims, and run verification against a single canonical PostgreSQL primary. Federated export/import of issuer trust across two real GATE projects and automatic refusal after upstream revocation have been tested over public HTTP.

A developer wishing to inspect this deeper flow can [run the ES256 live issuer example](https://gate-beta-nu.vercel.app/integration.html) using a disposable Free project. It does not require an enterprise contract or Stripe checkout.

Important limitation: the reference example creates a new signing key locally. To claim an actual *external issuer integration*, a developer must connect a source they independently control and demonstrate that GATE reflects a change arising there.

## Freshness is a contract, not a slogan

A verifier reading a disconnected region cannot know about a revocation it has not received. Cryptographic checkpoints and bounded freshness can reduce the uncertainty window, but cannot make partitions disappear.

As of GATE v7:

- The production-like live API reads **one canonical database primary** in Canada Central.
- Primary snapshot reads collect local edge state and issuer trust in one database query.
- `maxStalenessMs` measures that primary snapshot read's age; it **does not** guarantee delivery latency from an external authority issuer.
- Missing or unconfigured physical replica regions are refused with `UNKNOWN / DENY`.
- No regional replication lag SLA or cross-region fault tolerance is currently offered.

Therefore do not interpret a fresh primary read as proof that every relevant external authority update has already arrived.

## Where GATE fits

An application still needs its normal identity, token/claim checking, policy engine, resource entitlements, audit, and effect enforcement. GATE aims to answer a focused question just before the side effect:

> Does a currently trusted delegated authority path from this principal to this actor still exist?

Whether this deserves a separate network service is an **open product hypothesis**. The answer will come from independent developers who wire real grant/revocation sources, run repeated verifications, and decide whether the result saves them meaningful engineering work.

**Help test that hypothesis:** [Try the 2-minute demo](https://gate-beta-nu.vercel.app/demo.html), [connect your own issuer](https://gate-beta-nu.vercel.app/integration.html), or [apply for the external developer beta](https://gate-beta-nu.vercel.app/).

GATE remains an experimental Developer Preview, with no production SLA or independent security certification. Please do not use it as the sole control for a critical production action.
