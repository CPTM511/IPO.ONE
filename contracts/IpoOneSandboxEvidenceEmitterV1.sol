// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IPO.ONE Sandbox Evidence Emitter V1
/// @notice Testnet-only, zero-value hash emitter. It is not a credit, payment,
///         custody, bridge, token, settlement, or upgrade contract.
contract IpoOneSandboxEvidenceEmitterV1 {
    uint32 public constant MAX_EMISSIONS_LIMIT = 4;
    uint64 public constant MAX_LIFETIME_SECONDS = 1 days;

    address public immutable deployer;
    bytes32 public immutable deploymentIdHash;
    uint64 public immutable expiresAt;
    uint32 public immutable maxEmissions;

    bool public paused;
    bool public retired;
    uint32 public emissionCount;

    mapping(bytes32 evidenceHash => bool emitted) private emittedEvidence;

    event SandboxEvidenceEmitted(
        bytes32 indexed evidenceHash,
        bytes32 indexed obligationHash,
        bytes32 indexed paymentHash,
        bytes32 runIdHash,
        uint32 sequence
    );
    event SandboxEmitterPaused(uint32 emissionCount);
    event SandboxEmitterRetired(uint32 emissionCount);

    error DeployerOnly();
    error EmitterUnavailable();
    error InvalidConfiguration();
    error InvalidEvidence();
    error EvidenceAlreadyEmitted();
    error NativeValueRejected();

    constructor(bytes32 deploymentIdHash_, uint64 expiresAt_, uint32 maxEmissions_) {
        if (
            deploymentIdHash_ == bytes32(0) ||
            expiresAt_ <= block.timestamp ||
            expiresAt_ > block.timestamp + MAX_LIFETIME_SECONDS ||
            maxEmissions_ == 0 ||
            maxEmissions_ > MAX_EMISSIONS_LIMIT
        ) revert InvalidConfiguration();

        deployer = msg.sender;
        deploymentIdHash = deploymentIdHash_;
        expiresAt = expiresAt_;
        maxEmissions = maxEmissions_;
    }

    modifier onlyDeployer() {
        if (msg.sender != deployer) revert DeployerOnly();
        _;
    }

    function emitEvidence(
        bytes32 evidenceHash,
        bytes32 obligationHash,
        bytes32 paymentHash,
        bytes32 runIdHash
    ) external onlyDeployer {
        if (paused || retired || block.timestamp > expiresAt || emissionCount >= maxEmissions) {
            revert EmitterUnavailable();
        }
        if (
            evidenceHash == bytes32(0) ||
            obligationHash == bytes32(0) ||
            paymentHash == bytes32(0) ||
            runIdHash == bytes32(0)
        ) revert InvalidEvidence();
        if (emittedEvidence[evidenceHash]) revert EvidenceAlreadyEmitted();

        emittedEvidence[evidenceHash] = true;
        emissionCount += 1;
        emit SandboxEvidenceEmitted(
            evidenceHash,
            obligationHash,
            paymentHash,
            runIdHash,
            emissionCount
        );
    }

    /// @notice Irreversible emergency stop. No unpause method exists.
    function pause() external onlyDeployer {
        if (paused || retired) revert EmitterUnavailable();
        paused = true;
        emit SandboxEmitterPaused(emissionCount);
    }

    /// @notice Permanently retires the emitter before the ephemeral key is destroyed.
    function retire() external onlyDeployer {
        if (retired) revert EmitterUnavailable();
        paused = true;
        retired = true;
        emit SandboxEmitterRetired(emissionCount);
    }

    receive() external payable {
        revert NativeValueRejected();
    }

    fallback() external payable {
        revert NativeValueRejected();
    }
}
