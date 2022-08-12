// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/escrow/RefundEscrow.sol";

import "./PaymentSplitter.sol";
import "../access/IBouncer.sol";

contract Accountant is PaymentSplitter {
    IBouncer private immutable bouncer;
    address immutable fundDelegater =
        0x000000000000000000000000000000000000FEeD;
    address payable public fundReceiver;
    address private adminWallet;

    uint8 private constant _NOT_ENTERED = 1;
    uint8 private constant _ENTERED = 2;
    uint8 private entrancy_status;

    modifier noRentrancy() {
        require(entrancy_status != _ENTERED, "Accountant: Locked");
        entrancy_status = _ENTERED;
        _;
        entrancy_status = _NOT_ENTERED;
    }

    /// @notice Set up the Accountant, Escrow contract
    /// @param _beneficiary The addresses of the admin wallet
    /// @param _fundReceiver The addresses of the fund receiver
    /// @param _bouncer The addresses of the bouncer that restricts access
    constructor(
        address _beneficiary,
        address payable _fundReceiver,
        address _bouncer
    ) PaymentSplitter(_beneficiary, fundDelegater) {
        entrancy_status = _NOT_ENTERED;

        fundReceiver = _fundReceiver;
        adminWallet = _beneficiary;
        bouncer = IBouncer(_bouncer);
    }

    function setFundReceiver(address payable newFundReceiver) public {
        require(
            newFundReceiver != address(0),
            "Accountant: new fund receiver cannot be null"
        );
        fundReceiver = newFundReceiver;
        bouncer.onlyGovernorOrAdmin(msg.sender);
    }

    function setAdminWallet(address newAdminWallet) public {
        require(
            newAdminWallet != address(0),
            "Accountant: new admin wallet cannot be null"
        );
        adminWallet = newAdminWallet;
        bouncer.onlyGovernorOrAdmin(msg.sender);
    }

    function release(address payable account) public override noRentrancy {
        require(
            account == adminWallet,
            "Accountant: only the admin wallet can receive these funds"
        );
        super.release(account);
        bouncer.onlyGovernorOrAdmin(msg.sender);
    }

    function release(IERC20 token, address account)
        public
        override
        noRentrancy
    {
        require(
            account == adminWallet,
            "Accountant: only the admin wallet can receive these funds"
        );
        super.release(token, account);
        bouncer.onlyGovernorOrAdmin(msg.sender);
    }

    function releaseToBeneficiary() public noRentrancy {
        require(
            shares(fundDelegater) > 0,
            "Accountant: account has no shares"
        );

        uint256 payment = releasable(fundDelegater);

        require(payment != 0, "Accountant: account is not due payment");

        _released[fundDelegater] += payment;
        _totalReleased += payment;

        Address.sendValue(fundReceiver, payment);
        bouncer.onlyGovernorOrAdmin(msg.sender);
        emit PaymentReleased(fundReceiver, payment);
    }

    function releaseToBeneficiary(IERC20 token) public noRentrancy {
        require(
            shares(fundDelegater) > 0,
            "Accountant: account has no shares"
        );

        uint256 payment = releasable(token, fundDelegater);

        require(payment != 0, "Accountant: account is not due payment");

        _erc20Released[token][fundDelegater] += payment;
        _erc20TotalReleased[token] += payment;

        SafeERC20.safeTransfer(token, address(fundReceiver), payment);
        bouncer.onlyGovernorOrAdmin(msg.sender);
        emit ERC20PaymentReleased(token, address(fundReceiver), payment);
    }
}
