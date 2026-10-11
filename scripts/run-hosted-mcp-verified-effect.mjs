import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const endpoint = process.env.GATE_URL;
const apiKey = process.env.GATE_API_KEY;
const metricsEndpoint = process.env.GATE_METRICS_URL;

if (!endpoint) throw new Error('GATE_URL is required');
if (!apiKey) throw new Error('GATE_API_KEY is required');
if (!metricsEndpoint) throw new Error('GATE_METRICS_URL is required');

async function verifiedEffectsToday() {
  const response = await fetch(`${metricsEndpoint.replace(/\/$/, '')}/summary`, {
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Metrics summary HTTP ${response.status}`);
  const body = await response.json();
  return Number(body?.verifiedEffects?.verified_effects_today ?? 0);
}

const networkCountBefore = await verifiedEffectsToday();

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const serverPath = path.join(root, 'examples', 'mcp-hosted-effect-boundary-server.mjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-hosted-effect-'));
const effectFile = path.join(dir, 'effect.log');

const env = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  ),
  GATE_URL: endpoint,
  GATE_API_KEY: apiKey,
  GATE_METRICS_URL: metricsEndpoint,
  GATE_EFFECT_FILE: effectFile
};

const client = new Client(
  { name: 'gate-network-v1-stage3-smoke', version: '1.0.0' },
  { versionNegotiation: { mode: 'auto' } }
);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  env
});

function jsonFromToolResult(result) {
  const text = result.content?.find(item => item.type === 'text')?.text;
  if (!text) throw new Error('missing text tool result');
  return JSON.parse(text);
}

try {
  await client.connect(transport);

  const result = await client.callTool({
    name: 'network_v1_write_effect',
    arguments: { value: 'hosted-gate-verified-effect' }
  });

  const body = jsonFromToolResult(result);

  if (result.isError === true) {
    throw new Error(
      `Hosted GATE blocked the effect: ${body?.decision?.authority ?? 'UNKNOWN'} / ${body?.decision?.decision ?? 'DENY'}`
    );
  }

  if (body?.decision?.decision !== 'ALLOW') {
    throw new Error(`Expected ALLOW, got ${body?.decision?.decision}`);
  }

  if (body?.result?.executed !== true) {
    throw new Error('Effect callback did not execute');
  }

  if (body?.networkMetering?.sent !== true || body?.networkMetering?.metered !== true) {
    throw new Error(
      `Verified Effect was not persisted by GATE Network: ${JSON.stringify(body?.networkMetering)}`
    );
  }

  const networkCountAfter = await verifiedEffectsToday();
  if (networkCountAfter < networkCountBefore + 1) {
    throw new Error(
      `Network Verified Effects counter did not advance: before=${networkCountBefore} after=${networkCountAfter}`
    );
  }

  const effectValue = fs.readFileSync(effectFile, 'utf8').trim();
  if (effectValue !== 'hosted-gate-verified-effect') {
    throw new Error('Effect file did not contain expected value');
  }

  const counterResult = await client.callTool({
    name: 'gate_verified_effects',
    arguments: {}
  });
  const counter = jsonFromToolResult(counterResult);

  if (counter.total !== 1 || counter.allow !== 1) {
    throw new Error(`Unexpected Verified Effects counter: ${JSON.stringify(counter)}`);
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    proof: 'MCP tools/call -> hosted GATE verify -> ALLOW -> effect -> Verified Effect',
    authority: body.decision.authority,
    decision: body.decision.decision,
    servedBy: body.decision.servedBy ?? null,
    selectedPath: body.decision.selectedPath ?? null,
    verifiedEffect: body.verifiedEffect,
    networkMetering: body.networkMetering,
    networkCounter: {
      before: networkCountBefore,
      after: networkCountAfter,
      delta: networkCountAfter - networkCountBefore
    },
    effectExecuted: true,
    effectValue,
    counter: {
      metric: counter.metric,
      total: counter.total,
      allow: counter.allow,
      deny: counter.deny
    }
  }, null, 2) + '\n');
} finally {
  await client.close().catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
}

