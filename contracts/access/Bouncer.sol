// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/AccessControl.sol";

import "./IBouncer.sol";

contract Bouncer is IBouncer, AccessControl {
    bytes32 private constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    address public governor;
    address public admin;

    function onlyGovernor(address __msgSender) public view override {
        require(
            hasRole(GOVERNOR_ROLE, __msgSender),
            "B01: Only the governor can perform this action"
        );
    }

    function onlyAdmin(address __msgSender) public view override {
        require(
            hasRole(ADMIN_ROLE, __msgSender),
            "B02: Only the admin can perform this action"
        );
    }

    function onlyGovernorOrAdmin(address __msgSender) public view override {
        require(
            hasRole(GOVERNOR_ROLE, __msgSender) || hasRole(ADMIN_ROLE, __msgSender),
            "B03: Only the admin or the governor can perform this action"
        );
    }

    constructor(address _admin) {
        _setRoleAdmin(DEFAULT_ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(GOVERNOR_ROLE, ADMIN_ROLE);
        _setupRole(ADMIN_ROLE, _admin);
        admin = admin;
    }

    function setGovernor(address candidateGovernor) public {
        onlyGovernorOrAdmin(_msgSender());
        require(governor == address(0), "B04: must be uninitialized");
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(candidateGovernor)
        }
        require(
            codeSize > 0,
            "B06: candidateGovernor must be a deployed contract"
        );
        governor = candidateGovernor;
        _setupRole(GOVERNOR_ROLE, candidateGovernor);
    }

    function revokeGovernor() public {
        onlyGovernorOrAdmin(_msgSender());
        governor = address(0);
        _revokeRole(GOVERNOR_ROLE, governor);
    }

    function setAdmin(address candidateAdmin) public {
        onlyGovernorOrAdmin(_msgSender());
        admin = candidateAdmin;
        _setupRole(ADMIN_ROLE, candidateAdmin);
    }

    function revokeAdmin() public {
        onlyAdmin(_msgSender());
        admin = address(0);
        _revokeRole(ADMIN_ROLE, admin);
    }
}
