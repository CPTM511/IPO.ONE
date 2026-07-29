// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IPO.ONE Evidence Anchor Registry V1
/// @notice Base Sepolia-only, zero-value registry for hash-only Evidence
///         envelopes. It is not a lending, payment, custody, token, settlement,
///         relayer, arbitrary-call, or upgrade contract.
contract IpoOneEvidenceAnchorRegistryV1 {
    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84532;
    uint16 public constant MAX_BATCH_SIZE = 16;
    uint64 public constant MAX_CONFIRMATION_LIFETIME_SECONDS = 15 minutes;

    struct EvidenceInput {
        bytes32 evidenceHash;
        bytes32 eventTypeHash;
        bytes32 aggregateHash;
    }

    struct EvidenceAnchor {
        address attestor;
        bytes32 eventTypeHash;
        bytes32 aggregateHash;
        bytes32 actionDigest;
        uint64 nonce;
        uint64 anchoredAt;
        uint16 batchOrdinal;
        uint16 batchSize;
    }

    mapping(address attestor => uint64 nonce) public nextNonce;
    mapping(bytes32 evidenceHash => EvidenceAnchor anchor) private anchors;

    event EvidenceAnchored(
        bytes32 indexed evidenceHash,
        address indexed attestor,
        bytes32 indexed actionDigest,
        bytes32 eventTypeHash,
        bytes32 aggregateHash,
        uint64 nonce,
        uint16 batchOrdinal,
        uint16 batchSize
    );

    error UnsupportedChain();
    error InvalidBatch();
    error InvalidEvidence();
    error InvalidActionDigest();
    error InvalidNonce();
    error InvalidExpiry();
    error EvidenceAlreadyAnchored();
    error NativeValueRejected();

    constructor() {
        if (block.chainid != BASE_SEPOLIA_CHAIN_ID) revert UnsupportedChain();
    }

    function anchorEvidence(
        EvidenceInput[] calldata items,
        bytes32 actionDigest,
        uint64 nonce,
        uint64 expiresAt
    ) external {
        uint256 length = items.length;
        if (length == 0 || length > MAX_BATCH_SIZE) revert InvalidBatch();
        if (actionDigest == bytes32(0)) revert InvalidActionDigest();
        if (nonce != nextNonce[msg.sender]) revert InvalidNonce();
        if (
            expiresAt <= block.timestamp ||
            expiresAt > block.timestamp + MAX_CONFIRMATION_LIFETIME_SECONDS
        ) revert InvalidExpiry();

        uint16 batchSize = uint16(length);
        for (uint16 index = 0; index < batchSize; index += 1) {
            EvidenceInput calldata item = items[index];
            if (
                item.evidenceHash == bytes32(0) ||
                item.eventTypeHash == bytes32(0) ||
                item.aggregateHash == bytes32(0)
            ) revert InvalidEvidence();
            if (anchors[item.evidenceHash].attestor != address(0)) {
                revert EvidenceAlreadyAnchored();
            }
            anchors[item.evidenceHash] = EvidenceAnchor({
                attestor: msg.sender,
                eventTypeHash: item.eventTypeHash,
                aggregateHash: item.aggregateHash,
                actionDigest: actionDigest,
                nonce: nonce,
                anchoredAt: uint64(block.timestamp),
                batchOrdinal: index,
                batchSize: batchSize
            });
            emit EvidenceAnchored(
                item.evidenceHash,
                msg.sender,
                actionDigest,
                item.eventTypeHash,
                item.aggregateHash,
                nonce,
                index,
                batchSize
            );
        }
        nextNonce[msg.sender] = nonce + 1;
    }

    function getAnchor(bytes32 evidenceHash)
        external
        view
        returns (EvidenceAnchor memory)
    {
        return anchors[evidenceHash];
    }

    receive() external payable {
        revert NativeValueRejected();
    }

    fallback() external payable {
        revert NativeValueRejected();
    }
}
