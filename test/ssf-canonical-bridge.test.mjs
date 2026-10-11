import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAEP_SESSION_REVOKED,
  caepSessionRevokedToGateAuthorityEvent
} from '../packages/ssf/src/index.mjs';

test('CAEP session-revoked maps explicitly into the canonical GATE authority event contract', () => {
  const signal = {
    profile: 'caep-1.0',
    eventType: CAEP_SESSION_REVOKED,
    issuer: 'https://idp.example.test',
    jti: 'ssf-source-event-1',
    subject: {
      format: 'opaque',
      id: 'session-a'
    },
    eventTimestamp: 1791723000
  };

  const payload = caepSessionRevokedToGateAuthorityEvent({
    signal,
    mapping: {
      subjectFormat: 'opaque',
      subjectId: 'session-a',
      edgeId: 'edge-a',
      issuerPrincipal: 'stage10:principal',
      subjectPrincipal: 'stage10:actor'
    },
    bridgeIssuer: 'urn:gate:connector:ssf:stage10',
    audience: 'urn:gate:project:test-project',
    sequence: 2,
    iatSec: 1791723000,
    jti: 'bridge-event-2'
  });

  assert.equal(payload.iss, 'urn:gate:connector:ssf:stage10');
  assert.equal(payload.aud, 'urn:gate:project:test-project');

  const event =
    payload.events['urn:gate:event:authority-edge-state:v1'];

  assert.equal(event.edge_id, 'edge-a');
  assert.equal(event.status, 'REVOKED');
  assert.equal(event.sequence, 2);
  assert.equal(event.reason, 'ssf_caep_session_revoked');
});

test('canonical SSF bridge rejects unmapped CAEP subjects', () => {
  assert.throws(
    () => caepSessionRevokedToGateAuthorityEvent({
      signal: {
        eventType: CAEP_SESSION_REVOKED,
        subject: {
          format: 'opaque',
          id: 'wrong-session'
        },
        eventTimestamp: 1791723000
      },
      mapping: {
        subjectFormat: 'opaque',
        subjectId: 'expected-session',
        edgeId: 'edge-a',
        issuerPrincipal: 'stage10:principal',
        subjectPrincipal: 'stage10:actor'
      },
      bridgeIssuer: 'urn:gate:connector:ssf:stage10',
      audience: 'urn:gate:project:test',
      sequence: 2
    }),
    /ssf_subject_mapping_mismatch/
  );
});
