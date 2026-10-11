import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { GateClient } from '@gate-avn/sdk';
import {
  createMcpEffectGuard,
  createVerifiedEffectCounter
} from '../packages/mcp/src/effect-boundary.mjs';

const endpoint = process.env.GATE_URL;
const apiKey = process.env.GATE_API_KEY;
const effectFile = process.env.GATE_EFFECT_FILE;

if (!endpoint) throw new Error('GATE_URL is required');
if (!apiKey) throw new Error('GATE_API_KEY is required');
if (!effectFile) throw new Error('GATE_EFFECT_FILE is required');

const gate = new GateClient({
  endpoint,
  apiKey,
  timeoutMs: 5000,
  source: 'mcp',
  clientVersion: 'network-v1-stage3'
});

const counter = createVerifiedEffectCounter();

const guard = createMcpEffectGuard({
  gate,
  principal: 'user:demo',
  actor: 'agent:C@company-c',
  consistency: 'bounded',
  counter
});

const server = new McpServer({
  name: 'gate-network-v1-hosted-effect-boundary',
  version: '0.1.0'
});

server.registerTool(
  'network_v1_write_effect',
  {
    title: 'Execute one hosted GATE verified effect',
    description:
      'Writes to a local effect file only after the hosted GATE Network returns ALLOW.',
    inputSchema: z.object({
      value: z.string().min(1)
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    }
  },
  async ({ value }) => {
    try {
      const outcome = await guard.enforceToolCall(
        {
          toolName: 'network_v1_write_effect',
          resource: 'local:network-v1-stage3-effect',
          parameters: { value }
        },
        async () => {
          fs.appendFileSync(effectFile, `${value}\n`, 'utf8');
          return { executed: true, value };
        }
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(outcome)
        }]
      };
    } catch (error) {
      if (error?.code === 'GATE_AUTHORITY_DENIED') {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              executed: false,
              error: error.code,
              decision: error.decision,
              verifiedEffect: error.verifiedEffect
            })
          }]
        };
      }
      throw error;
    }
  }
);

server.registerTool(
  'gate_verified_effects',
  {
    title: 'Verified Effects counter',
    description: 'Return the local Verified Effects counter for this MCP server process.',
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => ({
    content: [{
      type: 'text',
      text: JSON.stringify(counter.snapshot())
    }]
  })
);

void serveStdio(() => server);

