import test from "node:test";
import assert from "node:assert/strict";
import { localReviewRequestCookies,localReviewResponseCookies } from "../src/local-review-cookies.js";

test("special workspaces never consume or overwrite another localhost role session",()=>{
  const common="__Host-ipo_one_session=risk; __Host-ipo_one_csrf_bootstrap=riskcsrf; __Host-ipo_one_session_web027m_8939=operations; __Host-ipo_one_session_web027m_8940=auditor; __Host-ipo_one_csrf_bootstrap_web027m_8939=opscsrf";
  assert.equal(localReviewRequestCookies(common,8939),"__Host-ipo_one_session=operations; __Host-ipo_one_csrf_bootstrap=opscsrf");
  assert.equal(localReviewRequestCookies(common,8940),"__Host-ipo_one_session=auditor");
  assert.equal(localReviewRequestCookies(common,8941),"");
  assert.equal(localReviewRequestCookies(common,8937),common);
  assert.deepEqual(localReviewResponseCookies(["__Host-ipo_one_session=abc; Secure; HttpOnly; SameSite=Strict; Path=/","__Host-ipo_one_csrf_bootstrap=def; Secure; HttpOnly; Path=/"],8939),[
    "__Host-ipo_one_session_web027m_8939=abc; Secure; HttpOnly; SameSite=Strict; Path=/",
    "__Host-ipo_one_csrf_bootstrap_web027m_8939=def; Secure; HttpOnly; Path=/"
  ]);
  assert.equal(localReviewResponseCookies("__Host-ipo_one_session=; Max-Age=0; Secure; Path=/",8940),"__Host-ipo_one_session_web027m_8940=; Max-Age=0; Secure; Path=/");
});
