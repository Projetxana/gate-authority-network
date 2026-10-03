import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { deleteCustomer, getCustomer } from '../src/customer-store.mjs';
import { mapMcpDeleteToAuthzen } from '../src/coaz-mcp.mjs';
import { verifyRemoteAccessToken } from '../src/oauth-client.mjs';

const token = process.env.GATE_DEMO_ACCESS_TOKEN;
const authzenUrl = process.env.AUTHZEN_URL;
const issuerUrl = process.env.OAUTH_ISSUER_URL;
const audience = process.env.GATE_AUDIENCE ?? 'urn:gate:mcp:customer-service';
const customerPath = process.env.CUSTOMER_STORE_PATH;
if (!token || !authzenUrl || !issuerUrl || !customerPath) throw new Error('missing MCP demo environment');
if (!fs.existsSync(customerPath)) throw new Error(`customer store missing: ${customerPath}`);

async function evaluate(request) {
  const response = await fetch(`${authzenUrl}/access/v1/evaluation`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  if (!response.ok) throw new Error(`AuthZEN HTTP ${response.status}`);
  return response.json();
}

const server = new McpServer({ name: 'gate-signed-authority-events-demo', version: '0.6.0' });
server.registerTool('delete_customer_data', {
  title: 'Delete customer data',
  description: 'Real MCP destructive tool enforced by an independent AuthZEN PDP and GATE authority network.',
  inputSchema: z.object({ customerId: z.string().regex(/^\d+$/) }),
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
}, async ({ customerId }) => {
  const local = await verifyRemoteAccessToken({ token, audience, allowedIssuer: issuerUrl });
  if (!local.valid) return blocked(customerId, 'oauth_token_invalid', { localOAuth: local });
  const authzen = await evaluate(mapMcpDeleteToAuthzen({ actor: local.actor, customerId, accessToken: token }));
  if (!authzen.decision) return blocked(customerId, authzen.context?.reason ?? 'authzen_denied', { localOAuth: summarize(local), authzen });
  const deletion = deleteCustomer(customerPath, customerId, { principal: local.principal, actor: local.actor, selectedPath: authzen.context?.gate?.selectedPath ?? null });
  return { content: [{ type: 'text', text: JSON.stringify({ executed: true, localOAuth: summarize(local), authzen, deletion }) }] };
});
server.registerTool('get_customer_status', { title: 'Get customer status', inputSchema: z.object({ customerId: z.string().regex(/^\d+$/) }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async ({ customerId }) => ({ content: [{ type: 'text', text: JSON.stringify({ customer: getCustomer(customerPath, customerId) }) }] }));

function blocked(customerId, reason, extra) { return { isError: true, content: [{ type: 'text', text: JSON.stringify({ executed: false, reason, ...extra, customer: getCustomer(customerPath, customerId) }) }] }; }
function summarize(local) { return { valid: local.valid, principal: local.principal, actor: local.actor, issuer: local.payload?.iss, audience: local.payload?.aud, jti: local.payload?.jti, scope: local.payload?.scope, tokenType: local.protectedHeader?.typ }; }
void serveStdio(() => server);
