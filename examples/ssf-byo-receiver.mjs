import { createSsfReceiverConnector } from '@gate-avn/ssf';
const issuer=process.env.SSF_ISSUER, metadataUrl=process.env.SSF_METADATA_URL, accessToken=process.env.SSF_ACCESS_TOKEN, expectedAudience=process.env.SSF_AUDIENCE;
if((!issuer&&!metadataUrl)||!accessToken){console.error('Set SSF_ISSUER or SSF_METADATA_URL, plus SSF_ACCESS_TOKEN.');process.exit(2)}
const receiver=createSsfReceiverConnector({issuer,metadataUrl,accessToken,expectedAudience,requireSubject:process.env.SSF_REQUIRE_SUBJECT!=='false',reuseExisting:true,onEvent:async e=>console.log(JSON.stringify({verified:true,transmitterIssuer:e.transmitterIssuer,streamId:e.streamId,audience:e.audience,signingAlg:e.signingAlg,signingKeyId:e.signingKeyId,eventTypes:e.eventTypes,jti:e.jti,subjectPresent:Boolean(e.payload?.sub_id)},null,2))});
console.log(JSON.stringify({connected:true,...await receiver.open()},null,2));
const result=await receiver.pollOnce({maxEvents:50});
console.log(JSON.stringify({polled:true,verifiedEvents:result.events.length,acknowledged:result.acknowledged.length,moreAvailable:result.moreAvailable},null,2));
