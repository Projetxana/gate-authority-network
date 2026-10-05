const PACKAGES = {
  sdk: "@gate-avn/sdk",
  mcp: "@gate-avn/mcp",
};

const START_DATE = "2026-10-04";

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

async function getNpm(path) {
  const response = await fetch(`https://api.npmjs.org${path}`, {
    headers: {
      accept: "application/json",
      "user-agent": "gate-adoption-dashboard/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`npm ${response.status} for ${path}`);
  }

  return response.json();
}

async function getPackageMetrics(pkg) {
  const encoded = encodeURIComponent(pkg);
  const today = isoDate(new Date());

  const [week, month, total, range] = await Promise.all([
    getNpm(`/downloads/point/last-week/${encoded}`),
    getNpm(`/downloads/point/last-month/${encoded}`),
    getNpm(`/downloads/point/${START_DATE}:${today}/${encoded}`),
    getNpm(`/downloads/range/last-month/${encoded}`),
  ]);

  return {
    package: pkg,
    week: week.downloads ?? 0,
    month: month.downloads ?? 0,
    total: total.downloads ?? 0,
    daily: range.downloads ?? [],
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const [sdkResult, mcpResult] = await Promise.allSettled([
    getPackageMetrics(PACKAGES.sdk),
    getPackageMetrics(PACKAGES.mcp),
  ]);

  const sdk =
    sdkResult.status === "fulfilled"
      ? { ok: true, ...sdkResult.value }
      : { ok: false, error: String(sdkResult.reason?.message || sdkResult.reason) };

  const mcp =
    mcpResult.status === "fulfilled"
      ? { ok: true, ...mcpResult.value }
      : { ok: false, error: String(mcpResult.reason?.message || mcpResult.reason) };

  const ok = sdk.ok || mcp.ok;

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
  return res.status(ok ? 200 : 502).json({
    ok,
    generatedAt: new Date().toISOString(),
    sdk,
    mcp,
  });
};
