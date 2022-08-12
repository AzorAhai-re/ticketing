// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

interface IBouncer {
    function onlyGovernor(address) external;
    function onlyAdmin(address) external;
    function onlyGovernorOrAdmin(address) external;
}
