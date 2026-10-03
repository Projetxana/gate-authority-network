export async function readText(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJson(req) {
  const text = await readText(req);
  return text ? JSON.parse(text) : {};
}

export function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) });
  res.end(data);
}

export async function requestJson(url, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { rawText: text }; }
  if (!response.ok) {
    const error = new Error(data?.error ?? data?.err ?? `HTTP ${response.status}`);
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return data;
}

export function postJson(url, body) { return requestJson(url, { method: 'POST', body }); }

export async function pushSet(url, set) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/secevent+jwt', 'accept': 'application/json' },
    body: set
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { rawText: text }; }
  }
  if (response.status !== 202) {
    const error = new Error(data?.err ?? `SET push HTTP ${response.status}`);
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return { accepted: true, status: response.status };
}
