// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NDAIEscrow
 * @notice Escrow contract for NDAI (Non-Disclosure AI) deal settlements.
 *         Implements the atomic accept/exit mechanism from the NDAI paper:
 *         - Founder creates a deal with an acceptance threshold
 *         - Investor deposits funds (budget cap)
 *         - TEE backend (authorized signer) settles: accept or exit
 *         - Accept → pays founder, refunds excess to investor
 *         - Exit → full refund to investor, nothing leaked
 */
contract NDAIEscrow {
    // ── Types ────────────────────────────────────────────────────────

    enum DealStatus {
        Created,    // Deal created by founder, awaiting investor deposit
        Funded,     // Investor deposited funds, ready for TEE negotiation
        Accepted,   // Deal accepted — funds released to founder
        Exited,     // Deal exited — funds refunded to investor
        Cancelled   // Deal cancelled before funding
    }

    struct Deal {
        bytes32 dealId;
        address payable seller;         // Founder wallet
        address payable buyer;          // Investor wallet
        uint256 threshold;              // Min acceptable price (wei)
        uint256 budgetCap;              // Max investor will pay (wei)
        uint256 depositedAmount;        // Actual deposited amount
        uint256 agreedPrice;            // Final agreed price (set on accept)
        DealStatus status;
        uint256 createdAt;
        uint256 settledAt;
    }

    // ── State ────────────────────────────────────────────────────────

    address public teeAuthority;        // TEE backend wallet (only this can settle)
    address public owner;               // Contract deployer
    mapping(bytes32 => Deal) public deals;
    bytes32[] public dealIds;

    // ── Events ───────────────────────────────────────────────────────

    event DealCreated(
        bytes32 indexed dealId,
        address indexed seller,
        uint256 threshold,
        uint256 timestamp
    );

    event FundsDeposited(
        bytes32 indexed dealId,
        address indexed buyer,
        uint256 amount,
        uint256 budgetCap
    );

    event DealAccepted(
        bytes32 indexed dealId,
        address indexed seller,
        address indexed buyer,
        uint256 agreedPrice,
        uint256 refundedExcess,
        uint256 timestamp
    );

    event DealExited(
        bytes32 indexed dealId,
        address indexed buyer,
        uint256 refundedAmount,
        uint256 timestamp
    );

    event DealCancelled(bytes32 indexed dealId, uint256 timestamp);

    // ── Modifiers ────────────────────────────────────────────────────

    modifier onlyTEE() {
        require(msg.sender == teeAuthority, "NDAIEscrow: caller is not TEE authority");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "NDAIEscrow: caller is not owner");
        _;
    }

    modifier dealExists(bytes32 _dealId) {
        require(deals[_dealId].createdAt != 0, "NDAIEscrow: deal does not exist");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────

    constructor(address _teeAuthority) {
        require(_teeAuthority != address(0), "NDAIEscrow: zero address");
        teeAuthority = _teeAuthority;
        owner = msg.sender;
    }

    // ── Founder: Create Deal ─────────────────────────────────────────

    /**
     * @notice Founder creates a new deal with an acceptance threshold.
     * @param _dealId   Unique deal identifier (generated off-chain)
     * @param _seller   Founder's wallet address (receives payment on accept)
     * @param _threshold Minimum acceptable price in wei
     */
    function createDeal(
        bytes32 _dealId,
        address payable _seller,
        uint256 _threshold
    ) external {
        require(deals[_dealId].createdAt == 0, "NDAIEscrow: deal already exists");
        require(_seller != address(0), "NDAIEscrow: invalid seller address");
        require(_threshold > 0, "NDAIEscrow: threshold must be > 0");

        deals[_dealId] = Deal({
            dealId: _dealId,
            seller: _seller,
            buyer: payable(address(0)),
            threshold: _threshold,
            budgetCap: 0,
            depositedAmount: 0,
            agreedPrice: 0,
            status: DealStatus.Created,
            createdAt: block.timestamp,
            settledAt: 0
        });

        dealIds.push(_dealId);

        emit DealCreated(_dealId, _seller, _threshold, block.timestamp);
    }

    // ── Investor: Deposit Funds ──────────────────────────────────────

    /**
     * @notice Investor deposits funds into escrow for a deal.
     *         The deposited amount becomes the budget cap.
     * @param _dealId The deal to fund
     */
    function depositFunds(bytes32 _dealId)
        external
        payable
        dealExists(_dealId)
    {
        Deal storage deal = deals[_dealId];
        require(deal.status == DealStatus.Created, "NDAIEscrow: deal not in Created state");
        require(msg.value > 0, "NDAIEscrow: must deposit > 0");
        require(msg.value >= deal.threshold, "NDAIEscrow: deposit below threshold");

        deal.buyer = payable(msg.sender);
        deal.budgetCap = msg.value;
        deal.depositedAmount = msg.value;
        deal.status = DealStatus.Funded;

        emit FundsDeposited(_dealId, msg.sender, msg.value, msg.value);
    }

    // ── TEE: Accept Deal ─────────────────────────────────────────────

    /**
     * @notice TEE backend calls this on mutual agreement.
     *         Pays the agreed price to the seller, refunds excess to buyer.
     * @param _dealId     The deal to accept
     * @param _agreedPrice The negotiated price (must be >= threshold and <= budget)
     */
    function acceptDeal(bytes32 _dealId, uint256 _agreedPrice)
        external
        onlyTEE
        dealExists(_dealId)
    {
        Deal storage deal = deals[_dealId];
        require(deal.status == DealStatus.Funded, "NDAIEscrow: deal not funded");
        require(_agreedPrice >= deal.threshold, "NDAIEscrow: price below threshold");
        require(_agreedPrice <= deal.depositedAmount, "NDAIEscrow: price exceeds deposit");

        deal.agreedPrice = _agreedPrice;
        deal.status = DealStatus.Accepted;
        deal.settledAt = block.timestamp;

        // Pay seller
        (bool sellerPaid, ) = deal.seller.call{value: _agreedPrice}("");
        require(sellerPaid, "NDAIEscrow: seller payment failed");

        // Refund excess to buyer
        uint256 excess = deal.depositedAmount - _agreedPrice;
        if (excess > 0) {
            (bool buyerRefunded, ) = deal.buyer.call{value: excess}("");
            require(buyerRefunded, "NDAIEscrow: buyer refund failed");
        }

        emit DealAccepted(
            _dealId,
            deal.seller,
            deal.buyer,
            _agreedPrice,
            excess,
            block.timestamp
        );
    }

    // ── TEE: Exit Deal ───────────────────────────────────────────────

    /**
     * @notice TEE backend calls this when no agreement is reached.
     *         Full refund to the investor. Nothing is leaked.
     * @param _dealId The deal to exit
     */
    function exitDeal(bytes32 _dealId)
        external
        onlyTEE
        dealExists(_dealId)
    {
        Deal storage deal = deals[_dealId];
        require(
            deal.status == DealStatus.Funded,
            "NDAIEscrow: deal not funded"
        );

        deal.status = DealStatus.Exited;
        deal.settledAt = block.timestamp;

        // Full refund to buyer
        uint256 refundAmount = deal.depositedAmount;
        deal.depositedAmount = 0;

        (bool refunded, ) = deal.buyer.call{value: refundAmount}("");
        require(refunded, "NDAIEscrow: refund failed");

        emit DealExited(_dealId, deal.buyer, refundAmount, block.timestamp);
    }

    // ── Admin ────────────────────────────────────────────────────────

    /**
     * @notice Cancel a deal that hasn't been funded yet.
     */
    function cancelDeal(bytes32 _dealId)
        external
        dealExists(_dealId)
    {
        Deal storage deal = deals[_dealId];
        require(deal.status == DealStatus.Created, "NDAIEscrow: can only cancel unfunded deals");
        require(
            msg.sender == deal.seller || msg.sender == owner,
            "NDAIEscrow: not authorized"
        );

        deal.status = DealStatus.Cancelled;
        deal.settledAt = block.timestamp;

        emit DealCancelled(_dealId, block.timestamp);
    }

    /**
     * @notice Update the TEE authority address.
     */
    function setTEEAuthority(address _newAuthority) external onlyOwner {
        require(_newAuthority != address(0), "NDAIEscrow: zero address");
        teeAuthority = _newAuthority;
    }

    // ── View Functions ───────────────────────────────────────────────

    function getDeal(bytes32 _dealId) external view returns (Deal memory) {
        return deals[_dealId];
    }

    function getDealCount() external view returns (uint256) {
        return dealIds.length;
    }

    function getDealStatus(bytes32 _dealId) external view returns (DealStatus) {
        return deals[_dealId].status;
    }
}
