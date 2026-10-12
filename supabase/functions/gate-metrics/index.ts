
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders
  });
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`supabase_rest_${response.status}:${typeof data === "string" ? data : JSON.stringify(data)}`);
  }

  return data;
}

async function authenticateGateKey(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const result = await rest("rpc/gate_authenticate_api_key", {
    method: "POST",
    body: JSON.stringify({ p_secret: match[1] })
  });

  const row = Array.isArray(result) ? result[0] : null;
  if (!row?.project_id || !row?.api_key_id) return null;

  return {
    projectId: row.project_id,
    apiKeyId: row.api_key_id
  };
}

function validateEvent(input: any) {
  const decision = String(input?.decision || "").toUpperCase();
  const authority =
    input?.authority == null ? null : String(input.authority).toUpperCase();
  const source = String(input?.source || "api").toLowerCase();
  const consistency =
    input?.consistency == null ? null : String(input.consistency).toLowerCase();

  if (!["ALLOW", "DENY", "ERROR"].includes(decision)) {
    throw new Error("invalid_decision");
  }

  if (
    authority !== null &&
    !["VALID", "INVALID", "UNKNOWN"].includes(authority)
  ) {
    throw new Error("invalid_authority");
  }

  if (!["sdk", "mcp", "api", "internal", "unknown"].includes(source)) {
    throw new Error("invalid_source");
  }

  if (
    consistency !== null &&
    !["bounded", "strict"].includes(consistency)
  ) {
    throw new Error("invalid_consistency");
  }

  const latencyMs =
    input?.latency_ms == null ? null : Number(input.latency_ms);

  if (
    latencyMs !== null &&
    (!Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > 3600000)
  ) {
    throw new Error("invalid_latency_ms");
  }

  const clientVersion =
    input?.client_version == null
      ? null
      : String(input.client_version).slice(0, 80);

  const errorCode =
    input?.error_code == null
      ? null
      : String(input.error_code).slice(0, 120);

  return {
    decision,
    authority,
    source,
    consistency,
    latency_ms: latencyMs == null ? null : Math.round(latencyMs),
    client_version: clientVersion,
    error_code: errorCode
  };
}


function boundedText(value: unknown, max: number) {
  if (value == null) return null;
  const out = String(value).trim();
  if (!out || out.length > max) return null;
  return out;
}

function validateVerifiedEffect(input: any) {
  const event = String(input?.event || "");
  const verificationId = boundedText(
    input?.verificationId ?? input?.verification_id,
    128
  );
  const protocol = String(input?.protocol || "unknown").toLowerCase();
  const operation = boundedText(input?.operation, 160);
  const decision = String(input?.decision || "").toUpperCase();
  const authority =
    input?.authority == null ? null : String(input.authority).toUpperCase();
  const consistency =
    input?.consistency == null ? null : String(input.consistency).toLowerCase();

  if (event !== "gate.verified_effect") {
    throw new Error("invalid_event_type");
  }

  if (!verificationId || !/^gv_[A-Za-z0-9_-]{8,120}$/.test(verificationId)) {
    throw new Error("invalid_verification_id");
  }

  if (
    ![
      "mcp",
      "http",
      "x402",
      "authzen",
      "a2a",
      "ap2",
      "oauth",
      "internal",
      "unknown"
    ].includes(protocol)
  ) {
    throw new Error("invalid_protocol");
  }

  if (!operation) throw new Error("invalid_operation");

  if (!["ALLOW", "DENY", "ERROR"].includes(decision)) {
    throw new Error("invalid_decision");
  }

  if (
    authority !== null &&
    !["VALID", "INVALID", "UNKNOWN"].includes(authority)
  ) {
    throw new Error("invalid_authority");
  }

  if (
    consistency !== null &&
    !["bounded", "strict"].includes(consistency)
  ) {
    throw new Error("invalid_consistency");
  }

  return {
    verification_id: verificationId,
    protocol,
    operation,
    authority,
    decision,
    receipt_version: boundedText(
      input?.receiptVersion ?? input?.receipt_version,
      80
    ),
    consistency,
    served_by: boundedText(input?.servedBy ?? input?.served_by, 120),
    region: boundedText(input?.region, 80)
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const route = url.pathname.split("/").filter(Boolean).pop();

    if (req.method === "GET" && route === "health") {
      return json({
        ok: true,
        service: "gate-metrics",
        version: 2,
        privacy: "aggregate-only-public",
        verifiedEffects: true
      });
    }

    if (req.method === "GET" && route === "summary") {
      const [summary, daily, verifiedEffects, verifiedDaily] =
        await Promise.all([
          rest("gate_adoption_summary?select=*"),
          rest(
            "gate_adoption_daily?select=day,verifications,allow_count,deny_count,unknown_count,error_count,active_projects,avg_latency_ms&order=day.asc&limit=30"
          ),
          rest("gate_verified_effects_summary?select=*"),
          rest(
            "gate_verified_effects_daily?select=day,protocol,verified_effects,allow_count,deny_count,unknown_count,error_count,active_projects&order=day.asc&limit=270"
          )
        ]);

      return json({
        ok: true,
        generatedAt: new Date().toISOString(),
        summary: Array.isArray(summary) ? summary[0] ?? null : summary,
        daily: Array.isArray(daily) ? daily : [],
        verifiedEffects:
          Array.isArray(verifiedEffects)
            ? verifiedEffects[0] ?? null
            : verifiedEffects,
        verifiedEffectsDaily:
          Array.isArray(verifiedDaily) ? verifiedDaily : []
      });
    }

    if (req.method === "POST" && route === "events") {
      const identity = await authenticateGateKey(req);
      if (!identity) {
        return json({ ok: false, error: "invalid_api_key" }, 401);
      }

      let input: any;
      try {
        input = await req.json();
      } catch {
        return json({ ok: false, error: "invalid_json" }, 400);
      }

      let event;
      try {
        event = validateEvent(input);
      } catch (error) {
        return json({
          ok: false,
          error: error instanceof Error ? error.message : "invalid_event"
        }, 400);
      }

      const inserted = await rest("gate_verification_events", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({
          project_id: identity.projectId,
          api_key_id: identity.apiKeyId,
          ...event
        })
      });

      const row = Array.isArray(inserted) ? inserted[0] : null;

      return json({
        ok: true,
        event_id: row?.id ?? null,
        request_id: row?.request_id ?? null
      }, 201);
    }


    if (req.method === "POST" && route === "verified-effects") {
      const identity = await authenticateGateKey(req);
      if (!identity) {
        return json({ ok: false, error: "invalid_api_key" }, 401);
      }

      let input: any;
      try {
        input = await req.json();
      } catch {
        return json({ ok: false, error: "invalid_json" }, 400);
      }

      let event;
      try {
        event = validateVerifiedEffect(input);
      } catch (error) {
        return json({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "invalid_verified_effect"
        }, 400);
      }

      const inserted = await rest(
        "gate_verified_effect_events?on_conflict=project_id,verification_id",
        {
          method: "POST",
          headers: {
            prefer: "resolution=ignore-duplicates,return=representation"
          },
          body: JSON.stringify({
            project_id: identity.projectId,
            api_key_id: identity.apiKeyId,
            ...event
          })
        }
      );

      const row = Array.isArray(inserted) ? inserted[0] : null;

      return json({
        ok: true,
        metered: true,
        verification_id: event.verification_id,
        event_id: row?.id ?? null,
        deduplicated: !row
      }, row ? 201 : 200);
    }

    return json({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    console.error(error);
    return json({
      ok: false,
      error: "internal_error"
    }, 500);
  }
});
