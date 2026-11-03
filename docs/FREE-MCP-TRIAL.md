# Try signed revocation with the published GATE MCP package

For developers building an MCP tool that must stop an agent after delegated authority is revoked. This trial asks whether GATE helps with that problem in your own system; a successful demo alone does not establish that need.

You will use npm `@gate-avn/mcp@0.1.0-dev.9` and `@gate-avn/sdk@0.1.0-dev.4`, a real MCP `tools/call`, and the hosted Free network with `consistency: bounded`. A locally controlled ES256 test issuer supplies signed grant and revocation events. The only effect is one line in a disposable local file.

## Before starting

- Node.js 20+ and npm, macOS or Linux terminal with curl and shasum, HTTPS access to npm/GitHub/GATE, and permission to listen on 127.0.0.1 for fault tests.
- No GATE account key or npm login is needed. The explicit opt-in below creates ONE new disposable Free project; never provide a customer project or an existing API key.
- The run uses a few metered Free checks and a rate-limited registration slot. No payment or card. The project/usage records remain afterward; cleanup revokes issuer trust, not the project itself.
- This is a Developer Preview, not enterprise GA. GATE checks authority evidence it has received. Your application still owns authentication and action/resource policy. No independent upstream-freshness SLA, atomic check/effect transaction or Stage 18 permit is demonstrated.

## 1. Download the small, pinned trial harness

No repository clone is required. Run these commands in a terminal. They create a fresh temporary folder and download three reviewable files, not a package archive. The source is pinned to the public Mission 012 continuity commit, `919d2bb6bdac75a310fe6e75baf65ad86f6255dd` (PR #25); it is deliberately not a floating main URL. That PR is awaiting owner merge, but its pinned files are public.

```sh
GATE_FREE_TRIAL_DIR="$(mktemp -d /tmp/gate-free-trial.XXXXXX)"
cd "$GATE_FREE_TRIAL_DIR"
umask 077
GATE_TRIAL_SOURCE="https://raw.githubusercontent.com/Projetxana/gate-authority-network/919d2bb6bdac75a310fe6e75baf65ad86f6255dd/docs/validation/mission012"
for trial_file in package.json package-lock.json validate-free.mjs; do
  curl --fail --silent --show-error --proto '=https' \
    "$GATE_TRIAL_SOURCE/$trial_file" -o "$trial_file" || break
done
cat > SHA256SUMS <<'SUMS'
c19fa88d678f5b3607be5c3050997e115d5a6639cc0b69fb2560fd4ae30d93c9  package.json
fddd29faf1ab0ff6b5ec9fc762bf9f7aca5c3e25cf8133256ce9fd856daf4671  package-lock.json
9fedf68e58c68b6353bf4587490661bd9d3b16d227b5642fc98b3f7a2d45a142  validate-free.mjs
SUMS
shasum -a 256 -c SHA256SUMS
```

All three files must say `OK`. Stop on any missing file or mismatch. The hashes pin the reviewed bytes; they do not replace reviewing code or trusting its source. Open `validate-free.mjs` in your editor before running it. It generates keys locally, registers only its own issuer, and attempts issuer cleanup in `finally`. Do not pipe downloaded code directly into node or a shell.

## 2. Install exact public packages

```sh
touch empty-user.npmrc empty-global.npmrc
npm ci --ignore-scripts --no-audit --no-fund \
  --registry https://registry.npmjs.org/ \
  --userconfig ./empty-user.npmrc --globalconfig ./empty-global.npmrc \
  --cache "$GATE_FREE_TRIAL_DIR/npm-cache"
node --check validate-free.mjs
./node_modules/.bin/gate-mcp --version
```

Expect CLI `0.1.0-dev.9`. The lockfile downloads from npm with integrity checks; no local tarball or workspace dependency is used. The empty npmrc files are local to the test folder and do not modify your existing npm configuration. `dev` currently points to dev.9 and `latest` to dev.2; this trial uses neither moving tag.

## 3. Explicitly opt into the disposable hosted test

Note your start time, then run:

```sh
node validate-free.mjs --create-disposable-project
```

Do not set GATE_API_KEY. The program does not use an existing project key. The freshly returned bearer and generated ES256 private key are not printed or saved; the bearer passes to the MCP child over a private pipe, not tool arguments, argv or the environment. Only the public JWK and signed events go to the canonical service. Do not enable network payload logging or capture memory dumps.

Expected hosted sequence:

| Check | Authority / decision | Local effects so far |
|---|---|---:|
| Before grant | INVALID / DENY | 0 |
| Signed ACTIVE accepted, then tools/call | VALID / ALLOW | 1 |
| Signed REVOKED accepted, then tools/call | INVALID / DENY | 1 |
| Issuer trust revoked and project rechecked | activeIssuers = 0 | 1 |

The decision counter should end at total 3, allow 1, deny 2. This is distinct from the marker file, which must contain exactly one line. Capture the time to the first `hosted_after_signed_grant` PASS without copying any credentials.

The first five PASS lines are separate local controls: UNKNOWN, HTTP 503, disconnected socket, SDK timeout and malformed JSON. They all travel through actual MCP calls and must produce zero effects. They do **not** establish a hosted UNKNOWN response or disrupt the public service. The MCP handler maps verification exceptions to a refusal; these are not fabricated successful server decisions.

## 4. Check cleanup and record your own outcome

```sh
cat report.json
wc -l disposable-effect.log
```

Expect exit code 0, `status: PASS`, `cleanup.status: PASS`, `activeIssuers: 0`, and one marker line. Your report is your evidence; the operator's earlier report is not an independent trial. The generated public issuer ID is not a credential, but review any file before sharing it. Never share an API key, JWS, private key or process dump.

If HTTP 401/403, 429, TLS/network failure or cleanup failure occurs, stop and record the sanitized step/code. Do not switch endpoints, disable TLS, use a customer key, change IP to bypass rate limits or loop project registrations. A partial run is not PASS. If cleanup fails or the process is killed, the project may retain a trusted issuer; the short grant lease does not replace trust revocation. Ask the project owner for authorized recovery using the public issuer identifiers in the report. No existing secret should be changed to bypass a failure.

## 5. Tell us what happened, not only whether it passed

Use the [cold-trial feedback form](adoption/FREE-MCP-TRIAL-FEEDBACK.md). The existing [adoption issue #10](https://github.com/Projetxana/gate-authority-network/issues/10) is the public feedback destination; sharing is optional and must contain no personal/client data or secrets. For sensitive observations, request a private channel instead of posting the details.

We need to know: did you work without step-by-step assistance, where did you get stuck, how long to first ALLOW, did revocation prevent another effect, and do you have an actual tool where this problem occurs? A day-7 return and a genuine integration matter more than stars or a Glama score. This trial neither asks for payment nor demonstrates willingness to pay.

Glama's `gate_verify` and `gate_status` establish discovery, not enforcement of your own tool. This harness uses the published effect guard inside a trusted test tool handler. Your real handler must still derive identities from authenticated server state and enforce its application policy.
