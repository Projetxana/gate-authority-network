const PACKAGES = {
  sdk: "@gate-avn/sdk",
  mcp: "@gate-avn/mcp",
};

const START_DATE = "2026-10-04";

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      "user-agent": "gate-adoption-dashboard/0.1",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return { ok: response.ok, status: response.status, data };
}

async function packageExists(pkg) {
  const encoded = encodeURIComponent(pkg);
  const result = await fetchJSON(`https://registry.npmjs.org/${encoded}`);

  if (!result.ok) {
    throw new Error(`npm registry ${result.status} for ${pkg}`);
  }

  return true;
}

async function safeDownloads(path, fallback) {
  const result = await fetchJSON(`https://api.npmjs.org${path}`);

  if (result.ok) {
    return result.data;
  }

  // npm's download API can return 404 while download statistics for a newly
  // published package are not available yet. The package's existence is
  // verified separately against the npm registry before we get here.
  if (result.status === 404) {
    return fallback;
  }

  throw new Error(`npm downloads ${result.status} for ${path}`);
}

async function getPackageMetrics(pkg) {
  await packageExists(pkg);

  const encoded = encodeURIComponent(pkg);

  const [week, month, range] = await Promise.all([
    safeDownloads(`/downloads/point/last-week/${encoded}`, {
      downloads: 0,
      unavailable: true,
    }),
    safeDownloads(`/downloads/point/last-month/${encoded}`, {
      downloads: 0,
      unavailable: true,
    }),
    safeDownloads(`/downloads/range/last-month/${encoded}`, {
      downloads: [],
      unavailable: true,
    }),
  ]);

  const daily = Array.isArray(range.downloads) ? range.downloads : [];

  // Since GATE was first published within the current 30-day window,
  // summing the daily series from START_DATE is the safest "since publication"
  // count and avoids npm's date-range endpoint returning 404 for a brand-new
  // package / current UTC day.
  const totalFromDaily = daily
    .filter((item) => item.day >= START_DATE)
    .reduce((sum, item) => sum + Number(item.downloads || 0), 0);

  const total =
    daily.length > 0
      ? totalFromDaily
      : Number(month.downloads || 0);

  return {
    package: pkg,
    week: Number(week.downloads || 0),
    month: Number(month.downloads || 0),
    total,
    daily,
    statsPending:
      Boolean(week.unavailable) ||
      Boolean(month.unavailable) ||
      Boolean(range.unavailable),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed",
    });
  }

  const [sdkResult, mcpResult] = await Promise.allSettled([
    getPackageMetrics(PACKAGES.sdk),
    getPackageMetrics(PACKAGES.mcp),
  ]);

  const sdk =
    sdkResult.status === "fulfilled"
      ? { ok: true, ...sdkResult.value }
      : {
          ok: false,
          error: String(sdkResult.reason?.message || sdkResult.reason),
        };

  const mcp =
    mcpResult.status === "fulfilled"
      ? { ok: true, ...mcpResult.value }
      : {
          ok: false,
          error: String(mcpResult.reason?.message || mcpResult.reason),
        };

  const ok = sdk.ok || mcp.ok;

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");

  return res.status(ok ? 200 : 502).json({
    ok,
    generatedAt: new Date().toISOString(),
    sdk,
    mcp,
  });
};
