import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, generateKeyPairSync, sign } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { verifyLocalRiskCeremony, LocalRiskPasskeys } from "../src/local-risk-passkeys.js";
const b64 = b => Buffer.from(b).toString("base64url");
const hash = b => createHash("sha256").update(b).digest();
function fixture({ purpose = "register", flags, rp = "localhost", counter = 1, data = {}, duplicate = false } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const cose = isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,"base64url"))],[-3,new Uint8Array(Buffer.from(jwk.y,"base64url"))]]));
  const id = randomBytes(32), userHandle = b64(randomBytes(32));
  const challenge = { purpose, challenge: b64(randomBytes(32)), origin: "http://localhost:8937", rp_id: "localhost" };
  const fields = { type: purpose === "register" ? "webauthn.create" : "webauthn.get", challenge: challenge.challenge, origin: challenge.origin, crossOrigin: false, ...data };
  const clientData = Buffer.from(duplicate ? JSON.stringify(fields).replace('"crossOrigin":false','"crossOrigin":false,"origin":"https://attacker.invalid"') : JSON.stringify(fields));
  const count = Buffer.alloc(4); count.writeUInt32BE(counter);
  const credentialLength = Buffer.alloc(2); credentialLength.writeUInt16BE(id.length);
  const authData = Buffer.concat([hash(rp), Buffer.from([flags ?? (purpose === "register" ? 0x45 : 0x05)]), count,
    ...(purpose === "register" ? [Buffer.alloc(16),credentialLength,id,Buffer.from(cose)] : [])]);
  const response = { id: b64(id), rawId: b64(id), type: "public-key", clientExtensionResults: {}, response: {
    clientDataJSON: b64(clientData), ...(purpose === "register"
      ? { attestationObject: b64(isoCBOR.encode(new Map([["fmt","none"],["attStmt",new Map()],["authData",new Uint8Array(authData)]]))), transports: ["internal"] }
      : { authenticatorData: b64(authData), signature: b64(sign("sha256",Buffer.concat([authData,hash(clientData)]),privateKey)), userHandle }) } };
  return { response, challenge, key: { credential_key: b64(id), public_key: b64(cose), user_handle: userHandle, counter: 0, transports: ["internal"] } };
}
test("real ES256 registration and assertion verify; future client-data keys remain signed", async () => {
  const registration = fixture({ data: { other_keys_can_be_added_here: "browser extensibility", future: { value: 1 } } });
  const result = await verifyLocalRiskCeremony(registration); assert.equal(result.id,registration.response.id);
  assert.equal(b64(result.publicKey),registration.key.public_key);
  assert.equal((await verifyLocalRiskCeremony(fixture({purpose:"verify"}))).counter,1);
});
for (const [name, changes] of [
  ["missing user verification", {flags:0x41}], ["missing user presence",{flags:0x44}],
  ["wrong RP hash",{rp:"attacker.invalid"}], ["cross-origin",{data:{crossOrigin:true}}],
  ["top origin",{data:{topOrigin:"http://localhost:8937"}}], ["wrong origin",{data:{origin:"https://attacker.invalid"}}],
  ["wrong challenge",{data:{challenge:b64(randomBytes(32))}}], ["wrong ceremony type",{data:{type:"webauthn.get"}}],
  ["duplicate JSON binding key",{duplicate:true}]
]) test(`registration rejects ${name}`, async()=>assert.rejects(verifyLocalRiskCeremony(fixture(changes))));
for (const [name, mutate] of [
  ["invalid signature", f=>{f.response.response.signature=b64(randomBytes(70));}],
  ["wrong user handle", f=>{f.response.response.userHandle=b64(randomBytes(32));}],
  ["unknown credential", f=>{f.key.credential_key=b64(randomBytes(32));}],
  ["counter replay", f=>{f.key.counter=1;}],
  ["counter rollback", f=>{f.key.counter=2;}],
  ["unsigned client-data modification", f=>{const d=JSON.parse(Buffer.from(f.response.response.clientDataJSON,"base64url"));d.extension="tampered";f.response.response.clientDataJSON=b64(JSON.stringify(d));}],
  ["unknown application field", f=>{f.response.grantRisk=true;}]
]) test(`assertion rejects ${name}`, async()=>{const f=fixture({purpose:"verify"});mutate(f);await assert.rejects(verifyLocalRiskCeremony(f));});
for(const flags of [0x01,0x04])test(`assertion rejects missing UP/UV flags ${flags}`,async()=>assert.rejects(verifyLocalRiskCeremony(fixture({purpose:"verify",flags}))));
test("counterless authenticators still require a fresh valid signature",async()=>assert.equal((await verifyLocalRiskCeremony(fixture({purpose:"verify",counter:0}))).counter,0));
test("Risk Passkey composition denies production, IP and unreviewed local ports",()=>{
  for(const origin of ["https://ipo.one","http://127.0.0.1:8937","http://localhost:8897","http://localhost:8937.attacker.invalid"])
    assert.throws(()=>new LocalRiskPasskeys({origin}));
});
