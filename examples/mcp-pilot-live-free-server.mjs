/**
 * Pilot-only stdio MCP server. The sole effect appends to a disposable local file.
 * Principal/actor are trusted process settings, NOT caller-supplied tool arguments.
 * Stage17 action metadata is audit context, not operation-level authorization.
 */
import fs from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { GateClient } from '@gate-avn/sdk';
import { createMcpEffectGuard, createVerifiedEffectCounter } from '@gate-avn/mcp/effect-boundary';

const { GATE_URL: endpoint, GATE_API_KEY: apiKey,
  GATE_PILOT_PRINCIPAL: principal, GATE_PILOT_ACTOR: actor,
  GATE_EFFECT_FILE: effectFile } = process.env;
if (![endpoint, apiKey, principal, actor, effectFile].every(x => typeof x === 'string' && x.length)) {
  throw new Error('Missing trusted pilot GATE endpoint, API key, identities or effect file');
}
const client = new GateClient({
  endpoint, apiKey, timeoutMs: 2500, source: 'mcp-pilot',
  // A bearer-bearing authority request must never silently follow HTTP redirects.
  fetchImpl: (url, options) => fetch(url, {...options, redirect: 'error'})
});
// Defense-in-depth: reject contradictory ALLOW/INVALID or ALLOW/UNKNOWN responses.
const gate = {
  async verify(request) {
    const decision = await client.verify(request);
    if (decision.decision === 'ALLOW' && decision.authority !== 'VALID') {
      return {...decision, authority: 'UNKNOWN', decision: 'DENY', reason: 'inconsistent_authority_decision'};
    }
    return decision;
  }
};
const counter = createVerifiedEffectCounter();
const guard = createMcpEffectGuard({gate, principal, actor, consistency: 'bounded', counter});
const server = new McpServer({name: 'gate-pilot-live-free-effect', version: '0.1.0-pilot'});

server.registerTool('pilot_write_marker', {
  title: 'Write disposable effect marker after live GATE authorization',
  description: 'Pilot-only test; checks the actual GATE Free project before writing one temporary marker.',
  inputSchema: z.object({value: z.enum(['authorized-marker'])}),
  annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false}
}, async ({value}) => {
  try {
    const outcome = await guard.enforceToolCall({
      toolName: 'pilot_write_marker', resource: 'local:disposable-marker', parameters: {value}
    }, async () => {
      await fs.appendFile(effectFile, `${value}\n`, {encoding: 'utf8', flag: 'a'});
      return {executed: true};
    });
    return {content: [{type:'text', text: JSON.stringify({
      decision: {authority: outcome.decision.authority, decision: outcome.decision.decision},
      executed: outcome.result.executed, verifiedEffect: outcome.verifiedEffect
    })}]};
  } catch (error) {
    const denied = error?.code === 'GATE_AUTHORITY_DENIED';
    return {isError: true, content: [{type: 'text', text: JSON.stringify({
      executed: false,
      error: denied ? 'GATE_AUTHORITY_DENIED' : 'GATE_VERIFY_UNAVAILABLE',
      ... (denied ? {decision: {
        authority: error.decision?.authority ?? 'UNKNOWN',
        decision: error.decision?.decision ?? 'DENY'
      }} : {})
    })}]};
  }
});

server.registerTool('pilot_effect_counts', {
  title: 'Pilot-only Verified Effect counters',
  description: 'Read locally counted GATE verification outcomes; no identity fields are returned.',
  inputSchema: z.object({}),
  annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false}
}, async () => ({content: [{type: 'text', text: JSON.stringify(counter.snapshot())}]}));

void serveStdio(() => server);
