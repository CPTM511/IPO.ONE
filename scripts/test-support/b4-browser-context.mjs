import {expect} from '@playwright/test';
export async function closeB4BrowserContext(context) {
  // Drain actual first-party requests before disposing the HTTP client used
  // by the isolated origin proxy. Closing it in flight can mask assertions.
  await context.setOffline(true);
  await context.unrouteAll({behavior:'wait'});
  await context.close();
}
export async function createB4BrowserRole({browser,fixture,role='borrower',nativeMfa=false}) {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await fixture.proxy(context);
  const account=fixture.accounts[role];
  await context.exposeBinding('signB4FixtureMessage',async(_,message)=>account.signMessage({message:{raw:message}}));
  await context.addInitScript(address=>{
    localStorage.setItem('ipo-one-language','en');
    const provider={on(){},removeListener(){},async request({method,params}) {
      if(['eth_requestAccounts','eth_accounts'].includes(method))return[address];
      if(method==='eth_chainId')return'0x14a34';if(method==='wallet_switchEthereumChain')return null;
      if(method==='personal_sign')return window.signB4FixtureMessage(params[0]);
      throw new Error(`Unsupported disposable wallet request ${method}`);
    }};
    window.ethereum=provider;
    window.addEventListener('eip6963:requestProvider',()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{provider,info:{uuid:'12345678-1234-4234-9234-123456789012',name:'MetaMask',rdns:'io.metamask',icon:'data:image/png;base64,iVBORw0KGgo='}}})));
  },account.address);
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let cdp,authenticatorId;
  if(nativeMfa) {
    cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
    ({authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}}));
  }
  await page.goto(fixture.origin);
  await page.getByRole('button',{name:'Open IPO.ONE',exact:true}).filter({visible:true}).first().click();
  const selected={borrower:'human_borrower',controller:'principal_controller',capitalPartner:'capital_partner_operator',operations:'operations_operator',riskReviewer:'risk_operator',operationsReviewer:'operations_operator',auditor:'auditor'}[role];
  await page.locator(`[data-wallet-workspace-role="${selected}"]`).click();
  await page.locator('#walletProviderList button').filter({hasText:'MetaMask'}).click();
  await page.locator('[data-wallet-chain="84532"]').click();await page.locator('#walletSignInBtn').click();
  await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated',{timeout:15000});
  // Observe server-owned discovery; this read neither changes roles nor grants MFA.
  const options=await page.evaluate(()=>fetch('/auth/v1/options').then(response=>response.json()));
  return {context,page,options,errors,cdp,authenticatorId};
}
export async function callB4BrowserApi(page,path,{method='POST',body}={}) {
 if(!path.startsWith('/auth/v1/') && path!=='/tenant/v1/operations')throw new Error('Unsupported disposable browser API fixture');
 return page.evaluate(async({path,method,body})=>{
  const csrf=document.querySelector('meta[name="ipo-one-csrf-token"]')?.content;
  const response=await fetch(path,{method,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),...(method==='POST'?{'x-csrf-token':csrf??''}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
 },{path,method,body});
}
