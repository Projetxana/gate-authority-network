function toMs(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function assertContiguousSequence({
  acceptedSeq,
  incomingSeq,
  staleError = 'stale_authority_event',
  gapError = 'authority_event_sequence_gap'
}) {
  const accepted = Number(acceptedSeq);
  const incoming = Number(incomingSeq);
  if (!Number.isInteger(accepted) || accepted < 0) throw new Error('invalid_accepted_sequence');
  if (!Number.isInteger(incoming) || incoming < 1) throw new Error('invalid_incoming_sequence');
  if (incoming <= accepted) throw new Error(staleError);
  if (incoming !== accepted + 1) throw new Error(gapError);
  return incoming;
}

export function assertSigningKeyLifecycle(lifecycle, { iatMs } = {}) {
  if (!lifecycle || typeof lifecycle !== 'object') throw new Error('untrusted_signing_key');
  const status = String(lifecycle.status ?? lifecycle.gate_status ?? 'active').toLowerCase();
  if (status === 'standby') throw new Error('untrusted_signing_key');
  if (status === 'revoked') throw new Error('signing_key_revoked');
  if (status !== 'active' && status !== 'retired') throw new Error('untrusted_signing_key');

  const issuedAtMs = toMs(iatMs);
  if (issuedAtMs == null) throw new Error('artifact_iat_required');

  const validFromMs = toMs(lifecycle.validFrom ?? lifecycle.valid_from ?? lifecycle.gate_valid_from);
  const validUntilMs = toMs(lifecycle.validUntil ?? lifecycle.valid_until ?? lifecycle.gate_valid_until);

  if (validFromMs != null && issuedAtMs < validFromMs) throw new Error('artifact_before_key_activation');
  if (validUntilMs != null && issuedAtMs > validUntilMs) throw new Error('artifact_after_key_retirement');

  return {
    status,
    validFromMs,
    validUntilMs,
    accepted: true
  };
}

export function assertArtifactBinding(payload, {
  expectedIssuer,
  expectedAudience,
  bindingClaim,
  expectedBinding
} = {}) {
  if (!payload || typeof payload !== 'object') throw new Error('invalid_artifact_payload');
  if (expectedIssuer && payload.iss !== expectedIssuer) throw new Error('issuer_mismatch');
  if (expectedAudience) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(expectedAudience)) throw new Error('audience_mismatch');
  }
  if (bindingClaim && expectedBinding != null && payload[bindingClaim] !== expectedBinding) {
    throw new Error('artifact_binding_mismatch');
  }
  return true;
}
