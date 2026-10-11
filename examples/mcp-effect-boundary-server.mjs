import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import {
  createMcpEffectGuard,
  createVerifiedEffectCounter
} from '../packages/mcp/src/effect-boundary.mjs';

const effectFile = process.env.GATE_EFFECT_FILE;
if (!effectFile) throw new Error('GATE_EFFECT_FILE is required');

const mode = String(process.env.GATE_DEMO_DECISION || 'ALLOW').toUpperCase();
const principal = process.env.GATE_DEMO_PRINCIPAL || 'user:demo';
const actor = process.env.GATE_DEMO_ACTOR || 'agent:writer@demo';

function demoDecision() {
  if (mode === 'ALLOW') {
    return {
      authority: 'VALID', decision: 'ALLOW', reason: null,
      servedBy: 'gate-network-v1-stage2-demo', region: 'local',
      receipt: { version: 'gate.authority-receipt.v2' }
    };
  }
  if (mode === 'UNKNOWN') {
    return {
      authority: 'UNKNOWN', decision: 'DENY', reason: 'authority_state_unknown',
      servedBy: 'gate-network-v1-stage2-demo', region: 'local',
      receipt: { version: 'gate.authority-receipt.v2' }
    };
  }
  return {
    authority: 'INVALID', decision: 'DENY', reason: 'authority_revoked',
    servedBy: 'gate-network-v1-stage2-demo', region: 'local',
    receipt: { version: 'gate.authority-receipt.v2' }
  };
}

const gate = {
  async verify(request) {
    return {
      ...demoDecision(),
      principal: request.principal,
      actor: request.actor,
      action: request.action,
      consistency: request.consistency
    };
  }
};

const counter = createVerifiedEffectCounter();
const guard = createMcpEffectGuard({ gate, principal, actor, consistency: 'strict', counter });

const server = new McpServer({
  name: 'gate-network-v1-effect-boundary-demo',
  version: '0.1.0'
});

server.registerTool('write_effect', {
  title: 'Write a real demo effect',
  description: 'Appends a value to a file only after GATE returns ALLOW at the MCP effect boundary.',
  inputSchema: z.object({ value: z.string().min(1) }),
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
}, async ({ value }) => {
  try {
    const outcome = await guard.enforceToolCall({
      toolName: 'write_effect',
      resource: 'local-demo-effect-file',
      parameters: { value }
    }, async () => {
      fs.appendFileSync(effectFile, `${value}\n`, 'utf8');
      return { executed: true, value };
    });

    return { content: [{ type: 'text', text: JSON.stringify(outcome) }] };
  } catch (error) {
    if (error?.code === 'GATE_AUTHORITY_DENIED') {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({
          executed: false,
          error: error.code,
          decision: error.decision,
          verifiedEffect: error.verifiedEffect
        }) }]
      };
    }
    throw error;
  }
});

server.registerTool('gate_verified_effects', {
  title: 'Verified Effects counter',
  description: 'Return the local Stage 2 Verified Effects counter.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async () => ({
  content: [{ type: 'text', text: JSON.stringify(counter.snapshot()) }]
}));

void serveStdio(() => server);
