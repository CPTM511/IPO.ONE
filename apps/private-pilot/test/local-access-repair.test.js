import test from "node:test";
import assert from "node:assert/strict";
import { createLocalPilotIdentities } from "../src/local-pilot-identities.js";
import { LOCAL_ACCESS_ADDITIONS, assertLocalAccessDatabase } from "../src/local-access-repair.js";
test("WEB-027J adds exactly nine reviewed operations to ordinary local profiles",()=>{
  const baseline=createLocalPilotIdentities().identities;
  const next=createLocalPilotIdentities({localAccessRepair:true}).identities;
  assert.equal(LOCAL_ACCESS_ADDITIONS.length,9);
  for(const role of Object.keys(baseline)) {
    const additions=next[role].capabilities.filter(c=>!baseline[role].capabilities.includes(c));
    assert.deepEqual(additions,["borrower","controller"].includes(role)?LOCAL_ACCESS_ADDITIONS:[]);
    assert.deepEqual(baseline[role].capabilities.filter(c=>!next[role].capabilities.includes(c)),[]);
    assert.equal(next[role].actorId,baseline[role].actorId);
    if(!["borrower","controller"].includes(role)) assert.equal(next[role].clientId,baseline[role].clientId);
  }
});
test("local access activation rejects hosted and unrelated local databases",()=>{
  assert.doesNotThrow(()=>assertLocalAccessDatabase("postgres://test@127.0.0.2:55435/ipo_one_web027_candidate",8935));
  for(const [url,port] of [["postgres://test@prod:55435/ipo_one_web027_candidate",8935],["postgres://test@127.0.0.2:55435/ipo_one_pilot008a_review_20260829a",8935],["postgres://test@127.0.0.2:55435/ipo_one_web027_candidate",8895]]) assert.throws(()=>assertLocalAccessDatabase(url,port));
});
