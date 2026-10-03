import http from 'node:http';
import { URL } from 'node:url';
import { sendJson } from '../src/http-json.mjs';
import { generateEs256KeyPair, signJwt } from '../src/jws.mjs';

const host = '127.0.0.1';
const members = JSON.parse(process.env.FEDERATION_MEMBERS_JSON || '{}');
const { privateKey, publicJwk } = generateEs256KeyPair({ kid: 'gate-federation-anchor' });
let issuer;

function nowSec() { return Math.floor(Date.now()/1000); }
function entityStatement({ sub, metadata }) {
  const now = nowSec();
  return signJwt({
    header: { alg: 'ES256', kid: publicJwk.kid, typ: 'entity-statement+jwt' },
    payload: { iss: issuer, sub, iat: now, exp: now + 3600, metadata },
    privateKey
  });
}
function selfConfiguration() {
  const now = nowSec();
  return signJwt({
    header: { alg: 'ES256', kid: publicJwk.kid, typ: 'entity-statement+jwt' },
    payload: {
      iss: issuer, sub: issuer, iat: now, exp: now + 3600,
      jwks: { keys: [publicJwk] },
      metadata: { federation_entity: { federation_fetch_endpoint: `${issuer}/fetch` } }
    },
    privateKey
  });
}
const server = http.createServer((req,res)=>{
  const u = new URL(req.url, issuer || 'http://localhost');
  if (req.method==='GET' && u.pathname==='/.well-known/openid-federation') {
    const body=selfConfiguration();
    res.writeHead(200, {'content-type':'application/entity-statement+jwt','content-length':Buffer.byteLength(body)}); return res.end(body);
  }
  if (req.method==='GET' && u.pathname==='/jwks.json') return sendJson(res,200,{keys:[publicJwk]});
  if (req.method==='GET' && u.pathname==='/fetch') {
    const sub=u.searchParams.get('sub');
    const cfg=members[sub];
    if (!cfg) return sendJson(res,404,{error:'unknown_subordinate'});
    const body=entityStatement({
      sub,
      metadata:{ gate_authority_issuer:{ principal_patterns:cfg.principal_patterns || [], events_supported:cfg.events_supported || ['https://gate.example/events/authority-edge-state'] } }
    });
    res.writeHead(200, {'content-type':'application/entity-statement+jwt','content-length':Buffer.byteLength(body)}); return res.end(body);
  }
  if (req.method==='GET' && u.pathname==='/members') return sendJson(res,200,{members});
  return sendJson(res,404,{error:'not_found'});
});
const port=Number(process.env.PORT||0);
await new Promise(resolve=>server.listen(port,host,resolve));
issuer=`http://${host}:${server.address().port}`;
console.log(JSON.stringify({ready:true,service:'trust-anchor',url:issuer}));
