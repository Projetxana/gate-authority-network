import http from 'node:http';
import crypto from 'node:crypto';
import { readJson, sendJson } from '../src/http-json.mjs';
import { generateEs256KeyPair, signJwt } from '../src/jws.mjs';

const host = '127.0.0.1';
const { privateKey, publicJwk } = generateEs256KeyPair({ kid: 'gate-v06-demo-as' });
let issuer;

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true });
  if (req.method === 'GET' && req.url === '/.well-known/oauth-authorization-server') {
    return sendJson(res, 200, { issuer, jwks_uri: `${issuer}/jwks.json`, token_endpoint: `${issuer}/token`, scopes_supported: ['customer.delete'] });
  }
  if (req.method === 'GET' && req.url === '/jwks.json') return sendJson(res, 200, { keys: [publicJwk] });
  if (req.method === 'POST' && req.url === '/token') {
    const body = await readJson(req);
    const principal = body.principal ?? 'user:jerome';
    const actor = body.actor ?? 'agent:C@company-c';
    const audience = body.audience ?? 'urn:gate:mcp:customer-service';
    const ids = body.customerIds ?? ['1234', '2345', '3456'];
    const authorizationDetails = [{ type: 'customer_data', locations: [audience], actions: ['delete'], customer_ids: ids }];
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({
      header: { alg: 'ES256', kid: publicJwk.kid, typ: 'at+jwt' },
      payload: {
        iss: issuer,
        sub: principal,
        aud: audience,
        iat: now,
        exp: now + 3600,
        jti: crypto.randomUUID(),
        client_id: 'agent-runtime-demo',
        scope: 'customer.delete',
        act: { sub: actor },
        authorization_details: authorizationDetails
      },
      privateKey
    });
    return sendJson(res, 200, { access_token: token, token_type: 'Bearer', expires_in: 3600, authorization_details: authorizationDetails });
  }
  return sendJson(res, 404, { error: 'not_found' });
});

const port = Number(process.env.PORT || 0);
await new Promise(resolve => server.listen(port, host, resolve));
issuer = `http://${host}:${server.address().port}`;
console.log(JSON.stringify({ ready: true, service: 'oauth-issuer', url: issuer }));
