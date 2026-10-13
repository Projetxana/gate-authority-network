$("verifyLive").onclick=async()=>{
  const button=$("verifyLive");
  button.disabled=true;
  button.textContent="Verifying…";
  $("verifyStatus").textContent="";
  try{
    const data=await request(BASE+"/v1/authority/verify",{
      method:"POST",
      headers:{
        authorization:"Bearer "+apiKey,
        "content-type":"application/json",
        "x-gate-source":"api",
        "x-gate-client-version":"stage17b-web-v1"
      },
      body:JSON.stringify({
        principal:"user:alice",
        actor:"agent:procurement@company-c",
        consistency:"bounded"
      })
    });
    $("verifyResult").textContent=JSON.stringify(data,null,2);
    const expected=data.decision==="DENY" && data.authority==="INVALID" && data.reason==="no_authority_path" && data.sandbox===false;
    $("verifyStatus").textContent=expected ? "Expected fail-closed result confirmed: DENY / no_authority_path." : "Unexpected result — inspect before continuing.";
    $("verifyStatus").className=expected ? "ok" : "error";
    button.textContent=expected ? "DENY confirmed ✓" : "Review result";
    button.disabled=expected;
  }catch(error){
    $("verifyResult").textContent=JSON.stringify({error:error.message,details:error.details||null},null,2);
    $("verifyStatus").textContent="Live verification failed.";
    $("verifyStatus").className="error";
    button.disabled=false;
    button.textContent="Run first live verify";
  }
};
