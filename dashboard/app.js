const CONFIG = {
  npmStartDate: "2026-10-04",
  sdkPackage: "@gate-avn/sdk",
  mcpPackage: "@gate-avn/mcp",
  githubRepo: "Projetxana/gate-authority-network",
  registryName: "io.github.Projetxana/gate-authority-network",
  refreshMs: 5 * 60 * 1000
};

const $ = (id) => document.getElementById(id);
const numberFmt = new Intl.NumberFormat("fr-CA");

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? numberFmt.format(Number(value)) : "—";
}

function yesterdayISO() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function npmDownloadUrl(period, pkg) {
  return `https://api.npmjs.org/downloads/point/${period}/${encodeURIComponent(pkg)}`;
}

function npmRangeUrl(period, pkg) {
  return `https://api.npmjs.org/downloads/range/${period}/${encodeURIComponent(pkg)}`;
}

async function getJSON(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function safeJSON(url, fallback) {
  try {
    return await getJSON(url);
  } catch (error) {
    console.warn("Source indisponible:", url, error);
    return fallback;
  }
}

async function loadNpmMetrics(pkg) {
  const end = yesterdayISO();
  const totalPromise =
    CONFIG.npmStartDate <= end
      ? safeJSON(
          npmDownloadUrl(`${CONFIG.npmStartDate}:${end}`, pkg),
          { downloads: null }
        )
      : Promise.resolve({ downloads: 0 });

  const [week, month, total, range] = await Promise.all([
    safeJSON(npmDownloadUrl("last-week", pkg), { downloads: null }),
    safeJSON(npmDownloadUrl("last-month", pkg), { downloads: null }),
    totalPromise,
    safeJSON(npmRangeUrl("last-month", pkg), { downloads: [] })
  ]);

  const hasAnyData =
    week.downloads !== null ||
    month.downloads !== null ||
    total.downloads !== null ||
    (range.downloads && range.downloads.length > 0);

  if (!hasAnyData) {
    throw new Error(`npm indisponible pour ${pkg}`);
  }

  return {
    week: week.downloads,
    month: month.downloads,
    total: total.downloads,
    daily: range.downloads ?? []
  };
}

async function loadGitHub() {
  return getJSON(`https://api.github.com/repos/${CONFIG.githubRepo}`);
}

async function loadRegistry() {
  const url =
    `https://registry.modelcontextprotocol.io/v0.1/servers?search=` +
    encodeURIComponent(CONFIG.registryName);

  const data = await getJSON(url);
  const entry =
    (data.servers || []).find((x) => x?.server?.name === CONFIG.registryName) ||
    data.servers?.[0];

  if (!entry) throw new Error("GATE absent du Registry");
  return entry;
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

function renderSdk(sdk) {
  if (!sdk) return;
  setText("sdk30", formatNumber(sdk.month));
  setText("sdk7", formatNumber(sdk.week));
  setText("sdkTotal", formatNumber(sdk.total));
  setText("funnelSdk", formatNumber(sdk.month));
}

function renderMcp(mcp) {
  if (!mcp) return;
  setText("mcp30", formatNumber(mcp.month));
  setText("mcp7", formatNumber(mcp.week));
  setText("mcpTotal", formatNumber(mcp.total));
  setText("funnelMcp", formatNumber(mcp.month));
}

function renderGitHub(github) {
  if (!github) return;
  setText("stars", formatNumber(github.stargazers_count));
  setText("forks", formatNumber(github.forks_count));
  setText("issues", formatNumber(github.open_issues_count));
  setText("branch", github.default_branch || "—");
}

function renderRegistry(registry) {
  if (!registry) return;

  const meta =
    registry?._meta?.["io.modelcontextprotocol.registry/official"] || {};

  setText("registryStatus", (meta.status || "active").toUpperCase());
  setText("registryVersion", registry?.server?.version || "—");

  const published = meta.publishedAt ? new Date(meta.publishedAt) : null;
  setText(
    "registryPublished",
    published
      ? `Publié le ${published.toLocaleDateString("fr-CA", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        })}`
      : "Publication confirmée"
  );
}

function drawChart(sdkDaily = [], mcpDaily = []) {
  const svg = $("downloadsChart");
  if (!svg) return;

  const width = 900;
  const height = 270;
  const pad = { left: 42, right: 20, top: 20, bottom: 34 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const dateSet = new Set([
    ...sdkDaily.map((d) => d.day),
    ...mcpDaily.map((d) => d.day)
  ]);
  const dates = [...dateSet].sort();

  if (!dates.length) {
    svg.innerHTML =
      '<text x="450" y="135" text-anchor="middle" class="chart-loading">' +
      "Pas encore de données npm quotidiennes." +
      "</text>";
    return;
  }

  const sdkMap = new Map(sdkDaily.map((d) => [d.day, d.downloads]));
  const mcpMap = new Map(mcpDaily.map((d) => [d.day, d.downloads]));
  const sdkVals = dates.map((d) => Number(sdkMap.get(d) || 0));
  const mcpVals = dates.map((d) => Number(mcpMap.get(d) || 0));
  const maxY = Math.max(1, ...sdkVals, ...mcpVals);
  const yMax = Math.max(4, Math.ceil(maxY * 1.15));

  const x = (i) =>
    pad.left +
    (dates.length === 1 ? innerW / 2 : (i / (dates.length - 1)) * innerW);

  const y = (v) => pad.top + innerH - (v / yMax) * innerH;

  const linePath = (vals) =>
    vals
      .map(
        (v, i) =>
          `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`
      )
      .join(" ");

  const areaPath = (vals) => {
    if (!vals.length) return "";
    const line = linePath(vals);
    return `${line} L ${x(vals.length - 1).toFixed(1)} ${
      pad.top + innerH
    } L ${x(0).toFixed(1)} ${pad.top + innerH} Z`;
  };

  let markup = "";
  const gridCount = 4;

  for (let i = 0; i <= gridCount; i++) {
    const val = Math.round((yMax / gridCount) * i);
    const gy = y(val);

    markup +=
      `<line x1="${pad.left}" y1="${gy}" x2="${width - pad.right}" ` +
      `y2="${gy}" class="chart-grid"/>`;

    markup +=
      `<text x="${pad.left - 9}" y="${gy + 4}" text-anchor="end" ` +
      `class="chart-axis-text">${val}</text>`;
  }

  const labelIndexes = [
    ...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])
  ];

  for (const i of labelIndexes) {
    const d = new Date(`${dates[i]}T12:00:00`);
    const label = d.toLocaleDateString("fr-CA", {
      day: "2-digit",
      month: "short"
    });

    markup +=
      `<text x="${x(i)}" y="${height - 10}" ` +
      `text-anchor="${i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"}" ` +
      `class="chart-axis-text">${label}</text>`;
  }

  if (sdkVals.length) {
    markup += `<path d="${areaPath(sdkVals)}" class="chart-sdk-area"/>`;
    markup += `<path d="${linePath(sdkVals)}" class="chart-sdk"/>`;
  }

  if (mcpVals.length) {
    markup += `<path d="${areaPath(mcpVals)}" class="chart-mcp-area"/>`;
    markup += `<path d="${linePath(mcpVals)}" class="chart-mcp"/>`;
  }

  svg.innerHTML = markup;
}

async function refreshDashboard() {
  const button = $("refreshButton");
  button.disabled = true;
  button.textContent = "Actualisation…";

  setText("globalStatus", "Chargement des sources…");
  $("globalStatus").className = "status-ok";

  const results = await Promise.allSettled([
    loadNpmMetrics(CONFIG.sdkPackage),
    loadNpmMetrics(CONFIG.mcpPackage),
    loadGitHub(),
    loadRegistry()
  ]);

  const [sdkResult, mcpResult, githubResult, registryResult] = results;

  const sdk = sdkResult.status === "fulfilled" ? sdkResult.value : null;
  const mcp = mcpResult.status === "fulfilled" ? mcpResult.value : null;
  const github =
    githubResult.status === "fulfilled" ? githubResult.value : null;
  const registry =
    registryResult.status === "fulfilled" ? registryResult.value : null;

  renderSdk(sdk);
  renderMcp(mcp);
  renderGitHub(github);
  renderRegistry(registry);
  drawChart(sdk?.daily ?? [], mcp?.daily ?? []);

  const names = ["npm SDK", "npm MCP", "GitHub", "MCP Registry"];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn(`${names[index]} indisponible:`, result.reason);
    }
  });

  const now = new Date();
  setText(
    "lastUpdated",
    now.toLocaleString("fr-CA", {
      dateStyle: "medium",
      timeStyle: "short"
    })
  );
  setText(
    "footerTime",
    now.toLocaleTimeString("fr-CA", {
      hour: "2-digit",
      minute: "2-digit"
    })
  );

  const okCount = results.filter((r) => r.status === "fulfilled").length;

  if (okCount === results.length) {
    setText("globalStatus", "Toutes les sources ont répondu");
    $("globalStatus").className = "status-ok";
  } else if (okCount > 0) {
    setText("globalStatus", `${okCount}/${results.length} sources disponibles`);
    $("globalStatus").className = "status-warn";
  } else {
    setText("globalStatus", "Sources publiques indisponibles");
    $("globalStatus").className = "status-warn";
  }

  button.disabled = false;
  button.innerHTML = "<span>↻</span> Actualiser";
}

$("refreshButton").addEventListener("click", refreshDashboard);

refreshDashboard();
setInterval(refreshDashboard, CONFIG.refreshMs);
