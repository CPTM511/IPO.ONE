import assert from "node:assert/strict";
import test from "node:test";
import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { createApprovedWalletConnectLoader } from "../src/walletconnect-ethereum-provider-loader.js";
import { createMobileWalletConnector } from "../src/mobile-wallet-connector.js";

const METHODS = ["eth_requestAccounts", "eth_accounts", "eth_chainId", "wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_getCapabilities", "personal_sign", "eth_signTypedData_v4"];
const EVENTS = ["accountsChanged", "chainChanged"];

for (const chain of [84532, 1952, 97, 56]) test(`actual pinned SDK proposes only approved SIWE capabilities on selected chain ${chain}`, async () => {
  let proposal;
  // Exercise the installed SDK's real getRpcConfig, loadConnectOpts and
  // buildNamespaces. Only the UniversalProvider transport is replaced; no relay,
  // real Project ID, wallet, signature or network request is used.
  const loader = createApprovedWalletConnectLoader({ initialize: async options => {
    const sdk = new EthereumProvider();
    sdk.rpc = sdk.getRpcConfig(options);
    sdk.signer = { client: { core: { storage: options.storage } },
      connect: async input => { proposal = structuredClone(input); },
      disconnect: async () => {}, logger: { error() {} } };
    return sdk;
  } });
  const mobile = createMobileWalletConnector({ projectId: "1".repeat(32),
    expectedOrigin: "https://ipo.one", currentOrigin: "https://ipo.one", loadEthereumProvider: loader });
  try {
    await mobile.connect({ chainId: `eip155:${chain}` });
    assert.deepEqual(proposal.namespaces.eip155.chains, [`eip155:${chain}`]);
    assert.deepEqual(proposal.namespaces.eip155.methods, ["personal_sign"]);
    const optional = proposal.optionalNamespaces?.eip155;
    const requestedMethods = [...new Set([...proposal.namespaces.eip155.methods, ...(optional?.methods ?? [])])].sort();
    assert.deepEqual(requestedMethods, [...METHODS].sort());
    const requestedEvents = [...new Set([...proposal.namespaces.eip155.events, ...(optional?.events ?? [])])].sort();
    assert.deepEqual(requestedEvents, [...EVENTS].sort());
    assert.deepEqual([...new Set([...proposal.namespaces.eip155.chains, ...(optional?.chains ?? [])])].sort(), ["eip155:84532", "eip155:1952", "eip155:97", "eip155:56"].sort());
    assert.equal(requestedMethods.some(method => /send|signTransaction|eth_sign$|requestPermissions/.test(method)), false);
  } finally { await mobile.dispose(); }
});
