// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

library NonStandardTransfer {
    function nonStandardTransfer(IERC20 token, uint256 amount) internal returns (uint256 received) {
        uint256 previousBalance = token.balanceOf(address(this));
        SafeERC20.safeTransferFrom(token, msg.sender, address(this), amount);
        return token.balanceOf(address(this)) - previousBalance;
    }
}
