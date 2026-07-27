import EthereumProvider from "@walletconnect/ethereum-provider";
import {
  APPROVED_WALLETCONNECT_PACKAGE,
  APPROVED_WALLETCONNECT_VERSION
} from "./mobile-wallet-connector.js";

function storageApplied(provider, storage) {
  return provider?.signer?.client?.core?.storage === storage;
}

export function createApprovedWalletConnectLoader({
  initialize = (options) => EthereumProvider.init(options)
} = {}) {
  if (typeof initialize !== "function") {
    throw new TypeError("WalletConnect initializer is invalid");
  }
  return async function loadApprovedWalletConnectEthereumProvider({
    packageName,
    packageVersion,
    storage,
    options
  } = {}) {
    if (
      packageName !== APPROVED_WALLETCONNECT_PACKAGE ||
      packageVersion !== APPROVED_WALLETCONNECT_VERSION ||
      !storage ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function" ||
      typeof storage.removeItem !== "function" ||
      typeof storage.getKeys !== "function" ||
      typeof storage.getEntries !== "function" ||
      storage.descriptor?.persistence !== "memory_only" ||
      !options ||
      typeof options !== "object"
    ) {
      throw new TypeError("WalletConnect loader input is outside the approved boundary");
    }

    const provider = await initialize({
      ...structuredClone(options),
      disableProviderPing: true,
      storage,
      telemetryEnabled: false
    });
    return Object.freeze({
      packageName: APPROVED_WALLETCONNECT_PACKAGE,
      packageVersion: APPROVED_WALLETCONNECT_VERSION,
      storageApplied: storageApplied(provider, storage),
      provider
    });
  };
}

export const loadApprovedWalletConnectEthereumProvider =
  createApprovedWalletConnectLoader();
