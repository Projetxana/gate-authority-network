const CONFIG = {
  npmMetricsEndpoint: "/api/npm-stats",
  usageMetricsEndpoint: "https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-metrics/summary",
  githubRepo: "Projetxana/gate-authority-network",
  registryName: "io.github.Projetxana/gate-authority-network",
  refreshMs: 5 * 60 * 1000
};

const $ = (id) => document.getElementById(id);
const numberFmt = new Intl.NumberFormat("fr-CA");

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? numberFmt.format(Number(value)) : "—";
}

async function getJSON(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function loadNpmMetrics() {
  return getJSON(CONFIG.npmMetricsEndpoint);
}

async function loadGitHub() {
  return getJSON(`https://api.github.com/repos/${CONFIG.githubRepo}`);
}

async function loadUsageMetrics() {
  return getJSON(CONFIG.usageMetricsEndpoint);
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
  if (!sdk?.ok) return;
  setText("sdk30", formatNumber(sdk.month));
  setText("sdk7", formatNumber(sdk.week));
  setText("sdkTotal", formatNumber(sdk.total));
  setText("funnelSdk", formatNumber(sdk.month));
}

function renderMcp(mcp) {
  if (!mcp?.ok) return;
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

function renderUsage(data) {
  if (!data?.ok || !data?.summary) return;

  const s = data.summary;
  const previewActivated = Number(s.preview_activated_projects || 0);
  const pilotActivated = Number(s.pilot_activated_projects || 0);
  const paidActivated = Number(s.paid_activated_projects || 0);
  const today = Number(s.verifications_today || 0);
  const last30 = Number(s.verifications_30d || 0);
  const preview30 = Number(s.preview_verifications_30d || 0);
  const pilotPaid30 = Number(s.pilot_paid_verifications_30d || 0);

  setText("previewActivatedProjects", formatNumber(previewActivated));
  setText("pilotActivatedProjects", formatNumber(pilotActivated));
  setText("paidActivatedProjects", formatNumber(paidActivated));
  setText("verificationsToday", formatNumber(today));
  setText("usage30", `${formatNumber(last30)} vérifications / 30 j`);
  setText("usageMix", `Preview ${formatNumber(preview30)} · Pilot/paid ${formatNumber(pilotPaid30)}`);
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
    (dates.length === 1
      ? innerW / 2
      : (i / (dates.length - 1)) * innerW);

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
      `text-anchor="${
        i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"
      }" class="chart-axis-text">${label}</text>`;
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
    loadNpmMetrics(),
    loadGitHub(),
    loadRegistry(),
    loadUsageMetrics()
  ]);

  const [npmResult, githubResult, registryResult, usageResult] = results;

  const npm =
    npmResult.status === "fulfilled" ? npmResult.value : null;
  const github =
    githubResult.status === "fulfilled" ? githubResult.value : null;
  const registry =
    registryResult.status === "fulfilled" ? registryResult.value : null;
  const usage =
    usageResult.status === "fulfilled" ? usageResult.value : null;

  renderSdk(npm?.sdk);
  renderMcp(npm?.mcp);
  renderGitHub(github);
  renderRegistry(registry);
  renderUsage(usage);
  drawChart(
    npm?.sdk?.ok ? npm.sdk.daily ?? [] : [],
    npm?.mcp?.ok ? npm.mcp.daily ?? [] : []
  );

  if (npmResult.status === "rejected") {
    console.warn("Backend npm indisponible:", npmResult.reason);
  }
  if (githubResult.status === "rejected") {
    console.warn("GitHub indisponible:", githubResult.reason);
  }
  if (registryResult.status === "rejected") {
    console.warn("MCP Registry indisponible:", registryResult.reason);
  }
  if (usageResult.status === "rejected") {
    console.warn("Télémétrie GATE indisponible:", usageResult.reason);
  }

  const sourceStates = [
    Boolean(npm?.sdk?.ok),
    Boolean(npm?.mcp?.ok),
    Boolean(github),
    Boolean(registry),
    Boolean(usage?.ok)
  ];
  const okCount = sourceStates.filter(Boolean).length;

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

  if (okCount === 5) {
    setText("globalStatus", "Toutes les sources ont répondu");
    $("globalStatus").className = "status-ok";
  } else if (okCount > 0) {
    setText("globalStatus", `${okCount}/5 sources disponibles`);
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
