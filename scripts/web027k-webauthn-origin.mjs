import { chromium } from "@playwright/test";
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext();const page=await context.newPage();
 const cdp=await context.newCDPSession(page);await cdp.send("WebAuthn.enable");
 await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 await page.goto("http://127.0.0.1:8937/");
 console.log(JSON.stringify(await page.evaluate(async()=>{try{const c=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:"IPO.ONE local protocol test",id:"127.0.0.1"},user:{id:crypto.getRandomValues(new Uint8Array(32)),name:"local-synthetic-test",displayName:"Local synthetic protocol test"},pubKeyCredParams:[{type:"public-key",alg:-7}],authenticatorSelection:{residentKey:"required",userVerification:"required"},attestation:"none",timeout:3000}});return{origin:location.origin,created:!!c,userVerification:"required",serverRegistration:false};}catch(e){return{origin:location.origin,error:e.name,message:e.message,serverRegistration:false};}})));
} finally{await browser.close();}
