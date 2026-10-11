import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const serverPath = path.join(root, 'examples', 'mcp-effect-boundary-server.mjs');

function cleanEnv(extra = {}) {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)),
    ...extra
  };
}

async function connect({ decision, effectFile }) {
  const client = new Client(
    { name: 'gate-network-v1-stage2-test', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } }
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: cleanEnv({ GATE_DEMO_DECISION: decision, GATE_EFFECT_FILE: effectFile })
  });
  await client.connect(transport);
  return client;
}

function jsonFromToolResult(result) {
  const text = result.content?.find(item => item.type === 'text')?.text;
  if (!text) throw new Error('missing text result');
  return JSON.parse(text);
}

test('real MCP tools/call executes the effect only after GATE ALLOW and counts one Verified Effect', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-mcp-allow-'));
  const effectFile = path.join(dir, 'effect.log');
  const client = await connect({ decision: 'ALLOW', effectFile });
  try {
    const result = await client.callTool({ name: 'write_effect', arguments: { value: 'allowed-effect' } });
    assert.notEqual(result.isError, true);
    const body = jsonFromToolResult(result);
    assert.equal(body.result.executed, true);
    assert.equal(body.decision.decision, 'ALLOW');
    assert.equal(body.verifiedEffect.event, 'gate.verified_effect');
    assert.equal(body.verifiedEffect.operation, 'tools/call:write_effect');
    assert.equal(fs.readFileSync(effectFile, 'utf8'), 'allowed-effect\n');

    const counter = jsonFromToolResult(await client.callTool({ name: 'gate_verified_effects', arguments: {} }));
    assert.equal(counter.total, 1);
    assert.equal(counter.allow, 1);
    assert.equal(counter.deny, 0);
  } finally {
    await client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('real MCP tools/call is blocked before the effect on GATE INVALID / DENY', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-mcp-deny-'));
  const effectFile = path.join(dir, 'effect.log');
  const client = await connect({ decision: 'DENY', effectFile });
  try {
    const result = await client.callTool({ name: 'write_effect', arguments: { value: 'must-not-execute' } });
    assert.equal(result.isError, true);
    const body = jsonFromToolResult(result);
    assert.equal(body.executed, false);
    assert.equal(body.decision.authority, 'INVALID');
    assert.equal(body.decision.decision, 'DENY');
    assert.equal(fs.existsSync(effectFile), false);

    const counter = jsonFromToolResult(await client.callTool({ name: 'gate_verified_effects', arguments: {} }));
    assert.equal(counter.total, 1);
    assert.equal(counter.deny, 1);
    assert.equal(counter.invalid, 1);
  } finally {
    await client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('real MCP tools/call fails closed on GATE UNKNOWN / DENY', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-mcp-unknown-'));
  const effectFile = path.join(dir, 'effect.log');
  const client = await connect({ decision: 'UNKNOWN', effectFile });
  try {
    const result = await client.callTool({ name: 'write_effect', arguments: { value: 'must-not-execute' } });
    assert.equal(result.isError, true);
    const body = jsonFromToolResult(result);
    assert.equal(body.executed, false);
    assert.equal(body.decision.authority, 'UNKNOWN');
    assert.equal(body.decision.decision, 'DENY');
    assert.equal(fs.existsSync(effectFile), false);

    const counter = jsonFromToolResult(await client.callTool({ name: 'gate_verified_effects', arguments: {} }));
    assert.equal(counter.total, 1);
    assert.equal(counter.deny, 1);
    assert.equal(counter.unknown, 1);
  } finally {
    await client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
