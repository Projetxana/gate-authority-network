
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CAEP_SESSION_REVOKED =
  "https://schemas.openid.net/secevent/caep/event-type/session-revoked";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type,x-gate-ssf-preview-token",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: H
  });
}

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(
    SUPABASE_URL + "/rest/v1/" + path,
    {
      ...init,
      headers: {
        apikey: SERVICE_ROLE_KEY,
        authorization: "Bearer " + SERVICE_ROLE_KEY,
        "content-type": "application/json",
        ...(init.headers || {})
      }
    }
  );

  const text = await r.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!r.ok) {
    throw new Error(
      "supabase_" + r.status + ":" +
      (typeof data === "string" ? data : JSON.stringify(data))
    );
  }

  return data;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}

function b64uBytes(value: string) {
  let s = value.replaceAll("-", "+").replaceAll("_", "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function b64uJson(value: string) {
  return JSON.parse(
    new TextDecoder().decode(b64uBytes(value))
  );
}

function safeText(value: unknown, max = 240) {
  if (typeof value !== "string") return null;
  const out = value.trim();
  if (!out || out.length > max) return null;
  return out;
}

async function loadScenario(
  scenarioId: string,
  token: string
) {
  if (!/^[0-9a-f-]{36}$/i.test(scenarioId)) return null;
  if (!token) return null;

  const tokenHash = await sha256(token);
  const rows = await rest(
    "gate_ssf_preview_scenarios" +
      "?id=eq." + encodeURIComponent(scenarioId) +
      "&token_hash=eq." + encodeURIComponent(tokenHash) +
      "&expires_at=gt." + encodeURIComponent(
        new Date().toISOString()
      ) +
      "&select=*"
  );

  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function createScenario(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const issuer = safeText(body?.issuer);
  const publicJwk = body?.publicJwk;
  const subjectFormat = safeText(body?.subjectFormat, 80);
  const subjectId = safeText(body?.subjectId, 240);
  const principal = safeText(body?.principal, 240);
  const actor = safeText(body?.actor, 240);
  const edgeId =
    safeText(body?.edgeId, 200) ??
    "edge-ssf-preview-" + crypto.randomUUID();

  if (
    !issuer ||
    !publicJwk ||
    publicJwk.kty !== "EC" ||
    publicJwk.crv !== "P-256" ||
    !publicJwk.x ||
    !publicJwk.y ||
    !subjectFormat ||
    !subjectId ||
    !principal ||
    !actor
  ) {
    return json({
      ok: false,
      error: "invalid_scenario_input"
    }, 400);
  }

  try {
    await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  } catch {
    return json({
      ok: false,
      error: "invalid_public_jwk"
    }, 400);
  }

  const scenarioId = crypto.randomUUID();
  const token =
    crypto.randomUUID() + "." + crypto.randomUUID();
  const tokenHash = await sha256(token);
  const audience =
    "urn:gate:ssf-preview:" + scenarioId;

  const rows = await rest(
    "gate_ssf_preview_scenarios",
    {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        id: scenarioId,
        token_hash: tokenHash,
        issuer,
        audience,
        public_jwk: publicJwk,
        subject_format: subjectFormat,
        subject_id: subjectId,
        principal,
        actor,
        edge_id: edgeId,
        edge_status: "ACTIVE",
        source_seq: 0
      })
    }
  );

  const row = Array.isArray(rows) ? rows[0] : null;

  return json({
    ok: true,
    scenarioId,
    token,
    audience,
    issuer,
    expiresAt: row?.expires_at ?? null,
    productionV7Untouched: true
  }, 201);
}

async function verifyAuthority(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const scenarioId = safeText(body?.scenarioId, 64);
  const token = req.headers.get(
    "x-gate-ssf-preview-token"
  ) ?? "";

  if (!scenarioId) {
    return json({
      ok: false,
      error: "scenario_id_required"
    }, 400);
  }

  const scenario = await loadScenario(scenarioId, token);
  if (!scenario) {
    return json({
      ok: false,
      error: "invalid_scenario_token"
    }, 401);
  }

  const active = scenario.edge_status === "ACTIVE";

  return json({
    ok: true,
    scenarioId,
    authority: active ? "VALID" : "INVALID",
    decision: active ? "ALLOW" : "DENY",
    reason: active ? null : "upstream_authority_revoked",
    principal: scenario.principal,
    actor: scenario.actor,
    selectedPath: active
      ? [scenario.principal, scenario.actor]
      : null,
    selectedEdges: active
      ? [scenario.edge_id]
      : null,
    source: {
      protocol: "openid-ssf",
      profile: "caep-1.0",
      issuer: scenario.issuer,
      method: "signed-secevent+jwt",
      sequence: Number(scenario.source_seq || 0),
      lastEventAt: scenario.last_event_at ?? null
    },
    productionV7Untouched: true
  });
}

async function ingestSsf(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const scenarioId = safeText(body?.scenarioId, 64);
  const setToken = safeText(body?.set, 20000);
  const token = req.headers.get(
    "x-gate-ssf-preview-token"
  ) ?? "";

  if (!scenarioId || !setToken) {
    return json({
      ok: false,
      error: "scenario_id_and_set_required"
    }, 400);
  }

  const scenario = await loadScenario(scenarioId, token);
  if (!scenario) {
    return json({
      ok: false,
      error: "invalid_scenario_token"
    }, 401);
  }

  const parts = setToken.split(".");
  if (parts.length !== 3) {
    return json({
      ok: false,
      error: "invalid_compact_set"
    }, 400);
  }

  let header: any;
  let payload: any;
  try {
    header = b64uJson(parts[0]);
    payload = b64uJson(parts[1]);
  } catch {
    return json({
      ok: false,
      error: "invalid_set_encoding"
    }, 400);
  }

  if (
    header.alg !== "ES256" ||
    header.typ !== "secevent+jwt"
  ) {
    return json({
      ok: false,
      error: "invalid_set_header"
    }, 400);
  }

  if (payload.sub !== undefined) {
    return json({
      ok: false,
      error: "ssf_sub_claim_not_allowed"
    }, 400);
  }

  if (payload.exp !== undefined) {
    return json({
      ok: false,
      error: "ssf_exp_claim_not_allowed"
    }, 400);
  }

  if (payload.iss !== scenario.issuer) {
    return json({
      ok: false,
      error: "ssf_issuer_mismatch"
    }, 400);
  }

  const aud = Array.isArray(payload.aud)
    ? payload.aud
    : [payload.aud];

  if (!aud.includes(scenario.audience)) {
    return json({
      ok: false,
      error: "ssf_audience_mismatch"
    }, 400);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const iat = Number(payload.iat);

  if (
    !Number.isFinite(iat) ||
    Math.abs(nowSec - iat) > 600
  ) {
    return json({
      ok: false,
      error: "ssf_iat_outside_window"
    }, 400);
  }

  const jti = safeText(payload.jti, 200);
  const subId = payload.sub_id;

  if (
    !jti ||
    !subId ||
    typeof subId !== "object" ||
    subId.format !== scenario.subject_format ||
    subId.id !== scenario.subject_id
  ) {
    return json({
      ok: false,
      error: "ssf_subject_mapping_mismatch"
    }, 400);
  }

  const event =
    payload.events?.[CAEP_SESSION_REVOKED];

  if (!event) {
    return json({
      ok: false,
      error: "caep_session_revoked_event_missing"
    }, 400);
  }

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      scenario.public_jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  } catch {
    return json({
      ok: false,
      error: "stored_public_jwk_invalid"
    }, 500);
  }

  const signatureOk = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    b64uBytes(parts[2]),
    new TextEncoder().encode(
      parts[0] + "." + parts[1]
    )
  );

  if (!signatureOk) {
    return json({
      ok: false,
      error: "invalid_set_signature"
    }, 400);
  }

  const replay = await rest(
    "gate_ssf_preview_events" +
      "?scenario_id=eq." +
      encodeURIComponent(scenarioId) +
      "&jti=eq." + encodeURIComponent(jti) +
      "&select=id&limit=1"
  );

  if (Array.isArray(replay) && replay.length) {
    return json({
      ok: false,
      error: "ssf_event_replay"
    }, 409);
  }

  const eventTsSec = Number(
    event.event_timestamp ?? payload.iat
  );

  if (!Number.isFinite(eventTsSec)) {
    return json({
      ok: false,
      error: "invalid_event_timestamp"
    }, 400);
  }

  const eventAt =
    new Date(eventTsSec * 1000).toISOString();
  const nextSeq = Number(scenario.source_seq || 0) + 1;

  await rest(
    "gate_ssf_preview_events",
    {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        scenario_id: scenarioId,
        jti,
        event_type: CAEP_SESSION_REVOKED,
        subject_format: subId.format,
        subject_id: subId.id,
        event_timestamp: eventAt
      })
    }
  );

  await rest(
    "gate_ssf_preview_scenarios" +
      "?id=eq." + encodeURIComponent(scenarioId),
    {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        edge_status: "REVOKED",
        source_seq: nextSeq,
        last_event_at: eventAt,
        revoked_at: eventAt
      })
    }
  );

  return json({
    ok: true,
    accepted: true,
    scenarioId,
    event: {
      type: CAEP_SESSION_REVOKED,
      jti,
      issuer: scenario.issuer,
      subject: subId,
      sequence: nextSeq,
      signatureVerified: true
    },
    authorityTransition: {
      edgeId: scenario.edge_id,
      status: "REVOKED"
    },
    productionV7Untouched: true
  }, 202);
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: H
    });
  }

  try {
    const path = new URL(req.url).pathname;

    if (
      req.method === "GET" &&
      path.endsWith("/health")
    ) {
      return json({
        ok: true,
        service: "gate-ssf-bridge-preview",
        profile: "OpenID SSF / CAEP 1.0",
        event: "session-revoked",
        productionV7Untouched: true
      });
    }

    if (
      req.method === "POST" &&
      path.endsWith("/scenarios")
    ) {
      return await createScenario(req);
    }

    if (
      req.method === "POST" &&
      path.endsWith("/verify")
    ) {
      return await verifyAuthority(req);
    }

    if (
      req.method === "POST" &&
      path.endsWith("/events/ssf")
    ) {
      return await ingestSsf(req);
    }

    return json({
      ok: false,
      error: "not_found"
    }, 404);
  } catch (error) {
    console.error(error);
    return json({
      ok: false,
      error: "internal_error"
    }, 500);
  }
});
