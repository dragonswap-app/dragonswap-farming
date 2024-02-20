 SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract DragonswapStakerBoosted is Ownable {
    using SafeERC20 for IERC20;

    IERC20 immutable public stakingToken;
    IERC20 immutable public rewardToken;
    // IERC20 immutable public boosterToken; -> SEI

    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    uint256 public accRewardsPerShare;
    uint256 public rewardPerBlock;
    uint256 public boostRewardSupply;
    uint256 public lastRewardBlock;
    uint256 public startBlock;
    uint256 public endBlock;

    mapping(address => UserInfo) public userInfo;

    event Deposit(address indexed user, uint256 amount);
    event Claim(address indexed user, uint256 pending, uint256 pendingBoosted);
    event Withdraw(address indexed user, uint256 amount, uint256 pending, uint256 pendingBoosted);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event Fund(uint256 amount);

    constructor(
        IERC20 _stakingToken,
        IERC20 _rewardToken,
        uint256 _rewardPerBlock,
        uint256 _startBlock
    ) Ownable(msg.sender) {
        stakingToken = _stakingToken;
        rewardToken = _rewardToken;
        rewardPerBlock = _rewardPerBlock;
        startBlock = _startBlock;
        endBlock = _startBlock;
    }

    /// @dev only owner should fund, this is estableshed so that we can keep
    /// the proper proportion of ERC20 and SEI rewards at all times
    function fund(uint256 amount) external payable onlyOwner {
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        endBlock += amount / rewardPerBlock;
        boostRewardSupply = address(this).balance;
        emit Fund(amount);
    }

    function update() public {
        if (block.number <= lastRewardBlock) {
            return;
        }
        uint256 totalStaked = stakingToken.balanceOf(address(this));
        if (totalStaked == 0 && block.number <= endBlock) {
            lastRewardBlock = block.number;
            return;
        }
        uint256 block = block.number > endBlock ? endBlock : block.number;
        uint256 blocksElapsed = block - lastRewardBlock;
        uint256 unlockedReward = blocksElapsed * rewardPerBlock;
        accRewardsPerShare = accRewardsPerShare + unlockedReward * 1e12 / totalStaked;
        lastRewardBlock = block;
    }

    function deposit(uint256 amount) external {
        UserInfo storage user = userInfo[msg.sender];
        update();
        if (user.amount > 0) {
            uint256 pending = user.amount * accRewardsPerShare / 1e12 - user.rewardDebt;
            rewardToken.safeTransfer(msg.sender, pending);
        }
        stakingToken.safeTransferFrom(
            address(msg.sender),
            address(this),
            amount
        );
        user.amount += amount;
        user.rewardDebt = user.amount * accRewardsPerShare / 1e12;
        emit Deposit(msg.sender, amount);
    }

    function claim() external {
        UserInfo storage user = userInfo[msg.sender];
        update();
        uint256 pending = user.amount * accRewardsPerShare / 1e12 - user.rewardDebt;
        rewardToken.safeTransfer(msg.sender, pending);
        user.rewardDebt += pending;
        if (boostRewardSupply > 1e12) {
            uint256 pendingBoosted = pending * boostRewardSupply / stakingToken.balanceOf(address(this));
            safeTransferSei(msg.sender, pendingBoosted);
        }
        emit Claim(msg.sender, pending, pendingBoosted);
    }

    function withdraw(uint256 amount) external {
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount >= amount, "Insufficient amount.");
        update();
        uint256 pending = user.amount * accRewardsPerShare / 1e12 - user.rewardDebt;
        rewardToken.safeTransfer(msg.sender, pending);
        if (boostRewardSupply > 1e12) {
            uint256 pendingBoosted = pending * boostRewardSupply / stakingToken.balanceOf(address(this));
            safeTransferSei(msg.sender, pendingBoosted);
        }
        user.amount = user.amount - amount;
        user.rewardDebt = user.amount * accRewardsPerShare / 1e12;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount, pending, pendingBoosted);
    }

    function emergencyWithdraw() external {
        UserInfo storage user = userInfo[msg.sender];
        stakingToken.safeTransfer(msg.sender, user.amount);
        emit EmergencyWithdraw(msg.sender, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    function pendingRewards(address account) public view returns (uint256) {
        UserInfo memory user = userInfo[account];
        return user.amount * accRewardsPerShare / 1e12 - user.rewardDebt;
    }

    function pendingRewardsBoosted(address account) public view returns (uint256) {
        UserInfo memory user = userInfo[account];
        uint256 pending = user.amount * accRewardsPerShare / 1e12 - user.rewardDebt;
        return pending * boostRewardSupply / stakingToken.balanceOf(address(this));
    }

    function safeTransferSei(address to, uint256 amount) private {
        if (amount > 0) {
            (bool success, ) = to.call{value: amount}("");
            if (!success) revert();
        }
    }

    function receive() {}
}
