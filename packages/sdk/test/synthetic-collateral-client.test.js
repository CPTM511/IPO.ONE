import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from '../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json' with {type:'json'};
import {IpoOneSyntheticCollateralClient} from '../src/synthetic-collateral-client.js';
import {createSyntheticCollateralMcpAdapter} from '../../../apps/agent-mcp/src/synthetic-collateral-mcp-adapter.js';
const operationId='pilotConfirmSyntheticCollateral';
const request=fixtures.validRequests.find(x=>x.operationId===operationId);
const response=fixtures.validResults.find(x=>x.operationId===operationId);
const client=execute=>new IpoOneSyntheticCollateralClient({execute,transportProfile:'local_in_process'});

test('B3 Agent adapter exposes only three exact no-funds operations',async()=>{
  let calls=0;const sdk=client(async()=>{calls++;return response;});
  const mcp=createSyntheticCollateralMcpAdapter({client:sdk});
  assert.equal(mcp.listTools().length,3);
  await assert.rejects(sdk.executeOperation({...request,operationId:'pilotExecuteSandboxObligation'}),{code:'synthetic_collateral_sdk_scope_denied'});
  await assert.rejects(mcp.callTool('ipo_one_confirm_synthetic_collateral',{rawSignature:'forbidden'}),{code:'invalid_synthetic_collateral_mcp_arguments'});
  assert.equal(calls,0);
  assert.throws(()=>new IpoOneSyntheticCollateralClient({execute:()=>{},transportProfile:'remote'}),{code:'invalid_synthetic_collateral_sdk_config'});
});

test('B3 SDK binds a conforming receipt to the exact requested economics and resource',async()=>{
  assert.equal((await client(async()=>response).executeOperation(request)).response.receipt.transactionHash,null);
  for(const mutation of [
    value=>value.response.receipt.termsHash=`0x${'ff'.repeat(32)}`,
    value=>value.response.receipt.amountAssets='1',
    value=>value.response.receipt.obligationId='obligation_other',
    value=>value.response.obligation.obligationId='obligation_other',
    value=>value.response.obligation.syntheticCollateral.lastReceipt.receiptId=`0x${'ff'.repeat(32)}`
  ]){
    const altered=structuredClone(response);mutation(altered);
    await assert.rejects(client(async()=>altered).executeOperation(request),{code:'synthetic_collateral_resource_drift'});
  }
});

test('B3 SDK rejects response chain, funds, state and version drift even from its transport',async()=>{
  for(const mutation of [
    value=>value.response.receipt.chainId='eip155:56',
    value=>value.response.productionFundsMoved=true,
    value=>value.response.obligation.syntheticCollateral.state='released',
    value=>value.response.receipt.previousVersion=1
  ]){
    const altered=structuredClone(response);mutation(altered);
    await assert.rejects(client(async()=>altered).executeOperation(request),{code:'invalid_synthetic_collateral_sdk_result'});
  }
});
