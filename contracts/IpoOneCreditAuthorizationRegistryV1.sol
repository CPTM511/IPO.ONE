// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IPO.ONE Credit Authorization Registry V1
/// @notice Testnet-only, non-custodial projection of an off-chain authorization.
///         PostgreSQL and the accepted Offer remain canonical. This contract
///         cannot lend, price, custody, transfer, or call external contracts.
contract IpoOneCreditAuthorizationRegistryV1 {
    enum AuthorizationStatus { None, Active, Suspended, Revoked, Closed }

    struct AuthorizationRecord {
        address account;
        bytes32 subjectAccountHash;
        bytes32 acceptedOfferHash;
        bytes32 policyHash;
        bytes32 providerScopeHash;
        bytes32 creditStateHash;
        bytes32 obligationProofHash;
        uint64 validUntil;
        uint64 version;
        AuthorizationStatus status;
    }

    address public immutable operator;
    bytes32 public immutable chainProfileHash;
    uint32 public immutable chainProfileVersion;
    address public publisher;
    bool public paused;

    mapping(bytes32 authorizationHash => AuthorizationRecord record) private records;

    event PublisherRotated(address indexed previousPublisher, address indexed newPublisher);
    event RegistryPauseChanged(bool paused);
    event AuthorizationPublished(
        bytes32 indexed authorizationHash,
        address indexed account,
        bytes32 indexed subjectAccountHash,
        bytes32 acceptedOfferHash,
        bytes32 policyHash,
        bytes32 providerScopeHash,
        bytes32 creditStateHash,
        bytes32 obligationProofHash,
        uint64 validUntil,
        uint64 version
    );
    event AuthorizationStatusChanged(
        bytes32 indexed authorizationHash,
        AuthorizationStatus indexed status,
        uint64 version,
        bytes32 obligationProofHash
    );
    event AuthorizationProofUpdated(
        bytes32 indexed authorizationHash,
        bytes32 creditStateHash,
        bytes32 obligationProofHash,
        uint64 version
    );

    error OperatorOnly();
    error PublisherOnly();
    error RegistryPaused();
    error InvalidConfiguration();
    error InvalidAuthorization();
    error AuthorizationAlreadyExists();
    error AuthorizationNotFound();
    error StaleAuthorizationVersion();
    error InvalidAuthorizationTransition();
    error NativeValueRejected();

    constructor(bytes32 chainProfileHash_, uint32 chainProfileVersion_, address publisher_) {
        if (chainProfileHash_ == bytes32(0) || chainProfileVersion_ == 0 || publisher_ == address(0)) {
            revert InvalidConfiguration();
        }
        operator = msg.sender;
        chainProfileHash = chainProfileHash_;
        chainProfileVersion = chainProfileVersion_;
        publisher = publisher_;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert OperatorOnly();
        _;
    }

    modifier onlyPublisher() {
        if (msg.sender != publisher) revert PublisherOnly();
        if (paused) revert RegistryPaused();
        _;
    }

    function rotatePublisher(address newPublisher) external onlyOperator {
        if (newPublisher == address(0) || newPublisher == publisher) revert InvalidConfiguration();
        address previousPublisher = publisher;
        publisher = newPublisher;
        emit PublisherRotated(previousPublisher, newPublisher);
    }

    function setPaused(bool paused_) external onlyOperator {
        if (paused == paused_) revert InvalidConfiguration();
        paused = paused_;
        emit RegistryPauseChanged(paused_);
    }

    function publishAuthorization(
        bytes32 authorizationHash,
        address account,
        bytes32 subjectAccountHash,
        bytes32 acceptedOfferHash,
        bytes32 policyHash,
        bytes32 providerScopeHash,
        bytes32 creditStateHash,
        bytes32 obligationProofHash,
        uint64 validUntil
    ) external onlyPublisher {
        if (records[authorizationHash].status != AuthorizationStatus.None) revert AuthorizationAlreadyExists();
        if (
            authorizationHash == bytes32(0) || account == address(0) ||
            subjectAccountHash == bytes32(0) || acceptedOfferHash == bytes32(0) ||
            policyHash == bytes32(0) || providerScopeHash == bytes32(0) ||
            creditStateHash == bytes32(0) || validUntil <= block.timestamp
        ) revert InvalidAuthorization();

        records[authorizationHash] = AuthorizationRecord({
            account: account,
            subjectAccountHash: subjectAccountHash,
            acceptedOfferHash: acceptedOfferHash,
            policyHash: policyHash,
            providerScopeHash: providerScopeHash,
            creditStateHash: creditStateHash,
            obligationProofHash: obligationProofHash,
            validUntil: validUntil,
            version: 1,
            status: AuthorizationStatus.Active
        });
        emit AuthorizationPublished(
            authorizationHash, account, subjectAccountHash, acceptedOfferHash,
            policyHash, providerScopeHash, creditStateHash, obligationProofHash,
            validUntil, 1
        );
    }

    function updateProof(
        bytes32 authorizationHash,
        uint64 expectedVersion,
        bytes32 creditStateHash,
        bytes32 obligationProofHash
    ) external onlyPublisher {
        AuthorizationRecord storage record = _current(authorizationHash, expectedVersion);
        if (record.status != AuthorizationStatus.Active && record.status != AuthorizationStatus.Suspended) {
            revert InvalidAuthorizationTransition();
        }
        if (
            creditStateHash == bytes32(0) ||
            (record.obligationProofHash != bytes32(0) && obligationProofHash == bytes32(0)) ||
            (creditStateHash == record.creditStateHash && obligationProofHash == record.obligationProofHash)
        ) revert InvalidAuthorization();
        record.creditStateHash = creditStateHash;
        record.obligationProofHash = obligationProofHash;
        record.version = expectedVersion + 1;
        emit AuthorizationProofUpdated(authorizationHash, creditStateHash, obligationProofHash, record.version);
    }

    function suspendAuthorization(bytes32 authorizationHash, uint64 expectedVersion) external onlyPublisher {
        AuthorizationRecord storage record = _current(authorizationHash, expectedVersion);
        if (record.status != AuthorizationStatus.Active) revert InvalidAuthorizationTransition();
        _setStatus(authorizationHash, record, AuthorizationStatus.Suspended, expectedVersion);
    }

    function revokeAuthorization(bytes32 authorizationHash, uint64 expectedVersion) external onlyPublisher {
        AuthorizationRecord storage record = _current(authorizationHash, expectedVersion);
        if (record.status != AuthorizationStatus.Active && record.status != AuthorizationStatus.Suspended) {
            revert InvalidAuthorizationTransition();
        }
        _setStatus(authorizationHash, record, AuthorizationStatus.Revoked, expectedVersion);
    }

    function closeAuthorization(
        bytes32 authorizationHash,
        uint64 expectedVersion,
        bytes32 settledObligationProofHash
    ) external onlyPublisher {
        AuthorizationRecord storage record = _current(authorizationHash, expectedVersion);
        if (
            (record.status != AuthorizationStatus.Active && record.status != AuthorizationStatus.Suspended) ||
            settledObligationProofHash == bytes32(0)
        ) revert InvalidAuthorizationTransition();
        record.obligationProofHash = settledObligationProofHash;
        _setStatus(authorizationHash, record, AuthorizationStatus.Closed, expectedVersion);
    }

    function getAuthorization(bytes32 authorizationHash) external view returns (AuthorizationRecord memory) {
        AuthorizationRecord memory record = records[authorizationHash];
        if (record.status == AuthorizationStatus.None) revert AuthorizationNotFound();
        return record;
    }

    function isActive(bytes32 authorizationHash) external view returns (bool) {
        AuthorizationRecord memory record = records[authorizationHash];
        return !paused && record.status == AuthorizationStatus.Active && record.validUntil > block.timestamp;
    }

    function _current(bytes32 authorizationHash, uint64 expectedVersion)
        private view returns (AuthorizationRecord storage record)
    {
        record = records[authorizationHash];
        if (record.status == AuthorizationStatus.None) revert AuthorizationNotFound();
        if (record.version != expectedVersion) revert StaleAuthorizationVersion();
    }

    function _setStatus(
        bytes32 authorizationHash,
        AuthorizationRecord storage record,
        AuthorizationStatus status,
        uint64 expectedVersion
    ) private {
        record.status = status;
        record.version = expectedVersion + 1;
        emit AuthorizationStatusChanged(authorizationHash, status, record.version, record.obligationProofHash);
    }

    receive() external payable { revert NativeValueRejected(); }
    fallback() external payable { revert NativeValueRejected(); }
}
