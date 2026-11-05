# Free trial: diagnose before retrying

For the [pinned MCP trial](FREE-MCP-TRIAL.md), not a production incident runbook. Stop at the first failed step. Do not change policy, credentials, endpoints or billing to make the demonstration pass.

## 1. Installation (no project needed)

In the fresh trial folder, run `node --version`, `npm --version`, `node --check validate-free.mjs`, and `./node_modules/.bin/gate-mcp --version`. Use Node 20+; expect MCP `0.1.0-dev.9`, SDK `0.1.0-dev.4`. `npm ls @gate-avn/mcp @gate-avn/sdk --depth=0` checks the installed versions without printing credentials. Missing dependencies mean installation is incomplete; use the guide's exact `npm ci` command after all three SHA-256 checks say OK. Do not substitute a moving tag, install globally, use sudo, disable TLS or run npm login. Stop on integrity mismatch; do not regenerate the lockfile to hide it.

`EACCES` or localhost `EPERM` can be local directory/listener restrictions; use a writable fresh temporary folder and an environment permitting 127.0.0.1 listeners. `ENOTFOUND`, certificate and timeout errors require checking ordinary HTTPS access to npm/GitHub; they are not GATE authority decisions. Do not share npm configuration or a verbose network dump. These installation failure categories are diagnostic guidance, not newly reproduced failures on every OS.

For your own SDK program, use an ES module (`.mjs` with `import { GateClient } from '@gate-avn/sdk'`). The pinned SDK exposes an import entry, not a CommonJS require entry. CommonJS resolution can produce `ERR_PACKAGE_PATH_NOT_EXPORTED`; this was reproduced and corrected in the diagnostic loader without changing the package. The trial harness is already `.mjs`.

## 2. Interpret the result

| Observation | Meaning and next step |
|---|---|
| Five local PASS lines, then exit 1 with explicit opt-in required | Expected when the creation flag is absent. No completed hosted trial. Review the guide before consenting to its one disposable project. |
| Existing marker assertion | Previously used folder. Do not erase the marker to manufacture a rerun; start from a fresh folder only after resolving any earlier cleanup/registration uncertainty. |
| HTTP 401 / `invalid_api_key` | Request authentication failed. Manual setup: check the key belongs to your test project locally, without pasting it anywhere. Automated harness: it generated its own key; report the step rather than injecting an existing key. |
| HTTP 403 / `issuer_limit_reached` | Active issuer capacity exhausted. Free advertises one issuer. Do not revoke an unfamiliar issuer or create another project to evade the limit; identify your own test issuer and ask for authorized cleanup. |
| HTTP 403 / `untrusted_authority_issuer` or `issuer_not_authorized_for_principal` | Issuer trust or allowed principal does not match the signed event. Check your own public issuer/key identifiers and the failed step. Do not broaden trust or principal patterns to force acceptance. |
| HTTP 403 / `strict_consistency_not_in_plan` | This Free trial uses bounded. Do not downgrade a real application's strict security requirement; stop if bounded does not meet its needs. |
| HTTP 429 during `/projects/register` | Daily registration capacity reached; public health advertises 500 global/day and 3/client/day. Stop, record the step, and defer. No exact reset time or Retry-After is promised here. Never rotate IPs or loop registrations. |
| HTTP 429 / `monthly_verification_limit_reached` | Verification quota reached. Stop; do not create projects to bypass it. Ask the owner to review the actual entitlement/usage. No automatic upgrade. |
| UNKNOWN / DENY | Authority is not established. Zero effect is expected. Check whether the step is a local UNKNOWN fixture, stale/missing authority evidence or unavailable verification. It does not prove revocation. |
| Initial or post-revocation DENY | Expected in this trial if marker counts are respectively 0 and 1. After grant, DENY is not success: record the failed step; never execute the effect manually. |
| HTTP/network/JSON/SDK timeout exception | Verification did not produce a usable decision. The guard does not invoke the effect when verification throws; the harness maps the exception to refusal. Do not call it a hosted DENY receipt. |
| Registration request times out / response is lost | Creation may already have succeeded. Stop; health does not resolve that ambiguity. Request owner investigation, without sending keys, before another registration. |
| Cleanup FAIL, missing report or killed process | Outcome incomplete. Keep the sanitized report locally if available; give the owner only the public issuer/key identifiers through an agreed private channel. Issuer trust may remain active. The 120-second trial grant lease does not revoke issuer trust or delete the project. Recovery may need an authorized service operator because the harness retains no bearer key. Do not claim cleanup succeeded. |

The immutable harness deliberately reports HTTP status and route, not the service's response body. A bare 403 or 429 therefore does **not** identify which row applies. Keep it unknown until the step or an authorized operator establishes the reason. The reason names above come from the current backend source; local fixtures reproduce their client behavior, not live quota exhaustion.

## 3. Support and proof

Share only versions, OS, sanitized failed step/status, elapsed time, setup assistance, local counts 0→1→1 if reached, and cleanup status. Use the [feedback checklist](adoption/FREE-MCP-TRIAL-FEEDBACK.md) and [issue #10](https://github.com/Projetxana/gate-authority-network/issues/10). Invited testers may reply in their existing email thread. Public GitHub comments require a GitHub account; no GATE account key is needed for the automated trial. For sensitive findings, request a private channel without posting their contents.

Never attach `.env`, keys, bearer headers, signed JWS, private JWK fields, process dumps or raw network logs. Do not publish an entire report blindly. If cleanup status is unknown, say unknown; a missing marker is not proof that no request reached the service.

Free currently advertises 50,000 verifications/month, one issuer and bounded consistency. Public `/health` confirms registration limits and a 900-second maximum active lease, not a particular project's current entitlement or a revocation-delivery SLA. No new hosted project was created to test this procedure.

Local executable evidence: `GATE_REVIEW_CONSUMER_ROOT=/absolute/path/to/isolated/npm/install node --test docs/validation/free-support.test.mjs`. It exercises published SDK/guard behavior against a loopback HTTP fixture, with no real key or hosted service. The existing pinned harness supplies the separate real MCP-call fault controls. Neither fixture establishes a hosted run or independent adoption.
