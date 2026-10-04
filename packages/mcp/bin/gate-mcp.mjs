#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { GateClient } from '@gate-avn/sdk';

const VERSION = '0.1.0-dev.1';
const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  process.stdout.write(`GATE MCP ${VERSION}

Usage:
  gate-mcp                 Run against GATE_URL
  gate-mcp --demo          Run the zero-configuration in-memory demo
  gate-mcp --version       Print version

Environment:
  GATE_URL                 GATE edge URL (required outside demo mode)
  GATE_API_KEY             Optional bearer token
  GATE_TIMEOUT_MS          Request timeout, default 2000
`);
  process.exit(0);
}

if (args.has('--version') || args.has('-v')) {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}

const demoMode = args.has('--demo') || process.env.GATE_MODE === 'demo';
const endpoint = process.env.GATE_URL;
const timeoutMs = Number(process.env.GATE_TIMEOUT_MS || 2000);

if (!demoMode && !endpoint) {
  process.stderr.write(
    'GATE_URL is required in real mode. Run with --demo for the local demonstration.\n'
  );
  process.exit(1);
}

const gate = demoMode
  ? createDemoGate()
  : new GateClient({
      endpoint,
      apiKey: process.env.GATE_API_KEY,
      timeoutMs
    });

const server = new McpServer({
  name: 'gate-authority-network',
  version: VERSION
});

const actionSchema = z.object({
  protocol: z.string().optional(),
  name: z.string().min(1),
  resource: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional()
});

server.registerTool(
  'gate_verify',
  {
    title: 'Verify live authority',
    description:
      'Check whether an actor still has a live authority path from a principal immediately before an action.',
    inputSchema: z.object({
      principal: z.string().min(1),
      actor: z.string().min(1),
      action: actionSchema.optional(),
      consistency: z.enum(['bounded', 'strict']).optional(),
      maxStalenessMs: z.number().nonnegative().optional()
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async input => {
    try {
      const result = await gate.verify(input);
      return asText(result);
    } catch (error) {
      return toolError('gate_verify_failed', error);
    }
  }
);

server.registerTool(
  'gate_status',
  {
    title: 'GATE status',
    description: 'Report verifier mode and current edge/demo state.',
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => {
    try {
      if (demoMode) return asText(gate.status());
      const response = await fetch(`${endpoint.replace(/\/$/, '')}/health`, {
        headers: process.env.GATE_API_KEY
          ? { authorization: `Bearer ${process.env.GATE_API_KEY}` }
          : {}
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`gate_health_http_${response.status}`);
      return { content: [{ type: 'text', text }] };
    } catch (error) {
      return toolError('gate_status_failed', error);
    }
  }
);

if (demoMode) {
  server.registerTool(
    'gate_demo_revoke',
    {
      title: 'Revoke a demo authority path',
      description: 'Demo only: revoke upstream path A or B while the downstream actor remains unchanged.',
      inputSchema: z.object({ path: z.enum(['A', 'B']) }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ path }) => asText(gate.revoke(path))
  );

  server.registerTool(
    'gate_demo_reset',
    {
      title: 'Reset demo authority',
      description: 'Demo only: restore both authority paths to ACTIVE.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () => asText(gate.reset())
  );
}

function asText(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }]
  };
}

function toolError(code, error) {
  return {
    isError: true,
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: code,
        message: error instanceof Error ? error.message : String(error)
      })
    }]
  };
}

function createDemoGate() {
  const principal = 'user:demo';
  const actor = 'agent:C@company-c';

  const initialEdges = () => [
    { edgeId: 'demo-human-a', issuer: principal, subject: 'agent:A@company-a', status: 'ACTIVE' },
    { edgeId: 'demo-a-c', issuer: 'agent:A@company-a', subject: actor, status: 'ACTIVE' },
    { edgeId: 'demo-human-b', issuer: principal, subject: 'agent:B@company-b', status: 'ACTIVE' },
    { edgeId: 'demo-b-c', issuer: 'agent:B@company-b', subject: actor, status: 'ACTIVE' }
  ];

  let edges = initialEdges();

  return {
    async verify(request) {
      const result = verifyLiveAuthority({
        principal: request.principal,
        actor: request.actor,
        edges
      });
      return {
        ...result,
        consistency: request.consistency || 'bounded',
        servedBy: 'gate-mcp:demo',
        demo: true,
        ...(request.action ? { action: request.action } : {})
      };
    },

    revoke(path) {
      const edgeId = path === 'A' ? 'demo-human-a' : 'demo-human-b';
      edges = edges.map(edge =>
        edge.edgeId === edgeId
          ? { ...edge, status: 'REVOKED', revokedAt: new Date().toISOString(), reason: 'demo_revocation' }
          : edge
      );
      return { ok: true, path, status: 'REVOKED', state: this.status() };
    },

    reset() {
      edges = initialEdges();
      return { ok: true, state: this.status() };
    },

    status() {
      return { ok: true, mode: 'demo', principal, actor, edges };
    }
  };
}

function verifyLiveAuthority({ principal, actor, edges, maxDepth = 12 }) {
  if (!principal || !actor) {
    return { authority: 'INVALID', decision: 'DENY', reason: 'missing_principal_or_actor' };
  }

  if (principal === actor) {
    return {
      authority: 'VALID',
      decision: 'ALLOW',
      principal,
      actor,
      selectedPath: [principal],
      validPathCount: 1,
      evaluatedPathCount: 1,
      paths: [{ status: 'VALID', nodePath: [principal], edgeIds: [], checks: [] }]
    };
  }

  const outgoing = new Map();
  for (const edge of edges ?? []) {
    if (!outgoing.has(edge.issuer)) outgoing.set(edge.issuer, []);
    outgoing.get(edge.issuer).push(edge);
  }

  const candidates = [];
  const queue = [{
    node: principal,
    nodePath: [principal],
    edgePath: [],
    visited: new Set([principal])
  }];

  while (queue.length) {
    const current = queue.shift();
    if (current.edgePath.length >= maxDepth) continue;

    for (const edge of outgoing.get(current.node) ?? []) {
      if (current.visited.has(edge.subject)) continue;

      const nodePath = [...current.nodePath, edge.subject];
      const edgePath = [...current.edgePath, edge];

      if (edge.subject === actor) {
        candidates.push({ nodePath, edgePath });
        continue;
      }

      const visited = new Set(current.visited);
      visited.add(edge.subject);
      queue.push({ node: edge.subject, nodePath, edgePath, visited });
    }
  }

  if (!candidates.length) {
    return {
      authority: 'INVALID',
      decision: 'DENY',
      reason: 'no_authority_path',
      principal,
      actor,
      evaluatedPathCount: 0,
      paths: []
    };
  }

  const evaluated = candidates.map(({ nodePath, edgePath }) => {
    const checks = edgePath.map(edge => ({
      edgeId: edge.edgeId,
      issuer: edge.issuer,
      subject: edge.subject,
      authorityStatus: edge.status,
      revokedAt: edge.revokedAt ?? null,
      reason: edge.reason ?? null
    }));

    if (edgePath.some(edge => edge.status === 'UNKNOWN')) {
      return {
        status: 'UNKNOWN',
        reason: 'authority_status_unknown',
        nodePath,
        edgeIds: edgePath.map(edge => edge.edgeId),
        checks
      };
    }

    if (edgePath.some(edge => edge.status === 'REVOKED')) {
      return {
        status: 'INVALID',
        reason: 'upstream_authority_revoked',
        nodePath,
        edgeIds: edgePath.map(edge => edge.edgeId),
        checks
      };
    }

    if (edgePath.some(edge => edge.status !== 'ACTIVE')) {
      return {
        status: 'UNKNOWN',
        reason: 'unsupported_authority_status',
        nodePath,
        edgeIds: edgePath.map(edge => edge.edgeId),
        checks
      };
    }

    return {
      status: 'VALID',
      reason: null,
      nodePath,
      edgeIds: edgePath.map(edge => edge.edgeId),
      checks
    };
  });

  const valid = evaluated.find(path => path.status === 'VALID');

  if (valid) {
    return {
      authority: 'VALID',
      decision: 'ALLOW',
      principal,
      actor,
      selectedPath: valid.nodePath,
      selectedEdges: valid.edgeIds,
      validPathCount: evaluated.filter(path => path.status === 'VALID').length,
      evaluatedPathCount: evaluated.length,
      paths: evaluated
    };
  }

  if (evaluated.some(path => path.status === 'UNKNOWN')) {
    return {
      authority: 'UNKNOWN',
      decision: 'DENY',
      reason: 'no_active_path_and_authority_state_unknown',
      principal,
      actor,
      evaluatedPathCount: evaluated.length,
      paths: evaluated
    };
  }

  return {
    authority: 'INVALID',
    decision: 'DENY',
    reason: 'all_authority_paths_revoked_or_invalid',
    principal,
    actor,
    evaluatedPathCount: evaluated.length,
    paths: evaluated
  };
}

void serveStdio(() => server);
