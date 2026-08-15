import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import {
  ActorType,
  ClientAuthenticationMethod,
  HumanWalletBff,
  InMemoryActorDirectory,
  InMemoryAuthenticationEventStore,
  InMemoryCredentialRegistry,
  InMemoryHumanSessionStore,
  InMemoryWalletLoginTransactionStore,
  SenderConstraintMethod,
  assertRecentPhishingResistantAuthentication,
  createReferenceHasher
} from "../src/index.js";

const NOW = new Date("2026-07-17T12:00:00.000Z");
const ORIGIN = "https://ipo.one";
const CLIENT_ID = "ipo_one_wallet_console";
const TENANT_ID = "tenant_alpha";

function createFixture({ signatureVerifier } = {}) {
  const account = privateKeyToAccount(generatePrivateKey());
  const referenceHasher = createReferenceHasher(randomBytes(32));
  const eventStore = new InMemoryAuthenticationEventStore();
  const actorDirectory = new InMemoryActorDirectory();
  actorDirectory.register({ actorId: "actor_human_wallet", actorType: ActorType.HUMAN });
  const credentialRegistry = new InMemoryCredentialRegistry({
    referenceHasher,
    eventStore,
    actorDirectory
  });
  const credential = credentialRegistry.register({
    tenantId: TENANT_ID,
    actorId: "actor_human_wallet",
    actorType: ActorType.HUMAN,
    issuer: ORIGIN,
    externalSubject: `eip155:84532:${account.address.toLowerCase()}`,
    clientId: CLIENT_ID,
    clientAuthenticationMethod: ClientAuthenticationMethod.SIWE,
    senderConstraint: {
      method: SenderConstraintMethod.HOST_SESSION,
      thumbprint: "w".repeat(43)
    },
    roles: ["tenant_owner"],
    allowedCapabilities: ["subject.read", "integration.manage"],
    policyVersion: "security_001.v1",
    performedByActorId: "actor_security_admin",
    reasonCode: "wallet_credential_registration",
    now: NOW
  });
  const sessionStore = new InMemoryHumanSessionStore({
    referenceHasher,
    credentialRegistry,
    eventStore,
    origin: ORIGIN
  });
  const transactionStore = new InMemoryWalletLoginTransactionStore({
    referenceHasher,
    domain: "ipo.one",
    uri: "https://ipo.one/auth/wallet"
  });
  const bff = new HumanWalletBff({
    issuer: ORIGIN,
    tenantId: TENANT_ID,
    clientId: CLIENT_ID,
    transactionStore,
    sessionStore,
    credentialRegistry,
    referenceHasher,
    signatureVerifier: signatureVerifier ?? {
      async verify(input) {
        if (await verifyMessage(input) !== true) return undefined;
        return Object.freeze({
          schemaVersion: "wallet_signature_verification.v1",
          chainId: `eip155:${input.chainId}`,
          walletType: "eoa",
          signatureType: "eoa",
          verificationMethod: "eip191_eoa_v1",
          authenticationEligible: true,
          rawSignaturePersisted: false,
          credentialsIncluded: false,
          productionFundsMoved: false
        });
      }
    }
  });
  return { account, bff, credential, eventStore };
}

test("SIWE creates a one-use host session only for a pre-provisioned wallet credential", async () => {
  const fixture = createFixture();
  const login = await fixture.bff.beginLogin({
    address: fixture.account.address,
    chainId: 84532,
    now: NOW
  });
  assert.match(login.message, /ipo\.one wants you to sign in with your Ethereum account:/);
  assert.match(login.message, /Chain ID: 84532/);
  const signature = await fixture.account.signMessage({ message: login.message });
  const issued = await fixture.bff.completeLogin({
    transactionHandle: login.handle,
    signature,
    now: NOW
  });

  assert.equal(issued.cookie.name, "__Host-ipo_one_session");
  assert.equal(issued.session.authenticationMethod, ClientAuthenticationMethod.SIWE);
  assert.equal(issued.session.senderConstraintMethod, SenderConstraintMethod.HOST_SESSION);
  assert.equal(issued.session.actorId, "actor_human_wallet");
  assert.deepEqual(issued.session.amr, [
    "wallet",
    "siwe",
    "eip191_eoa_v1"
  ]);
  assert.deepEqual(issued.session.roles, ["tenant_owner"]);
  assert.deepEqual(issued.session.capabilities, ["subject.read", "integration.manage"]);
  assert.throws(
    () => assertRecentPhishingResistantAuthentication(issued.session, { now: NOW }),
    (error) => error.code === "recent_phishing_resistant_authentication_required"
  );
  const events = JSON.stringify(fixture.eventStore.list());
  assert.equal(events.includes(signature), false);
  assert.equal(events.includes(login.message), false);
  await assert.rejects(
    () => fixture.bff.completeLogin({ transactionHandle: login.handle, signature, now: NOW }),
    (error) => error.code === "wallet_transaction_rejected"
  );
});

test("SIWE rejects unapproved chains, invalid signatures, and unprovisioned wallets", async () => {
  const fixture = createFixture();
  await assert.rejects(
    () => fixture.bff.beginLogin({ address: fixture.account.address, chainId: 1, now: NOW }),
    (error) => error.code === "wallet_chain_rejected"
  );

  const wrongAccount = privateKeyToAccount(generatePrivateKey());
  const wrongSignatureLogin = await fixture.bff.beginLogin({
    address: fixture.account.address,
    chainId: 84532,
    now: NOW
  });
  const wrongSignature = await wrongAccount.signMessage({ message: wrongSignatureLogin.message });
  await assert.rejects(
    () => fixture.bff.completeLogin({
      transactionHandle: wrongSignatureLogin.handle,
      signature: wrongSignature,
      now: NOW
    }),
    (error) => error.code === "wallet_signature_rejected"
  );

  const unprovisionedLogin = await fixture.bff.beginLogin({
    address: wrongAccount.address,
    chainId: 84532,
    now: NOW
  });
  const unprovisionedSignature = await wrongAccount.signMessage({ message: unprovisionedLogin.message });
  await assert.rejects(
    () => fixture.bff.completeLogin({
      transactionHandle: unprovisionedLogin.handle,
      signature: unprovisionedSignature,
      now: NOW
    }),
    (error) => error.code === "authentication_credential_rejected"
  );
});

test("SIWE records an eligible ERC-1271 method and rejects inclusion-only evidence", async () => {
  const result = (input, authenticationEligible) => Object.freeze({
    schemaVersion: "wallet_signature_verification.v1",
    chainId: `eip155:${input.chainId}`,
    walletType: "contract",
    signatureType: "erc1271",
    verificationMethod: "eip1271_eip191_v1",
    authenticationEligible,
    rawSignaturePersisted: false,
    credentialsIncluded: false,
    productionFundsMoved: false
  });
  const eligible = createFixture({
    signatureVerifier: {
      verify: async (input) => result(input, true)
    }
  });
  const challenge = await eligible.bff.beginLogin({
    address: eligible.account.address,
    chainId: 84532,
    now: NOW
  });
  const issued = await eligible.bff.completeLogin({
    transactionHandle: challenge.handle,
    signature: `0x${"11".repeat(65)}`,
    now: NOW
  });
  assert.deepEqual(issued.session.amr, [
    "wallet",
    "siwe",
    "eip1271_eip191_v1"
  ]);

  const ineligible = createFixture({
    signatureVerifier: {
      verify: async (input) => result(input, false)
    }
  });
  const rejected = await ineligible.bff.beginLogin({
    address: ineligible.account.address,
    chainId: 1952,
    now: NOW
  });
  await assert.rejects(
    ineligible.bff.completeLogin({
      transactionHandle: rejected.handle,
      signature: `0x${"22".repeat(65)}`,
      now: NOW
    }),
    (error) => error.code === "wallet_signature_rejected"
  );
});

test("SIWE accepts an eligible ERC-6492 receipt without retaining the raw signature", async () => {
  const fixture = createFixture({
    signatureVerifier: {
      async verify(input) {
        return Object.freeze({
          schemaVersion: "wallet_signature_verification.v1",
          chainId: `eip155:${input.chainId}`,
          walletType: "counterfactual",
          signatureType: "erc6492",
          verificationMethod: "eip6492_eip191_v1",
          authenticationEligible: true,
          rawSignaturePersisted: false,
          credentialsIncluded: false,
          productionFundsMoved: false
        });
      }
    }
  });
  const challenge = await fixture.bff.beginLogin({
    address: fixture.account.address,
    chainId: 84532,
    now: NOW
  });
  const signature = `0x${"33".repeat(96)}`;
  const issued = await fixture.bff.completeLogin({
    transactionHandle: challenge.handle,
    signature,
    now: NOW
  });
  assert.deepEqual(issued.session.amr, ["wallet", "siwe", "eip6492_eip191_v1"]);
  assert.equal(JSON.stringify(fixture.eventStore.list()).includes(signature), false);
});
