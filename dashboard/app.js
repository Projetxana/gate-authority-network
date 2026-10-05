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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

async function loadNpmMetrics(pkg) {
  const since = `${CONFIG.npmStartDate}:${todayISO()}`;
  const [week, month, total, range] = await Promise.all([
    getJSON(npmDownloadUrl("last-week", pkg)),
    getJSON(npmDownloadUrl("last-month", pkg)),
    getJSON(npmDownloadUrl(since, pkg)),
    getJSON(npmRangeUrl("last-month", pkg))
  ]);
  return {
    week: week.downloads ?? 0,
    month: month.downloads ?? 0,
    total: total.downloads ?? 0,
    daily: range.downloads ?? []
  };
}

async function loadGitHub() {
  return getJSON(`https://api.github.com/repos/${CONFIG.githubRepo}`);
}

async function loadRegistry() {
  const url = `https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(CONFIG.registryName)}`;
  const data = await getJSON(url);
  const entry = (data.servers || []).find((x) => x?.server?.name === CONFIG.registryName) || data.servers?.[0];
  if (!entry) throw new Error("GATE absent du Registry");
  return entry;
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

function renderMetrics(sdk, mcp, github, registry) {
  setText("sdk30", formatNumber(sdk.month));
  setText("sdk7", formatNumber(sdk.week));
  setText("sdkTotal", formatNumber(sdk.total));
  setText("mcp30", formatNumber(mcp.month));
  setText("mcp7", formatNumber(mcp.week));
  setText("mcpTotal", formatNumber(mcp.total));
  setText("funnelSdk", formatNumber(sdk.month));
  setText("funnelMcp", formatNumber(mcp.month));

  setText("stars", formatNumber(github.stargazers_count));
  setText("forks", formatNumber(github.forks_count));
  setText("issues", formatNumber(github.open_issues_count));
  setText("branch", github.default_branch || "—");

  const meta = registry?._meta?.["io.modelcontextprotocol.registry/official"] || {};
  setText("registryStatus", (meta.status || "active").toUpperCase());
  setText("registryVersion", registry?.server?.version || "—");
  const published = meta.publishedAt ? new Date(meta.publishedAt) : null;
  setText(
    "registryPublished",
    published
      ? `Publié le ${published.toLocaleDateString("fr-CA", { day: "2-digit", month: "short", year: "numeric" })}`
      : "Publication confirmée"
  );

  drawChart(sdk.daily, mcp.daily);
}

function drawChart(sdkDaily, mcpDaily) {
  const svg = $("downloadsChart");
  const width = 900, height = 270;
  const pad = { left: 42, right: 20, top: 20, bottom: 34 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const dateSet = new Set([
    ...sdkDaily.map(d => d.day),
    ...mcpDaily.map(d => d.day)
  ]);
  const dates = [...dateSet].sort();

  if (!dates.length) {
    svg.innerHTML = `<text x="450" y="135" text-anchor="middle" class="chart-loading">Pas encore de données npm quotidiennes.</text>`;
    return;
  }

  const sdkMap = new Map(sdkDaily.map(d => [d.day, d.downloads]));
  const mcpMap = new Map(mcpDaily.map(d => [d.day, d.downloads]));
  const sdkVals = dates.map(d => Number(sdkMap.get(d) || 0));
  const mcpVals = dates.map(d => Number(mcpMap.get(d) || 0));
  const maxY = Math.max(1, ...sdkVals, ...mcpVals);
  const yMax = Math.max(4, Math.ceil(maxY * 1.15));

  const x = (i) => pad.left + (dates.length === 1 ? innerW / 2 : (i / (dates.length - 1)) * innerW);
  const y = (v) => pad.top + innerH - (v / yMax) * innerH;

  const linePath = (vals) => vals.map((v, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const areaPath = (vals) => {
    const line = linePath(vals);
    return `${line} L ${x(vals.length - 1).toFixed(1)} ${(pad.top + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`;
  };

  let markup = "";
  const gridCount = 4;
  for (let i = 0; i <= gridCount; i++) {
    const val = Math.round((yMax / gridCount) * i);
    const gy = y(val);
    markup += `<line x1="${pad.left}" y1="${gy}" x2="${width-pad.right}" y2="${gy}" class="chart-grid"/>`;
    markup += `<text x="${pad.left-9}" y="${gy+4}" text-anchor="end" class="chart-axis-text">${val}</text>`;
  }

  const labelIndexes = [...new Set([0, Math.floor((dates.length-1)/2), dates.length-1])];
  for (const i of labelIndexes) {
    const d = new Date(`${dates[i]}T12:00:00`);
    const label = d.toLocaleDateString("fr-CA", { day: "2-digit", month: "short" });
    markup += `<text x="${x(i)}" y="${height-10}" text-anchor="${i===0?"start":i===dates.length-1?"end":"middle"}" class="chart-axis-text">${label}</text>`;
  }

  markup += `<path d="${areaPath(sdkVals)}" class="chart-sdk-area"/>`;
  markup += `<path d="${areaPath(mcpVals)}" class="chart-mcp-area"/>`;
  markup += `<path d="${linePath(sdkVals)}" class="chart-sdk"/>`;
  markup += `<path d="${linePath(mcpVals)}" class="chart-mcp"/>`;

  sdkVals.forEach((v, i) => {
    markup += `<circle cx="${x(i)}" cy="${y(v)}" r="2.8" fill="#1769e0"><title>SDK · ${dates[i]} · ${v}</title></circle>`;
  });
  mcpVals.forEach((v, i) => {
    markup += `<circle cx="${x(i)}" cy="${y(v)}" r="2.8" fill="#11a7a1"><title>MCP · ${dates[i]} · ${v}</title></circle>`;
  });

  svg.innerHTML = markup;
}

async function refreshDashboard() {
  const button = $("refreshButton");
  button.disabled = true;
  button.textContent = "Actualisation…";
  setText("globalStatus", "Chargement des sources…");
  $("globalStatus").className = "status-ok";

  try {
    const [sdk, mcp, github, registry] = await Promise.all([
      loadNpmMetrics(CONFIG.sdkPackage),
      loadNpmMetrics(CONFIG.mcpPackage),
      loadGitHub(),
      loadRegistry()
    ]);

    renderMetrics(sdk, mcp, github, registry);

    const now = new Date();
    setText("lastUpdated", now.toLocaleString("fr-CA", {
      dateStyle: "medium",
      timeStyle: "short"
    }));
    setText("footerTime", now.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }));
    setText("globalStatus", "Toutes les sources ont répondu");
    $("globalStatus").className = "status-ok";
  } catch (error) {
    console.error(error);
    setText("globalStatus", "Certaines données sont indisponibles");
    $("globalStatus").className = "status-warn";
  } finally {
    button.disabled = false;
    button.innerHTML = "<span>↻</span> Actualiser";
  }
}

$("refreshButton").addEventListener("click", refreshDashboard);
refreshDashboard();
setInterval(refreshDashboard, CONFIG.refreshMs);
