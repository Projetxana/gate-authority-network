# Operational runbook — execution remains HOLD

## Before the window

The evaluator operates their own machine and owns cleanup. No GATE project or run key is prepared in advance. Confirm the exact Git commit, SHA256SUMS, mapping r3, frozen plan, package versions and the evaluator's clock. The reported SNTP offset must be rechecked before the run; it is not a guaranteed clock bound.

The owner must recheck the actually deployed service on 12 November before 14:00 Toronto. The runner expects version 7 and archived source SHA256 fe62affe88b93f2d7bf57264c964d8a6be94e7856164f68a94456243cb72e985. Any mismatch is HOLD, not permission to edit expectations. Read-only management evidence and any GATE network probe must be distinguished; any extra hosted attempt requires explicit budget review and accounting.

The owner separately approves the exact full profile and 14:00–14:15 Toronto window. Only then prepare a private authorization file from the disabled template, with actual day-of verification and tester/recovery acceptance. Never include it in Git or the delivery archive. The JSON gate is an operational control, not cryptographic proof of approval; the tester must obey the written GO. A downloaded template is never GO. Do not pre-set executionAuthorized to true.

Full-profile dispatch must begin no later than 14:00:15. Virtual-clock rehearsal takes about 11m01s under its synthetic timings; this does not guarantee hosted duration. A complete next case is refused if it cannot fit before 14:12. Stop early rather than compress timings, change profiles or extend the window. The reduced 31-attempt profile needs separate owner approval before launch, never automatic fallback.

## Manual execution — commands reserved for a future explicit GO

There must be one runner process, no parallel SDK script, dashboard probe or other GATE client. Choose an absolute, private run folder outside this checkout. Only after written GO and correct private authorization:

```sh
umask 077
node cli.mjs run --authorization "$APPROVED_AUTHORIZATION" --mapping evidence/GATE-LRA-MAPPING-r3.md --out "$PRIVATE_RUN"
```

Neither variable is supplied by this package. The runner checks authorization before runtime import, filesystem setup, key generation or fetch. On an approved run it creates the single disposable Free project and issuer itself; never pre-create them or run a second creator. Signing keys are generated locally in memory. No production key is required or distributed.

## Budget, monitoring and stopping

The durable attempts.jsonl ledger is incremented and fsynced BEFORE each dispatch, including failures. Historical health 1 is entered but not resent. Full profile sends 41 new requests: health 1, project 1, project information 1, issuer registration 1, signed events 11, verification 23, cleanup 3. Total 42. Normal requests stop at ledger 39; cleanup retains the 3 planned calls and remaining contingency within hard cap 50. There is no automatic retry or redirect following.

A separate local terminal can inspect existing local files only:

```sh
node monitor.mjs --out "$PRIVATE_RUN"
node cli.mjs status --out "$PRIVATE_RUN"
node cli.mjs stop --out "$PRIVATE_RUN"
```

The monitor/status commands do not issue GATE calls. STOP or a single Ctrl-C requests an orderly stop and cleanup after the pending attempt returns/times out. Do not repeatedly interrupt, kill the process or restart with a fresh ledger. Unjustified ALLOW, unexpected decisions, missing freshness, timing uncertainty or unexpected UNKNOWN stop the test. Expected LRA-10 expiry remains an observation, not an unexpected UNKNOWN. Raw decision diagnostics and effect markers remain separate; the safety interlock does not turn a failed GATE decision into a passed result.

## Cleanup and uncertain outcomes

No normal work after 14:12; all network work ends by 14:15. Cleanup revokes issuer trust, checks issuer effectiveStatus=revoked, then activeIssuers=0. This is trust withdrawal, NOT deletion of the project or its audit records. No cleanup success is inferred from HTTP 200 alone.

If cleanup is uncertain, report HOLD_CLEANUP and stop; do not assume trust is gone. recovery-secret.json contains the disposable project's API key, never a private signing key. It is local mode 0600 inside mode 0700 run storage, retained only for recovery and removed on verified cleanup. Do not upload it. Protect the tester's machine and directory; keys are not managed by this repository.

A recovery action requires a separate owner-approved private recovery authorization with action, exact run directory, current attemptsBefore, short time window and approvalId. Use the SAME ledger, never reset it. Inspect first; revoke only after a recent active observation; then inspect and info to establish trust withdrawal. Each actual action consumes remaining cap 50. recovery-authorization.template.json remains disabled and cannot launch recovery. If there is no time/budget, or the creation response was lost, keep HOLD and seek explicit owner instructions; do not improvise a new project, token or cleanup client. Do not claim that this package can recover a lost registration response without credentials.

## Results and attribution

Use RESULTATS-TEMPLATE.json and the generated sanitized results.json/attempts.jsonl/effects.jsonl only after manual review. Record PASS / FAIL / PARTIAL / NOT TESTED per case, stop reason, timing/skew and cleanup. Distinguish event response acceptance, decision request duration and local effects. No exact database commit/replication latency follows from these observations. The code is GATE-provided; a run by the vector author is attributed to that evaluator, while this package's own mock runs are implementation-team internal results. No hosted result exists merely because offline tests pass.
