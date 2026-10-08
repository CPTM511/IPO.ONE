import {
  encodeAbiParameters, encodeEventTopics, encodeFunctionResult, getAbiItem, keccak256, parseAbi
} from "viem";
import {
  ANVIL_EVENT_ABI, ANVIL_READ_ABI, ANVIL_SOURCE_REVISION
} from "../../src/anvil-readonly-abi.js";

// Entirely synthetic. These addresses, hashes and amounts are not deployed records.
const address = (digit) => `0x${digit.repeat(40)}`;
export const TX = `0x${"a".repeat(64)}`;
export const BLOCK_HASH = `0x${"b".repeat(64)}`;
export const CODE = "0x60006000";
export const PROFILE = {
  chainId: "eip155:84532", contractAddress: address("1"),
  implementationAddress: address("2"), implementationCodeHash: keccak256(CODE),
  contractVersion: "3.0.0", sourceRevision: ANVIL_SOURCE_REVISION,
  dataMode: "synthetic", sourceRef: "fixture:anvil-001",
  deploymentVerificationRef: "fixture:never-deployed"
};
export const BLOCK = { hash: BLOCK_HASH, number: "0x10", timestamp: "0x6a000000" };
export const STATE = {
  collateralId: 11n, creator: address("3"), beneficiary: address("4"),
  expirationTimestamp: 1_900_000_000, collateralFactorBasisPoints: 0,
  liquidatorIncentiveBasisPoints: 0, collateralContract: address("5"),
  collateralTokenAddress: address("6"), collateralTokenAmount: 2n ** 200n,
  claimableCollateral: 1_000n, creditedTokenAddress: address("7"), creditedTokenAmount: 900n
};
export const EVENT_ARGS = {
  LOCCreatedV3: {
    creator: STATE.creator, beneficiary: STATE.beneficiary,
    tag: "0x7365637265742d666978747572652d746167",
    collateralContractAddress: STATE.collateralContract,
    collateralTokenAddress: STATE.collateralTokenAddress,
    collateralTokenAmount: STATE.collateralTokenAmount,
    claimableCollateral: STATE.claimableCollateral,
    expirationTimestamp: STATE.expirationTimestamp,
    creditedTokenAddress: STATE.creditedTokenAddress,
    creditedTokenAmount: STATE.creditedTokenAmount, id: 7n, collateralId: STATE.collateralId
  },
  LOCCanceled: { id: 7n },
  LOCExtended: { id: 7n, oldExpirationTimestamp: 1_900_000_000, newExpirationTimestamp: 1_900_001_000 },
  LOCConverted: { id: 7n, initiator: address("8"), liquidator: address("9"), liquidationAmount: 800n, liquidationFeeAmount: 2n, creditedTokenAmountReceived: 798n },
  LOCPartiallyLiquidated: { id: 7n, initiator: address("8"), liquidator: address("9"), liquidationAmount: 100n, liquidationFeeAmount: 1n, creditedTokenAmountReceived: 99n },
  LOCRedeemed: { id: 7n, destinationAddress: address("4"), creditedTokenAmount: 500n, collateralTokenAmountUsed: 550n, claimableCollateralUsed: 550n },
  LOCCollateralModified: { id: 7n, oldCollateralAmount: 1_000n, newCollateralAmount: 1_100n, newClaimableCollateral: 1_050n }
};

export function eventLog(eventName = "LOCRedeemed", index = 0, overrides = {}, argsOverrides = {}) {
  const abi = getAbiItem({ abi: ANVIL_EVENT_ABI, name: eventName });
  const args = { ...EVENT_ARGS[eventName], ...argsOverrides };
  const parameters = abi.inputs.filter((input) => !input.indexed);
  return {
    address: PROFILE.contractAddress, blockHash: BLOCK_HASH, blockNumber: BLOCK.number,
    transactionHash: TX, logIndex: `0x${index.toString(16)}`, removed: false,
    topics: encodeEventTopics({ abi: ANVIL_EVENT_ABI, eventName, args }),
    data: encodeAbiParameters(parameters, parameters.map(({ name }) => args[name])),
    ...overrides
  };
}

// Historical signatures are fixtures only; no V1/V2 runtime codec is enabled.
// ABI-derived fragments use the upstream ISC notice in ANVIL-001 documentation.
const LEGACY_ABI = parseAbi([
  "event LOCCreated(address indexed creator, address indexed beneficiary, address collateralContractAddress, address collateralTokenAddress, uint256 collateralTokenAmount, uint256 claimableCollateral, uint32 expirationTimestamp, uint16 collateralFactorBasisPoints, uint16 liquidatorIncentiveBasisPoints, address creditedTokenAddress, uint256 creditedTokenAmount, uint96 id)",
  "event LOCCreatedV2(address indexed creator, address indexed beneficiary, bytes32 indexed tag, address collateralContractAddress, address collateralTokenAddress, uint256 collateralTokenAmount, uint256 claimableCollateral, uint32 expirationTimestamp, uint16 collateralFactorBasisPoints, uint16 liquidatorIncentiveBasisPoints, address creditedTokenAddress, uint256 creditedTokenAmount, uint96 id, uint96 collateralId)"
]);

export function legacyCreationLog(eventName) {
  const abi = getAbiItem({ abi: LEGACY_ABI, name: eventName });
  const args = { ...EVENT_ARGS.LOCCreatedV3, tag: `0x${"ab".repeat(32)}`,
    collateralFactorBasisPoints: 3_500, liquidatorIncentiveBasisPoints: 500 };
  const parameters = abi.inputs.filter((input) => !input.indexed);
  return eventLog("LOCCreatedV3", 0, {
    topics: encodeEventTopics({ abi: LEGACY_ABI, eventName, args }),
    data: encodeAbiParameters(parameters, parameters.map(({ name }) => args[name]))
  });
}

export function fixtureRpc({ logs = [eventLog()], state = STATE, override } = {}) {
  const calls = [];
  const receipt = { status: "0x1", transactionHash: TX, blockHash: BLOCK_HASH, blockNumber: BLOCK.number, logs };
  return {
    calls,
    async call(method, params) {
      calls.push({ method, params: structuredClone(params) });
      const fallback = {
        eth_chainId: "0x14a34",
        eth_getTransactionReceipt: receipt,
        eth_getBlockByHash: BLOCK,
        eth_getBlockByNumber: BLOCK,
        eth_getStorageAt: `0x${"0".repeat(24)}${PROFILE.implementationAddress.slice(2)}`,
        eth_getCode: CODE,
        eth_call: encodeFunctionResult({ abi: ANVIL_READ_ABI, functionName: "getLOC", result: state })
      }[method];
      if (fallback === undefined) throw new Error("unexpected RPC method");
      return override ? override(method, params, structuredClone(fallback), calls) : structuredClone(fallback);
    }
  };
}
