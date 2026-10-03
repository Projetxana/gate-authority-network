import http from 'node:http';
import { readJson, sendJson, postJson } from '../src/http-json.mjs';
import { tokenAllowsDelete, verifyRemoteAccessToken } from '../src/oauth-client.mjs';
const edgeUrl=process.env.GATE_EDGE_URL;const issuerUrl=process.env.OAUTH_ISSUER_URL;const audience=process.env.GATE_AUDIENCE??'urn:gate:mcp:customer-service';
const consistency=process.env.GATE_CONSISTENCY||'bounded';const maxStalenessMs=Number(process.env.GATE_MAX_STALENESS_MS||200);
if(!edgeUrl||!issuerUrl)throw new Error('GATE_EDGE_URL and OAUTH_ISSUER_URL are required');
const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/health')return sendJson(res,200,{ok:true,edgeUrl,consistency,maxStalenessMs});
  if(req.method!=='POST'||req.url!=='/access/v1/evaluation')return sendJson(res,404,{error:'not_found'});
  try{const body=await readJson(req);const token=body.context?.access_token;const local=await verifyRemoteAccessToken({token,audience,allowedIssuer:issuerUrl});
    if(!local.valid)return sendJson(res,200,{decision:false,context:{reason:local.reason,oauth:local}});
    if(body.subject?.id!==local.actor)return sendJson(res,200,{decision:false,context:{reason:'subject_actor_mismatch'}});
    if(body.action?.name!=='delete_customer_data'||body.resource?.type!=='customer')return sendJson(res,200,{decision:false,context:{reason:'unsupported_action_or_resource'}});
    const grant=tokenAllowsDelete({payload:local.payload,customerId:body.resource.id,audience});if(!grant.allowed)return sendJson(res,200,{decision:false,context:{reason:grant.reason}});
    const gate=await postJson(`${edgeUrl}/v1/authority/verify`,{principal:local.principal,actor:local.actor,consistency,maxStalenessMs});
    return sendJson(res,200,{decision:gate.decision==='ALLOW',context:{reason:gate.decision==='ALLOW'?'authorized':gate.reason,oauth:{valid:true,principal:local.principal,actor:local.actor,issuer:local.payload.iss,audience:local.payload.aud,jti:local.payload.jti,scope:local.payload.scope,tokenType:local.protectedHeader.typ},authorization_details:grant.grant,gate}});
  }catch(error){return sendJson(res,400,{decision:false,context:{reason:'invalid_request',error:error.message}})}});
const port=Number(process.env.PORT||0);await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));console.log(JSON.stringify({ready:true,service:'authzen-pdp',url:`http://127.0.0.1:${server.address().port}`,edgeUrl,consistency,maxStalenessMs}));
