
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_BASE =
  `${SUPABASE_URL}/functions/v1/gate-sandbox`;
const DAILY_LIMIT = 500;
const DAILY_REGISTRATION_LIMIT = 500;
const DAILY_REGISTRATION_LIMIT_PER_IP = 10;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-gate-source, x-gate-client-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
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
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    console.error("supabase_rest_error", response.status, data);
    throw new Error(`supabase_rest_${response.status}`);
  }
  return data;
}

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function authenticate(req: Request) {
  const secret = bearer(req);
  if (!secret) return null;

  const result = await rest("rpc/gate_authenticate_api_key", {
    method: "POST",
    body: JSON.stringify({ p_secret: secret })
  });

  const row = Array.isArray(result) ? result[0] : null;
  return row?.project_id && row?.api_key_id
    ? { projectId: row.project_id, apiKeyId: row.api_key_id }
    : null;
}

function safeText(value: unknown, max = 256) {
  if (typeof value !== "string") return null;
  const out = value.trim();
  if (!out || out.length > max) return null;
  return out;
}

function sourceFrom(req: Request) {
  const value = (req.headers.get("x-gate-source") || "api").toLowerCase();
  return ["sdk", "mcp", "api", "internal", "unknown"].includes(value)
    ? value
    : "api";
}

function versionFrom(req: Request) {
  const value = req.headers.get("x-gate-client-version");
  return value ? value.slice(0, 80) : null;
}

function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  const candidate =
    req.headers.get("cf-connecting-ip") ||
    (forwarded ? forwarded.split(",")[0].trim() : null) ||
    req.headers.get("x-real-ip");
  return candidate || null;
}

async function dailyIpHash(day: string, ip: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SERVICE_ROLE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${day}|${ip}`)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function usageToday(projectId: string) {
  const day = new Date().toISOString().slice(0, 10);
  const rows = await rest(
    `gate_daily_usage?project_id=eq.${encodeURIComponent(projectId)}&day=eq.${day}&select=verification_count`
  );
  return Number(Array.isArray(rows) && rows[0]?.verification_count || 0);
}

async function recordEvent(
  identity: { projectId: string; apiKeyId: string },
  req: Request,
  input: {
    decision: "ALLOW" | "DENY" | "ERROR";
    authority: "VALID" | "INVALID" | "UNKNOWN" | null;
    consistency: "bounded" | "strict" | null;
    latencyMs: number | null;
    errorCode?: string | null;
  }
) {
  try {
    await rest("gate_verification_events", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        project_id: identity.projectId,
        api_key_id: identity.apiKeyId,
        source: sourceFrom(req),
        client_version: versionFrom(req),
        consistency: input.consistency,
        decision: input.decision,
        authority: input.authority,
        latency_ms: input.latencyMs,
        error_code: input.errorCode ?? null
      })
    });
  } catch (error) {
    console.error("telemetry_write_failed", error);
  }
}

function verifyGraph(
  principal: string,
  actor: string,
  edges: any[]
) {
  if (principal === actor) {
    return {
      authority: "VALID",
      decision: "ALLOW",
      principal,
      actor,
      selectedPath: [principal],
      validPathCount: 1,
      evaluatedPathCount: 1,
      paths: [
        {
          status: "VALID",
          nodePath: [principal],
          edgeIds: [],
          checks: []
        }
      ]
    };
  }

  const outgoing = new Map<string, any[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.issuer) || [];
    list.push(edge);
    outgoing.set(edge.issuer, list);
  }

  const queue: any[] = [
    {
      node: principal,
      nodePath: [principal],
      edgePath: [],
      visited: new Set([principal])
    }
  ];
  const candidates: any[] = [];
  const maxDepth = 12;

  while (queue.length) {
    const current = queue.shift();
    if (current.edgePath.length >= maxDepth) continue;

    for (const edge of outgoing.get(current.node) || []) {
      if (current.visited.has(edge.subject)) continue;

      const nodePath = [...current.nodePath, edge.subject];
      const edgePath = [...current.edgePath, edge];

      if (edge.subject === actor) {
        candidates.push({ nodePath, edgePath });
        continue;
      }

      const visited = new Set(current.visited);
      visited.add(edge.subject);
      queue.push({ node: edge.subject, nodePath, edgePath, visited });
    }
  }

  if (!candidates.length) {
    return {
      authority: "INVALID",
      decision: "DENY",
      reason: "no_authority_path",
      principal,
      actor,
      evaluatedPathCount: 0,
      paths: []
    };
  }

  const evaluated = candidates.map(({ nodePath, edgePath }) => {
    const checks = edgePath.map((edge: any) => ({
      edgeId: edge.edge_id,
      issuer: edge.issuer,
      subject: edge.subject,
      authorityStatus: edge.status,
      revokedAt: edge.revoked_at ?? null,
      reason: edge.reason ?? null
    }));

    if (edgePath.some((edge: any) => edge.status === "UNKNOWN")) {
      return {
        status: "UNKNOWN",
        reason: "authority_status_unknown",
        nodePath,
        edgeIds: edgePath.map((edge: any) => edge.edge_id),
        checks
      };
    }

    if (edgePath.some((edge: any) => edge.status === "REVOKED")) {
      return {
        status: "INVALID",
        reason: "upstream_authority_revoked",
        nodePath,
        edgeIds: edgePath.map((edge: any) => edge.edge_id),
        checks
      };
    }

    return {
      status: "VALID",
      reason: null,
      nodePath,
      edgeIds: edgePath.map((edge: any) => edge.edge_id),
      checks
    };
  });

  const valid = evaluated.find((path: any) => path.status === "VALID");

  if (valid) {
    return {
      authority: "VALID",
      decision: "ALLOW",
      principal,
      actor,
      selectedPath: valid.nodePath,
      selectedEdges: valid.edgeIds,
      validPathCount: evaluated.filter((p: any) => p.status === "VALID").length,
      evaluatedPathCount: evaluated.length,
      paths: evaluated
    };
  }

  if (evaluated.some((path: any) => path.status === "UNKNOWN")) {
    return {
      authority: "UNKNOWN",
      decision: "DENY",
      reason: "no_active_path_and_authority_state_unknown",
      principal,
      actor,
      evaluatedPathCount: evaluated.length,
      paths: evaluated
    };
  }

  return {
    authority: "INVALID",
    decision: "DENY",
    reason: "all_authority_paths_revoked_or_invalid",
    principal,
    actor,
    evaluatedPathCount: evaluated.length,
    paths: evaluated
  };
}

async function register(req: Request) {
  const today = new Date().toISOString().slice(0, 10);
  const registrations = await rest(
    `gate_sandbox_registrations?day=eq.${today}&select=id`
  );

  if (Array.isArray(registrations) && registrations.length >= DAILY_REGISTRATION_LIMIT) {
    return json(
      {
        ok: false,
        error: "daily_registration_limit_reached",
        limit: DAILY_REGISTRATION_LIMIT
      },
      429
    );
  }

  const ip = clientIp(req);
  const ipHash = ip ? await dailyIpHash(today, ip) : null;

  if (ipHash) {
    const byIp = await rest(
      `gate_sandbox_registrations?day=eq.${today}&ip_hash=eq.${ipHash}&select=id`
    );

    if (Array.isArray(byIp) && byIp.length >= DAILY_REGISTRATION_LIMIT_PER_IP) {
      return json(
        {
          ok: false,
          error: "daily_registration_limit_per_client_reached",
          limit: DAILY_REGISTRATION_LIMIT_PER_IP
        },
        429
      );
    }
  }

  let input: any = {};
  try {
    input = await req.json();
  } catch {
    input = {};
  }

  const displayName =
    safeText(input?.name, 80) || "GATE Sandbox Project";
  const slug =
    "sandbox-" + crypto.randomUUID().replaceAll("-", "").slice(0, 16);

  const projects = await rest("gate_projects", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      slug,
      display_name: displayName,
      plan: "sandbox",
      is_internal: false
    })
  });

  const project = Array.isArray(projects) ? projects[0] : null;
  if (!project?.id) throw new Error("project_create_failed");

  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const keys = await rest("rpc/gate_create_api_key", {
    method: "POST",
    body: JSON.stringify({
      p_project_id: project.id,
      p_name: "sandbox",
      p_expires_at: expiresAt
    })
  });

  const key = Array.isArray(keys) ? keys[0] : null;
  if (!key?.api_key_secret) throw new Error("key_create_failed");

  await rest("rpc/gate_seed_sandbox", {
    method: "POST",
    body: JSON.stringify({ p_project_id: project.id })
  });

  await rest("gate_sandbox_registrations", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      day: today,
      ip_hash: ipHash
    })
  });

  return json(
    {
      ok: true,
      mode: "developer-preview-sandbox",
      project: {
        id: project.id,
        name: displayName,
        expiresAt
      },
      apiKey: key.api_key_secret,
      endpoint: PUBLIC_BASE,
      limits: {
        verificationsPerDay: DAILY_LIMIT,
        registrationsPerDayGlobal: DAILY_REGISTRATION_LIMIT,
        registrationsPerClientPerDay: DAILY_REGISTRATION_LIMIT_PER_IP,
        keyLifetimeDays: 7
      },
      demo: {
        principal: "user:demo",
        actor: "agent:C@company-c",
        paths: [
          "user:demo → agent:A@company-a → agent:C@company-c",
          "user:demo → agent:B@company-b → agent:C@company-c"
        ]
      },
      next: {
        verify: `${PUBLIC_BASE}/v1/authority/verify`,
        status: `${PUBLIC_BASE}/sandbox/status`,
        revoke: `${PUBLIC_BASE}/sandbox/revoke`,
        reset: `${PUBLIC_BASE}/sandbox/reset`
      }
    },
    201
  );
}

async function requireIdentity(req: Request) {
  const identity = await authenticate(req);
  if (!identity) {
    return {
      response: json({ ok: false, error: "invalid_api_key" }, 401),
      identity: null
    };
  }
  return { response: null, identity };
}

async function verify(req: Request) {
  const auth = await requireIdentity(req);
  if (!auth.identity) return auth.response!;

  const count = await usageToday(auth.identity.projectId);
  if (count >= DAILY_LIMIT) {
    return json(
      {
        ok: false,
        error: "daily_sandbox_limit_reached",
        limit: DAILY_LIMIT
      },
      429
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const principal = safeText(body?.principal);
  const actor = safeText(body?.actor);
  const consistency =
    body?.consistency == null
      ? "bounded"
      : String(body.consistency).toLowerCase();

  if (!principal || !actor) {
    return json(
      { ok: false, error: "principal_and_actor_required" },
      400
    );
  }

  if (!["bounded", "strict"].includes(consistency)) {
    return json({ ok: false, error: "invalid_consistency" }, 400);
  }

  const started = performance.now();

  const edges = await rest(
    `gate_sandbox_edges?project_id=eq.${encodeURIComponent(
      auth.identity.projectId
    )}&select=edge_id,issuer,subject,status,updated_at,revoked_at,reason`
  );

  const out: any = verifyGraph(principal, actor, edges);
  const latencyMs = Math.max(0, Math.round(performance.now() - started));

  const evaluationEstablished = out.authority !== "UNKNOWN";

  const result = {
    ...out,
    consistency,
    servedBy: "gate-network:developer-preview-sandbox",
    sandbox: true,
    evaluation: {
      established: evaluationEstablished,
      source: "sandbox-canonical",
      fresh: true,
      ageMs: 0
    }
  };

  await recordEvent(auth.identity, req, {
    decision: result.decision,
    authority: result.authority,
    consistency: consistency as "bounded" | "strict",
    latencyMs
  });

  return json(result);
}

async function sandboxStatus(req: Request) {
  const auth = await requireIdentity(req);
  if (!auth.identity) return auth.response!;

  const edges = await rest(
    `gate_sandbox_edges?project_id=eq.${encodeURIComponent(
      auth.identity.projectId
    )}&select=edge_id,issuer,subject,status,updated_at,revoked_at,reason&order=edge_id.asc`
  );

  return json({
    ok: true,
    mode: "developer-preview-sandbox",
    principal: "user:demo",
    actor: "agent:C@company-c",
    edges
  });
}

async function revoke(req: Request) {
  const auth = await requireIdentity(req);
  if (!auth.identity) return auth.response!;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const path = String(body?.path || "").toUpperCase();
  if (!["A", "B"].includes(path)) {
    return json({ ok: false, error: "path_must_be_A_or_B" }, 400);
  }

  const edgeId = path === "A" ? "demo-human-a" : "demo-human-b";
  const now = new Date().toISOString();

  await rest(
    `gate_sandbox_edges?project_id=eq.${encodeURIComponent(
      auth.identity.projectId
    )}&edge_id=eq.${edgeId}`,
    {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        status: "REVOKED",
        updated_at: now,
        revoked_at: now,
        reason: `sandbox_revoked_path_${path}`
      })
    }
  );

  return json({ ok: true, path, status: "REVOKED" });
}

async function reset(req: Request) {
  const auth = await requireIdentity(req);
  if (!auth.identity) return auth.response!;

  await rest("rpc/gate_seed_sandbox", {
    method: "POST",
    body: JSON.stringify({ p_project_id: auth.identity.projectId })
  });

  return json({ ok: true, status: "RESET" });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    const path = new URL(req.url).pathname;

    if (req.method === "GET" && path.endsWith("/health")) {
      return json({
        ok: true,
        service: "gate-network",
        mode: "developer-preview-sandbox",
        apiVersion: "v1",
        telemetry: true,
        limits: {
          verificationsPerProjectPerDay: DAILY_LIMIT,
          registrationsPerDayGlobal: DAILY_REGISTRATION_LIMIT,
          registrationsPerClientPerDay: DAILY_REGISTRATION_LIMIT_PER_IP,
          keyLifetimeDays: 7
        }
      });
    }

    if (req.method === "POST" && path.endsWith("/projects/register")) {
      return await register(req);
    }

    if (
      req.method === "POST" &&
      path.endsWith("/v1/authority/verify")
    ) {
      return await verify(req);
    }

    if (
      req.method === "GET" &&
      path.endsWith("/sandbox/status")
    ) {
      return await sandboxStatus(req);
    }

    if (
      req.method === "POST" &&
      path.endsWith("/sandbox/revoke")
    ) {
      return await revoke(req);
    }

    if (
      req.method === "POST" &&
      path.endsWith("/sandbox/reset")
    ) {
      return await reset(req);
    }

    return json({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
