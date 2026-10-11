# Stage 11 — Independent SSF Interop

Target: caep.dev / SGNL as an external SSF transmitter, using RFC 8936 POLL so no public tunnel is required.

Success means a SET signed by caep.dev is discovered through live SSF metadata/JWKS, verified independently, normalized as CAEP `session-revoked`, mapped explicitly to a GATE delegation edge, and causes the canonical GATE v7 result to change from `VALID / ALLOW` to `INVALID / DENY`.

The operator keeps the caep.dev bearer token local. The script never prints it. It creates a temporary POLL stream and deletes it after the proof.

## caep.dev current web-transmitter interoperability note

In the live Stage 11 run, caep.dev delivered a cryptographically signed
`session-revoked` SET for the configured audience but the observed web
Transmitter payload omitted a top-level `sub_id`.

For this independent interoperability proof only, the live smoke verifies the
SET with issuer, audience, JTI, IAT, event type and JWKS signature while
allowing the missing subject. The connector then maps that signal to the
single disposable GATE authority edge dedicated to this test stream.

The general SSF verifier remains strict by default (`requireSubject = true`).
A production connector should use source-specific subject mapping whenever the
transmitter supplies a subject identifier.
