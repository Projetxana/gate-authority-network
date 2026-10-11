
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CANONICAL_URL = "https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network";
const CAEP_SESSION_REVOKED = "https://schemas.openid.net/secevent/caep/event-type/session-revoked";
const POLL = "urn:ietf:rfc:8936";
const GATE_EVENT = "urn:gate:event:authority-edge-state:v1";
const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-gate-worker-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: H });
}

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: "Bearer " + SERVICE_ROLE_KEY,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const t = await r.text();
  let d: any = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) throw new Error("supabase_" + r.status + ":" + (typeof d === "string" ? d : JSON.stringify(d)));
  return d;
}

function bearer(req: Request) {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function projectAuth(req: Request) {
  const secret = bearer(req);
  if (!secret) return null;
  const rows = await rest("rpc/gate_authenticate_api_key_v2", {
    method: "POST",
    body: JSON.stringify({ p_secret: secret })
  });
  const r = Array.isArray(rows) ? rows[0] : null;
  return r?.project_id ? { projectId: r.project_id, apiKeyId: r.api_key_id, plan: r.plan } : null;
}

async function workerAuth(req: Request) {
  const secret = req.headers.get("x-gate-worker-secret");
  if (!secret) return false;
  const rows = await rest("rpc/gate_ssf_worker_secret_matches", {
    method: "POST",
    body: JSON.stringify({ p_secret: secret })
  });
  return rows === true || (Array.isArray(rows) && rows[0] === true);
}

function safeText(v: unknown, max = 300) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && s.length <= max ? s : null;
}

function normalizeIssuer(v: unknown) {
  return String(v || "").replace(/\/+$/, "");
}

function safeHttpsUrl(v: unknown) {
  const s = safeText(v, 1200);
  if (!s) throw new Error("https_url_required");
  const u = new URL(s);
  if (u.protocol !== "https:") throw new Error("https_url_required");
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" || h === "::1" || h.endsWith(".local") || h.endsWith(".internal") ||
    /^127\./.test(h) || /^10\./.test(h) || /^169\.254\./.test(h) || /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h) || /^(fc|fd|fe80)/i.test(h) || h === "0.0.0.0"
  ) throw new Error("private_or_local_url_not_allowed");
  return u.toString();
}

async function externalJson(url: string, accessToken: string, init: RequestInit = {}) {
  const r = await fetch(safeHttpsUrl(url), {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(accessToken ? { authorization: "Bearer " + accessToken } : {}),
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(8000)
  });
  const t = await r.text();
  let d: any = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  return { r, d, t };
}

function audienceIncludes(actual: any, expected: string | null) {
  if (!expected) return true;
  return Array.isArray(actual) ? actual.includes(expected) : actual === expected;
}

async function discover(issuer: string | null, metadataUrl: string | null, token: string) {
  let url = metadataUrl ? safeHttpsUrl(metadataUrl) : null;
  if (!url) {
    const i = normalizeIssuer(issuer);
    if (!i.startsWith("https://")) throw new Error("issuer_or_metadata_url_required");
    url = safeHttpsUrl(i + "/.well-known/ssf-configuration");
  }
  const { r, d } = await externalJson(url, token);
  if (!r.ok) throw new Error("ssf_metadata_http_" + r.status);
  if (!d?.issuer || !d?.jwks_uri || !d?.configuration_endpoint || !Array.isArray(d?.delivery_methods_supported)) {
    throw new Error("invalid_ssf_transmitter_metadata");
  }
  if (issuer && normalizeIssuer(d.issuer) !== normalizeIssuer(issuer)) throw new Error("ssf_metadata_issuer_mismatch");
  safeHttpsUrl(d.issuer);
  safeHttpsUrl(d.jwks_uri);
  safeHttpsUrl(d.configuration_endpoint);
  if (!d.delivery_methods_supported.includes(POLL)) throw new Error("ssf_poll_not_supported");
  return { metadataUrl: url, metadata: d };
}

async function fetchJwks(uri: string, token: string) {
  const { r, d } = await externalJson(uri, token);
  if (!r.ok) throw new Error("ssf_jwks_http_" + r.status);
  if (!Array.isArray(d?.keys) || !d.keys.length) throw new Error("invalid_ssf_jwks");
  return d;
}

async function createOrReuseStream(metadata: any, token: string, expectedAudience: string | null, description: string) {
  const { r, d, t } = await externalJson(metadata.configuration_endpoint, token, {
    method: "POST",
    body: JSON.stringify({
      delivery: { method: POLL },
      events_requested: [CAEP_SESSION_REVOKED],
      description
    })
  });
  let stream = d;
  if (r.status === 409) {
    const got = await externalJson(metadata.configuration_endpoint, token);
    if (!got.r.ok) throw new Error("ssf_stream_get_http_" + got.r.status);
    const body = got.d;
    const candidates = Array.isArray(body) ? body : (Array.isArray(body?.streams) ? body.streams : [body]);
    stream = candidates.find((x: any) =>
      x?.delivery?.method === POLL &&
      x?.stream_id &&
      x?.delivery?.endpoint_url &&
      audienceIncludes(x?.aud, expectedAudience)
    );
    if (!stream) throw new Error("ssf_existing_stream_audience_not_found");
  } else if (r.status !== 201) {
    throw new Error("ssf_stream_create_http_" + r.status + ":" + t.slice(0, 300));
  }
  if (!stream?.stream_id || stream?.delivery?.method !== POLL || !stream?.delivery?.endpoint_url) {
    throw new Error("invalid_ssf_poll_stream");
  }
  safeHttpsUrl(stream.delivery.endpoint_url);
  let audience = expectedAudience;
  if (!audience) {
    if (typeof stream.aud === "string" && stream.aud) audience = stream.aud;
    else if (Array.isArray(stream.aud) && stream.aud.length === 1) audience = stream.aud[0];
  }
  if (!audience || !audienceIncludes(stream.aud, audience)) throw new Error("ssf_stream_audience_required_or_mismatch");
  return { stream, audience };
}

async function sha256Text(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, "0")).join("");
}

function stable(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + stable(value[k])).join(",") + "}";
}

function b64uBytes(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64uJson(v: any) {
  return b64uBytes(new TextEncoder().encode(JSON.stringify(v)));
}

function b64uDecode(s: string) {
  let x = s.replace(/-/g, "+").replace(/_/g, "/");
  while (x.length % 4) x += "=";
  return Uint8Array.from(atob(x), c => c.charCodeAt(0));
}

function parsePart(s: string) {
  return JSON.parse(new TextDecoder().decode(b64uDecode(s)));
}

async function verifySet(token: string, jwks: any, issuer: string, audience: string, requireSubject: boolean) {
  const p = token.split(".");
  if (p.length !== 3) throw new Error("invalid_compact_set");
  const header = parsePart(p[0]);
  const payload = parsePart(p[1]);
  if (!["RS256", "ES256"].includes(header.alg)) throw new Error("unsupported_set_alg");
  if (header.typ !== "secevent+jwt") throw new Error("invalid_set_typ");
  if (!header.kid) throw new Error("set_kid_required");
  if (payload.sub !== undefined) throw new Error("ssf_sub_claim_not_allowed");
  if (payload.exp !== undefined) throw new Error("ssf_exp_claim_not_allowed");
  if (normalizeIssuer(payload.iss) !== normalizeIssuer(issuer)) throw new Error("ssf_issuer_mismatch");
  if (!audienceIncludes(payload.aud, audience)) throw new Error("ssf_audience_mismatch");
  if (!payload.jti || !payload.iat || !payload.events) throw new Error("ssf_required_claim_missing");
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(Number(payload.iat)) || Math.abs(now - Number(payload.iat)) > 600) throw new Error("ssf_iat_outside_window");
  if (requireSubject && (!payload.sub_id || typeof payload.sub_id !== "object")) throw new Error("ssf_subject_identifier_missing");
  const candidates = jwks.keys.filter((k: any) => k.kid === header.kid);
  if (candidates.length !== 1) throw new Error("set_signing_key_not_found");
  const jwk = candidates[0];
  let key: CryptoKey;
  let ok = false;
  if (header.alg === "RS256") {
    if (jwk.kty !== "RSA") throw new Error("set_signing_key_type_mismatch");
    key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64uDecode(p[2]), new TextEncoder().encode(p[0] + "." + p[1]));
  } else {
    if (jwk.kty !== "EC" || jwk.crv !== "P-256") throw new Error("set_signing_key_type_mismatch");
    key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, b64uDecode(p[2]), new TextEncoder().encode(p[0] + "." + p[1]));
  }
  if (!ok) throw new Error("invalid_set_signature");
  return { header, payload };
}

async function signEs256(payload: any, privateJwk: any, kid: string) {
  const header = { alg: "ES256", typ: "JWT", kid };
  const h = b64uJson(header);
  const p = b64uJson(payload);
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(h + "." + p)));
  return h + "." + p + "." + b64uBytes(sig);
}

async function vaultStore(secret: string, name: string, description: string) {
  const d = await rest("rpc/gate_vault_store_secret", {
    method: "POST",
    body: JSON.stringify({ p_secret: secret, p_name: name, p_description: description })
  });
  return typeof d === "string" ? d : (Array.isArray(d) ? d[0] : d);
}

async function vaultRead(id: string) {
  const d = await rest("rpc/gate_vault_read_secret", {
    method: "POST",
    body: JSON.stringify({ p_secret_id: id })
  });
  const v = typeof d === "string" ? d : (Array.isArray(d) ? d[0] : d);
  if (!v) throw new Error("vault_secret_missing");
  return v;
}

async function canonical(path: string, apiKey: string, body: any, expected = 200) {
  const r = await fetch(CANONICAL_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  const d = await r.json().catch(() => null);
  if (r.status !== expected) throw new Error("canonical_" + r.status + ":" + JSON.stringify(d));
  return d;
}

async function connectorRow(id: string, projectId: string | null = null) {
  let q = "gate_ssf_connectors?id=eq." + encodeURIComponent(id) + "&select=*";
  if (projectId) q += "&project_id=eq." + encodeURIComponent(projectId);
  const rows = await rest(q);
  return Array.isArray(rows) ? rows[0] : null;
}

async function registerConnector(req: Request) {
  const a = await projectAuth(req);
  if (!a) return json({ ok: false, error: "invalid_api_key" }, 401);
  let b: any;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const name = safeText(b?.name, 120) || "Hosted SSF connector";
  const issuer = safeText(b?.issuer, 300);
  const metadataUrl = safeText(b?.metadataUrl, 1200);
  const accessToken = safeText(b?.accessToken, 5000);
  const expectedAudience = safeText(b?.expectedAudience, 500);
  const mapping = b?.mapping;
  const mappingMode = b?.mappingMode === "stream" ? "stream" : "subject";
  const requireSubject = b?.requireSubject !== false;

  if ((!issuer && !metadataUrl) || !accessToken) return json({ ok: false, error: "issuer_or_metadata_url_and_access_token_required" }, 400);
  if (!mapping || typeof mapping !== "object") return json({ ok: false, error: "mapping_required" }, 400);
  const edgeId = safeText(mapping.edgeId, 200);
  const issuerPrincipal = safeText(mapping.issuerPrincipal, 240);
  const subjectPrincipal = safeText(mapping.subjectPrincipal, 240);
  if (!edgeId || !issuerPrincipal || !subjectPrincipal) return json({ ok: false, error: "mapping_edge_and_principals_required" }, 400);
  if (mappingMode === "stream" && requireSubject) return json({ ok: false, error: "stream_mapping_requires_require_subject_false" }, 400);
  let subjectHash: string | null = null;
  if (mappingMode === "subject") {
    if (!mapping.subject || typeof mapping.subject !== "object") return json({ ok: false, error: "subject_mapping_requires_subject" }, 400);
    subjectHash = await sha256Text(stable(mapping.subject));
  }

  const discovered = await discover(issuer, metadataUrl, accessToken);
  await fetchJwks(discovered.metadata.jwks_uri, accessToken);
  const connectorId = crypto.randomUUID();
  const streamInfo = await createOrReuseStream(discovered.metadata, accessToken, expectedAudience, "GATE hosted SSF " + connectorId.slice(0, 8));

  const keyRows = await rest("rpc/gate_create_api_key", {
    method: "POST",
    body: JSON.stringify({ p_project_id: a.projectId, p_name: "ssf-connector:" + connectorId.slice(0, 8), p_expires_at: null })
  });
  const ck = Array.isArray(keyRows) ? keyRows[0] : null;
  if (!ck?.api_key_id || !ck?.api_key_secret) throw new Error("connector_api_key_create_failed");

  const bridge = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const privateJwk: any = await crypto.subtle.exportKey("jwk", bridge.privateKey);
  const publicJwk: any = await crypto.subtle.exportKey("jwk", bridge.publicKey);
  const bridgeKid = "ssf-hosted-" + connectorId;
  const bridgeIssuer = "urn:gate:connector:ssf:" + connectorId;
  publicJwk.kid = bridgeKid;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  privateJwk.kid = bridgeKid;
  privateJwk.alg = "ES256";
  privateJwk.use = "sig";

  const issuerReg = await canonical("/v1/issuers/register", ck.api_key_secret, {
    issuer: bridgeIssuer,
    publicJwk,
    principalPatterns: [issuerPrincipal]
  }, 201);

  const accessSecretId = await vaultStore(accessToken, "gate_ssf_access_" + connectorId, "SSF transmitter bearer for connector " + connectorId);
  const gateSecretId = await vaultStore(ck.api_key_secret, "gate_ssf_gatekey_" + connectorId, "Dedicated GATE project key for hosted SSF connector " + connectorId);
  const privateSecretId = await vaultStore(JSON.stringify(privateJwk), "gate_ssf_bridge_" + connectorId, "ES256 bridge private JWK for hosted SSF connector " + connectorId);

  const rows = await rest("gate_ssf_connectors", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      id: connectorId,
      project_id: a.projectId,
      name,
      transmitter_issuer: discovered.metadata.issuer,
      metadata_url: discovered.metadataUrl,
      jwks_uri: discovered.metadata.jwks_uri,
      configuration_endpoint: discovered.metadata.configuration_endpoint,
      stream_id: streamInfo.stream.stream_id,
      stream_audience: streamInfo.audience,
      poll_endpoint: streamInfo.stream.delivery.endpoint_url,
      require_subject: requireSubject,
      mapping_mode: mappingMode,
      subject_hash: subjectHash,
      edge_id: edgeId,
      issuer_principal: issuerPrincipal,
      subject_principal: subjectPrincipal,
      access_token_secret_id: accessSecretId,
      gate_api_key_id: ck.api_key_id,
      gate_api_key_secret_id: gateSecretId,
      bridge_private_jwk_secret_id: privateSecretId,
      bridge_issuer_id: issuerReg.issuer.id,
      bridge_issuer: bridgeIssuer,
      bridge_key_id: bridgeKid
    })
  });
  const row = Array.isArray(rows) ? rows[0] : null;

  const bootstrap = Number(b?.bootstrapActiveLeaseSeconds || 0);
  if (Number.isInteger(bootstrap) && bootstrap >= 30 && bootstrap <= 900) {
    const now = Math.floor(Date.now() / 1000);
    const active = {
      iss: bridgeIssuer,
      aud: "urn:gate:project:" + a.projectId,
      iat: now,
      jti: "ssf-hosted-bootstrap-" + connectorId,
      events: {
        [GATE_EVENT]: {
          edge_id: edgeId,
          issuer_principal: issuerPrincipal,
          subject_principal: subjectPrincipal,
          status: "ACTIVE",
          sequence: 1,
          event_timestamp: new Date().toISOString(),
          valid_until: new Date(Date.now() + bootstrap * 1000).toISOString()
        }
      }
    };
    await canonical("/v1/authority/events", ck.api_key_secret, { set: await signEs256(active, privateJwk, bridgeKid) }, 202);
  }

  return json({
    ok: true,
    connector: {
      id: row.id,
      projectId: a.projectId,
      name: row.name,
      status: row.status,
      transmitterIssuer: row.transmitter_issuer,
      streamId: row.stream_id,
      audience: row.stream_audience,
      deliveryMethod: row.delivery_method,
      mappingMode: row.mapping_mode,
      requireSubject: row.require_subject,
      edgeId: row.edge_id
    },
    secretsStoredInVault: true,
    accessTokenReturned: false,
    managedPollIntervalSeconds: 60
  }, 201);
}

async function listConnectors(req: Request) {
  const a = await projectAuth(req);
  if (!a) return json({ ok: false, error: "invalid_api_key" }, 401);
  const rows = await rest(
    "gate_ssf_connectors?project_id=eq." + a.projectId +
    "&select=id,name,status,transmitter_issuer,metadata_url,stream_id,stream_audience,delivery_method,require_subject,mapping_mode,edge_id,last_poll_at,last_event_at,last_error_at,last_error,created_at&order=created_at.desc"
  );
  return json({ ok: true, connectors: rows });
}

async function ack(row: any, accessToken: string, ids: string[]) {
  if (!ids.length) return;
  const { r, t } = await externalJson(row.poll_endpoint, accessToken, {
    method: "POST",
    body: JSON.stringify({ stream_id: row.stream_id, ack: ids, returnImmediately: true })
  });
  if (!r.ok) throw new Error("ssf_ack_http_" + r.status + ":" + t.slice(0, 300));
}

async function processConnector(row: any) {
  const accessToken = await vaultRead(row.access_token_secret_id);
  const gateKey = await vaultRead(row.gate_api_key_secret_id);
  const privateJwk = JSON.parse(await vaultRead(row.bridge_private_jwk_secret_id));
  let jwks = await fetchJwks(row.jwks_uri, accessToken);

  const { r, d, t } = await externalJson(row.poll_endpoint, accessToken, {
    method: "POST",
    body: JSON.stringify({ stream_id: row.stream_id, max_events: 50, returnImmediately: true })
  });
  if (!r.ok) throw new Error("ssf_poll_http_" + r.status + ":" + t.slice(0, 300));
  const sets = d?.sets && typeof d.sets === "object" ? d.sets : {};
  const ackIds: string[] = [];
  let processed = 0;

  for (const [jti, set] of Object.entries(sets)) {
    const prior = await rest(
      "gate_ssf_connector_events?connector_id=eq." + row.id +
      "&jti=eq." + encodeURIComponent(jti) + "&select=id"
    );
    if (Array.isArray(prior) && prior.length) {
      ackIds.push(jti);
      continue;
    }

    let verified: any;
    try {
      verified = await verifySet(String(set), jwks, row.transmitter_issuer, row.stream_audience, row.require_subject);
    } catch (e) {
      if (e instanceof Error && e.message === "set_signing_key_not_found") {
        jwks = await fetchJwks(row.jwks_uri, accessToken);
        verified = await verifySet(String(set), jwks, row.transmitter_issuer, row.stream_audience, row.require_subject);
      } else throw e;
    }

    const event = verified.payload.events?.[CAEP_SESSION_REVOKED];
    if (!event) throw new Error("unsupported_ssf_event_type");

    if (row.mapping_mode === "subject") {
      if (!verified.payload.sub_id || typeof verified.payload.sub_id !== "object") throw new Error("ssf_subject_identifier_missing");
      const incoming = await sha256Text(stable(verified.payload.sub_id));
      if (incoming !== row.subject_hash) throw new Error("ssf_subject_mapping_mismatch");
    }

    const edgeRows = await rest(
      "gate_live_edges?project_id=eq." + row.project_id +
      "&edge_id=eq." + encodeURIComponent(row.edge_id) +
      "&select=edge_id,issuer,subject,status,sequence"
    );
    const edge = Array.isArray(edgeRows) ? edgeRows[0] : null;
    if (!edge) throw new Error("mapped_gate_edge_not_found");
    if (edge.issuer !== row.issuer_principal || edge.subject !== row.subject_principal) throw new Error("mapped_gate_edge_principal_mismatch");

    const seq = Number(edge.sequence) + 1;
    const now = Math.floor(Date.now() / 1000);
    const eventTs = Number(event.event_timestamp ?? verified.payload.iat);
    const canonicalPayload = {
      iss: row.bridge_issuer,
      aud: "urn:gate:project:" + row.project_id,
      iat: now,
      jti: "ssf-hosted-" + (await sha256Text(row.id + "|" + verified.payload.jti)).slice(0, 32),
      events: {
        [GATE_EVENT]: {
          edge_id: row.edge_id,
          issuer_principal: row.issuer_principal,
          subject_principal: row.subject_principal,
          status: "REVOKED",
          sequence: seq,
          reason: "ssf_caep_session_revoked",
          event_timestamp: new Date(eventTs * 1000).toISOString()
        }
      }
    };
    const signed = await signEs256(canonicalPayload, privateJwk, row.bridge_key_id);
    await canonical("/v1/authority/events", gateKey, { set: signed }, 202);

    await rest("gate_ssf_connector_events", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        connector_id: row.id,
        project_id: row.project_id,
        jti: verified.payload.jti,
        event_type: CAEP_SESSION_REVOKED,
        signing_alg: verified.header.alg,
        signing_kid: verified.header.kid,
        subject_present: !!verified.payload.sub_id,
        canonical_status: "REVOKED",
        canonical_sequence: seq,
        processed_at: new Date().toISOString()
      })
    });
    ackIds.push(jti);
    processed++;
  }

  await ack(row, accessToken, ackIds);
  await rest("gate_ssf_connectors?id=eq." + row.id, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      last_poll_at: new Date().toISOString(),
      last_event_at: processed ? new Date().toISOString() : row.last_event_at,
      last_error: null,
      last_error_at: null,
      lease_until: null,
      updated_at: new Date().toISOString()
    })
  });
  return { connectorId: row.id, received: Object.keys(sets).length, processed, acknowledged: ackIds.length };
}

async function markError(row: any, e: unknown) {
  const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
  await rest("gate_ssf_connectors?id=eq." + row.id, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      last_poll_at: new Date().toISOString(),
      last_error_at: new Date().toISOString(),
      last_error: message,
      lease_until: null,
      updated_at: new Date().toISOString()
    })
  });
  return message;
}

async function pollOne(req: Request, id: string) {
  const a = await projectAuth(req);
  if (!a) return json({ ok: false, error: "invalid_api_key" }, 401);
  const row = await connectorRow(id, a.projectId);
  if (!row) return json({ ok: false, error: "connector_not_found" }, 404);
  if (row.status !== "active") return json({ ok: false, error: "connector_not_active" }, 409);
  try {
    return json({ ok: true, result: await processConnector(row) });
  } catch (e) {
    return json({ ok: false, error: await markError(row, e) }, 502);
  }
}

async function runWorker(req: Request) {
  if (!(await workerAuth(req))) return json({ ok: false, error: "invalid_worker_secret" }, 401);
  const rows = await rest("rpc/gate_ssf_claim_due_connectors", {
    method: "POST",
    body: JSON.stringify({ p_limit: 5 })
  });
  const claimed = Array.isArray(rows) ? rows : [];
  const results = [];
  for (const row of claimed) {
    try {
      results.push({ ok: true, ...(await processConnector(row)) });
    } catch (e) {
      results.push({ ok: false, connectorId: row.id, error: await markError(row, e) });
    }
  }
  return json({ ok: true, claimed: claimed.length, results });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  try {
    const path = new URL(req.url).pathname;
    if (req.method === "GET" && path.endsWith("/health")) {
      return json({
        ok: true,
        service: "gate-ssf-connectors",
        stage: 13,
        mode: "hosted-managed-poll",
        delivery: POLL,
        managedPollIntervalSeconds: 60,
        secrets: "Supabase Vault"
      });
    }
    if (req.method === "POST" && path.endsWith("/v1/connectors")) return await registerConnector(req);
    if (req.method === "GET" && path.endsWith("/v1/connectors")) return await listConnectors(req);
    const m = path.match(/\/v1\/connectors\/([0-9a-f-]+)\/poll$/i);
    if (req.method === "POST" && m) return await pollOne(req, m[1]);
    if (req.method === "POST" && path.endsWith("/internal/run")) return await runWorker(req);
    return json({ ok: false, error: "not_found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});
