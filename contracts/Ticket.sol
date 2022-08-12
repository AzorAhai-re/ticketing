// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "erc721a/contracts/ERC721A.sol";

import "./access/IBouncer.sol";
import "./finance/Accountant.sol";

/// @title Ticket NFTs
/// @author AzorAhai
/// @notice Mints tickets which may be for VIPs for a specifies event ID
/// @dev Extends the idea of bit masking from Azuki, utilizing the `extraData`
////     slot from `_packedOwnerships` to define VIP status and event ID of tickets
contract Ticket is ERC721A, Pausable {
    // =============================================================
    //                    CONSTANTS FOR METADATA
    // =============================================================

    uint24 private constant _BITMASK_EVENT_ID = (1 << 1) - 1;
    uint24 private constant _BITPOS_EVENT_ID = 1;
    uint256 private constant _BITMASK_VIP_FEE = (1 << 128) - 1;
    uint256 private constant _BITPOS_VIP_FEE = 128;
    // =============================================================
    //                            STORAGE
    // =============================================================

    uint256 public MAX_MINT;

    IBouncer private bouncer;
    address private accountant;

    uint8 private constant _NOT_ENTERED = 1;
    uint8 private constant _ENTERED = 2;
    uint8 private entrancy_status;

    uint24 public currEvent;
    // Bits Layout
    //
    // - [0-127] `regularMintFee`
    // - [128..255] `vipMintFee`
    uint256 public FEE_SCHEDULES;
    // # of tickets in stock for `currEvent`
    uint256 public ticketsLeft;
    // after this rate limit is reached, a user can no longer mint
    uint256 private rateLimitEpoch = 1 hours;
    mapping(address => uint256) private lastMinted;

    string private latestBaseUri;

    modifier noRentrancy() {
        require(entrancy_status != _ENTERED, "T07: Locked");
        entrancy_status = _ENTERED;
        _;
        entrancy_status = _NOT_ENTERED;
    }

    modifier onlyDeployedContract(address deployedContract) {
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(deployedContract)
        }
        require(
            codeSize > 0,
            "T00: contract given must be a deployed contract"
        );
        _;
    }

    constructor(
        address _accountant,
        address _bouncer,
        string memory name,
        string memory symbol,
        uint256 _initMintFee,
        uint256 _initMaxMint
    ) ERC721A(name, symbol) {
        entrancy_status = _NOT_ENTERED;

        accountant = _accountant;
        bouncer = IBouncer(_bouncer);
        FEE_SCHEDULES = _initMintFee;
        MAX_MINT = _initMaxMint;
    }
    
    function setBaseUri(string calldata newBaseUri) public {
        latestBaseUri = newBaseUri;
        bouncer.onlyGovernorOrAdmin(msg.sender);
    }

    function _baseURI() internal view override returns (string memory) {
        return latestBaseUri;
    }

    function setAccountant(address newAccountant)
        public
        onlyDeployedContract(newAccountant)
    {
        accountant = newAccountant;
        bouncer.onlyGovernorOrAdmin(msg.sender);
    }

    function setBouncer(address newBouncer)
        public
        onlyDeployedContract(newBouncer)
    {
        IBouncer oldBouncer = bouncer;
        bouncer = IBouncer(newBouncer);
        oldBouncer.onlyGovernorOrAdmin(msg.sender);
    }

    function setMINTFEESCHEDULES(uint256 regMintFee, uint256 vipMintFee)
        public
    {
        require(
            regMintFee <= type(uint128).max && vipMintFee < type(uint128).max,
            "T05: check candidate mint fees"
        );
        FEE_SCHEDULES = (vipMintFee << _BITPOS_VIP_FEE) | regMintFee;
        bouncer.onlyGovernorOrAdmin(msg.sender);
    }

    function getMINTFEESCHEDULES() public view returns (uint128, uint128) {
        uint128 regFee = uint128(FEE_SCHEDULES & _BITMASK_VIP_FEE);
        uint128 vipFee = uint128(FEE_SCHEDULES >> _BITPOS_VIP_FEE);

        return (regFee, vipFee);
    }

    function setMAXMINT(uint256 newThreshold) public {
        MAX_MINT = newThreshold;
        bouncer.onlyGovernorOrAdmin(msg.sender);
    }

    function setNextEventID() public {
        currEvent += uint24(1) << _BITPOS_EVENT_ID;
        // it should revert regardless, but this is insurance
        require(currEvent <= 1 << 23, "T03: EventID overflow");
        bouncer.onlyGovernorOrAdmin(msg.sender);
    }

    function setTicketsLeft(uint256 newStock) public {
        ticketsLeft = newStock;
        bouncer.onlyGovernorOrAdmin(msg.sender);
    }

    function checkTicketsLeft(uint256 quantity)
        internal
        view
        returns (uint256)
    {
        return quantity > ticketsLeft ? ticketsLeft : quantity;
    }

    function pauseIfSoldOut() internal {
        if (ticketsLeft == 0) {
            _pause();
        }
        bouncer.onlyGovernorOrAdmin(msg.sender);
    }

    function _packExtraData(uint24 isVip, uint24 eventID)
        private
        pure
        returns (uint24 result)
    {
        require(isVip < 2, "T04: isVip can either be 1 or 0");
        assembly {
            isVip := and(isVip, _BITMASK_EVENT_ID)
            result := or(isVip, eventID)
        }
    }

    function getVipStatus(uint256 tokenId) public view returns (bool) {
        TokenOwnership memory ownership = _ownershipOf(tokenId);
        uint24 flag = ownership.extraData & _BITMASK_EVENT_ID;
        return flag == 1 ? true : false;
    }

    function getEventID(uint256 tokenId) public view returns (uint24 eventId) {
        TokenOwnership memory ownership = _ownershipOf(tokenId);
        eventId = ownership.extraData >> _BITPOS_EVENT_ID;
    }

    function setRateLimitParams(uint256 newEpoch) public {
        rateLimitEpoch = newEpoch;
        bouncer.onlyGovernorOrAdmin(msg.sender);
    }

    function checkRateLimit(address to) internal view {
        uint256 lastMintedToken = lastMinted[to];
        TokenOwnership memory ownerData = _ownershipAt(lastMintedToken);
        uint64 lastMintedTS = ownerData.startTimestamp;
        if (ownerData.addr == to && lastMintedTS > 0) {
            if (block.timestamp - lastMintedTS < rateLimitEpoch) {
                revert("T06: rate limit for minting reached");
            }
        }
    }

    function mint(uint256 quantity) public payable whenNotPaused noRentrancy {
        require(quantity <= MAX_MINT, "T02: Too many tickets requested");
        uint256 tokenToSet = _nextTokenId();
        checkRateLimit(msg.sender);
        lastMinted[msg.sender] = tokenToSet;

        uint256 actualMintQuantity = checkTicketsLeft(quantity);

        (uint256 regularMintFee, uint256 vipMintFee) = getMINTFEESCHEDULES();
        bool isRegularMint = msg.value == regularMintFee * actualMintQuantity;
        require(
            isRegularMint || msg.value == vipMintFee * actualMintQuantity,
            "T01: Mint fee under or overvalued"
        );
        uint24 isVip = isRegularMint ? 0 : 1;

        _mint(msg.sender, actualMintQuantity);
        ticketsLeft -= actualMintQuantity;
        _setExtraDataAt(tokenToSet, _packExtraData(isVip, currEvent));

        (bool wasSent, ) = accountant.call{value: msg.value}("");
        require(wasSent, "T09: Failed paying Accountant");
    }

    function _extraData(
        address from, /* solhint-disable no-unused-vars */
        address to, /* solhint-disable no-unused-vars */
        uint24 previousExtraData
    ) internal pure override returns (uint24) {
        return previousExtraData;
    }
}
