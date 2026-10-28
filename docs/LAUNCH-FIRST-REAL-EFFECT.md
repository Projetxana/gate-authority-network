# GATE — First live verification + guarded local effect (Developer Preview)

**Status:** reproducible developer activation candidate, tested with a mocked service; live-network execution by an independent developer is **still required**. Not a commercial release or security certification.

## Who should try this?

An MCP / HTTP tool developer who needs to learn why a valid signature and an unexpired credential do not prove that delegation remains active at effect time.

This demo uses the **actual GATE Free Network** API, but the ES256 authority source is a **locally generated test issuer controlled by the developer**. It does **not** prove an integration with an independently administered Okta, Entra, or third-party issuer. It does not use the unshipped Stage 18 exact-work permit protocol.

### One real Free Network project

1. Have **Node.js 20+**.
2. Create a **new, disposable** Free GATE project using the Developer Preview quickstart: https://gate-phi-eosin.vercel.app/live.html or `POST /projects/register` as described in `docs/QUICKSTART.md`.
3. Copy the returned project API key. **Never paste it in a public issue or share it in logs.** Do not use an existing customer/production project or a project with a registered issuer.
4. From the GATE repository root, run (macOS zsh):

```zsh
read -s 'GATE_API_KEY?Paste disposable Free project key: '
echo
export GATE_API_KEY
node scripts/gate-live-mcp-activation.mjs
unset GATE_API_KEY
```

For other shells, set the key privately in your environment and run the Node script. The script requires `gate_sk_...` credentials; the remote GATE API authenticates them. The key stays in this terminal's environment. Avoid sending process dumps/screenshots containing the key.

### What you should see

```text
PASS: before signed grant => DENY
PASS: signed ACTIVE grant => VALID / ALLOW; one guarded local effect
PASS: signed REVOKED grant => DENY; no second effect
CLEANUP: disposable issuer trust revoked
PASS: GATE live activation complete; no external side effects performed.
```

The demo creates a temporary ES256 keypair, registers **its public key**, signs and submits an ACTIVE authority event, asks the managed live GATE Network to verify, invokes one **local** callback at an effect-like boundary, signs/submits the REVOKED event, then verifies that the callback is blocked. It attempts to revoke the disposable issuer trust on exit.

**No email, payment, external API mutation, or actual MCP `tools/call` transport is executed.** The action is tagged `protocol: 'mcp'` only as the current API's contextual action metadata; under Stage 17, `action` is **not a semantic policy decision**. A real MCP resource server must enforce its own action/resource policy and call GATE from a non-bypassable execution boundary.

### Why this matters

The test separates an authentic **signature** from current **authority state**. It shows a signed revocation changing the managed network's answer. The issuer in this sample is under the developer's control; truly independent freshness requires an external source and a delivery / checkpoint contract.

### Operational and commercial boundaries

- Real hosted service: single Canadian primary, no production replicas, no external issuer propagation SLA.
- Live Free Developer Preview (as documented): 50,000 verifications/month, 1 issuer, bounded; strict not included. Check current project entitlements rather than relying on an old document.
- This activation may consume metered Free verifications, issuer-registration capacity and rate-limited registration slots. Run **once per new disposable project**.
- The disposable project itself is **not automatically deleted**; revoking issuer trust does not erase metered telemetry or records.
- Authorization failure, network timeout, malformed data or stale authority must never invoke a protected effect. `UNKNOWN/DENY` is distinct from `INVALID/DENY`.
- A genuine third-party pilot must control the issuer independently of GATE, measure revocation delivery lag, use a real MCP tool/resource action, and require real policy authorization in addition to GATE state.
- No protected external side effect or end-to-end Stage 18 bounded-work guarantee is claimed.

## QA

```sh
node --check scripts/gate-live-mcp-activation.mjs
node --test test/gate-live-mcp-activation.test.mjs
```

The tests use a synthetic in-memory HTTP service. **They do not contact GATE production.**

## Pilot exit criteria (do not count internal QA)

- Independently created Free project and first `gate.verify()` (record only anonymized project/team identifier and timestamp).
- Independent developer reproduces signed ACTIVE -> ALLOW and signed REVOKED -> DENY using this script.
- Their own MCP server independently triggers a protected action and tests DENY at effect time.
- Record whether the authority source is synthetic, self-controlled, or truly third-party; do not conflate these.
- Record time-to-first-verification, failed steps, whether developer returned at day 7, and **actual** payment (if any). Do not equate a test API call with a customer.
