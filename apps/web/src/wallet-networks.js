// BNB-001: network identity and offchain signatures only; never transaction authority.
export const WALLET_NETWORK_PROFILES = Object.freeze({
  "eip155:84532": Object.freeze({
    chainId: "eip155:84532",
    chainIdHex: "0x14a34",
    name: "Base Sepolia",
    nativeCurrency: Object.freeze({ name: "Ether", symbol: "ETH", decimals: 18 }),
    rpcUrls: Object.freeze(["https://sepolia.base.org/"]),
    blockExplorerUrls: Object.freeze(["https://sepolia-explorer.base.org"]),
    executionEnabled: false,
    sandboxOnly: true,
    productionApproved: false
  }),
  "eip155:1952": Object.freeze({
    chainId: "eip155:1952",
    chainIdHex: "0x7a0",
    name: "X Layer Testnet",
    nativeCurrency: Object.freeze({ name: "OKB", symbol: "OKB", decimals: 18 }),
    rpcUrls: Object.freeze(["https://testrpc.xlayer.tech/terigon"]),
    blockExplorerUrls: Object.freeze(["https://www.okx.com/web3/explorer/xlayer-test"]),
    executionEnabled: false,
    sandboxOnly: true,
    productionApproved: false
  }),
  "eip155:97": Object.freeze({
    chainId: "eip155:97", chainIdHex: "0x61", name: "BSC Testnet",
    nativeCurrency: Object.freeze({ name: "Test BNB", symbol: "tBNB", decimals: 18 }),
    rpcUrls: Object.freeze(["https://bsc-testnet-dataseed.bnbchain.org/"]),
    blockExplorerUrls: Object.freeze(["https://testnet.bscscan.com"]),
    executionEnabled: false, sandboxOnly: true, productionApproved: false
  }),
  "eip155:56": Object.freeze({
    chainId: "eip155:56", chainIdHex: "0x38", name: "BNB Smart Chain",
    nativeCurrency: Object.freeze({ name: "BNB", symbol: "BNB", decimals: 18 }),
    rpcUrls: Object.freeze(["https://bsc-dataseed.bnbchain.org/"]),
    blockExplorerUrls: Object.freeze(["https://bscscan.com"]),
    executionEnabled: false, sandboxOnly: true, productionApproved: false
  })
});

export const WALLET_NETWORK_IDS = Object.freeze(Object.keys(WALLET_NETWORK_PROFILES));
