// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

error FarmClosed();
error UnauthorizedWithdrawal();

interface IERC20Metadata {
    function decimals() external view returns(uint8);
}

contract DragonswapStaker is Ownable {
    using SafeERC20 for IERC20;

    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    struct PoolInfo {
        IERC20 pooledToken;
        uint256 allocPoint;
        uint256 lastRewardTimestamp;
        uint256 accRewardsPerShare;
        uint256 totalDeposits;
    }

    IERC20 public immutable rewardToken;

    uint256 public totalRewards;
    uint256 public rewardsPaidOut;

    uint256 public rewardPerSecond;
    uint256 public totalAllocPoint;

    uint256 public startTimestamp;
    uint256 public endTimestamp;

    PoolInfo[] public poolInfo;

    mapping (uint256 => mapping (address => UserInfo)) public userInfo;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Fund(address indexed funder, uint256 rewardAmount);
    event Payout(address indexed user, uint256 pendingReward);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

    constructor(IERC20 _rewardToken, uint256 _rewardPerSecond, uint256 _startTimestamp) Ownable(msg.sender) {
        rewardToken = _rewardToken;
        rewardPerSecond = _rewardPerSecond;
        startTimestamp = _startTimestamp;
        endTimestamp = _startTimestamp;
    }

    function pools() external view returns (uint256) {
        return poolInfo.length;
    }

    // Fund the farm, increase the end block
    function fund(uint256 rewardAmount) external {
        if (block.timestamp >= endTimestamp) revert FarmClosed();
        rewardToken.safeTransferFrom(msg.sender, address(this), rewardAmount);
        endTimestamp += rewardAmount / rewardPerSecond;
        totalRewards += rewardAmount;
        emit Fund(msg.sender, rewardAmount);
    }

    function add(uint256 _allocPoint, IERC20 _pooledToken, bool _withUpdate) external onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardTimestamp = block.timestamp > startTimestamp ? block.timestamp : startTimestamp;
        totalAllocPoint += _allocPoint;
        poolInfo.push(PoolInfo({
            pooledToken: _pooledToken,
            allocPoint: _allocPoint,
            lastRewardTimestamp: lastRewardTimestamp,
            accRewardsPerShare: 0,
            totalDeposits: 0
        }));
    }

    // Update the given pool's ERC20 allocation point. Can only be called by the owner.
    function set(uint256 _pid, uint256 _allocPoint, bool _withUpdate) external onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint -= poolInfo[_pid].allocPoint + _allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    // View function to see deposited LP for a user.
    function deposited(uint256 _pid, address _user) external view returns (uint256) {
        UserInfo storage user = userInfo[_pid][_user];
        return user.amount;
    }

    // View function to see pending ERC20s for a user.
    function pending(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo memory pool = poolInfo[_pid];
        UserInfo memory user = userInfo[_pid][_user];
        uint256 accRewardsPerShare = pool.accRewardsPerShare;

        uint256 pooledTokens = pool.totalDeposits;

        if (block.timestamp > pool.lastRewardTimestamp && pooledTokens != 0) {
            uint256 lastTimestamp = block.timestamp < endTimestamp ? block.timestamp : endTimestamp;
            uint256 timestampToCompare = pool.lastRewardTimestamp < endTimestamp ? pool.lastRewardTimestamp : endTimestamp;
            uint256 timeElapsed = lastTimestamp - timestampToCompare;
            uint256 totalReward = timeElapsed * rewardPerSecond * pool.allocPoint / totalAllocPoint;
            accRewardsPerShare = accRewardsPerShare + totalReward * 1e36 / pooledTokens;
        }
        return user.amount * accRewardsPerShare / 1e36 - user.rewardDebt;
    }

    // View function for total reward the farm has yet to pay out.
    function totalPending() external view returns (uint256) {
        if (block.timestamp <= startTimestamp) {
            return 0;
        }
        uint256 lastTimestamp = block.timestamp < endTimestamp ? block.timestamp : endTimestamp;
        return rewardPerSecond * (lastTimestamp - startTimestamp) - rewardsPaidOut;
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        uint256 lastTimestamp = block.timestamp < endTimestamp ? block.timestamp : endTimestamp;

        if (lastTimestamp <= pool.lastRewardTimestamp) {
            return;
        }
        uint256 lpSupply = pool.totalDeposits;

        if (lpSupply == 0) {
            pool.lastRewardTimestamp = lastTimestamp;
            return;
        }

        uint256 nrOfSeconds = lastTimestamp - pool.lastRewardTimestamp;
        uint256 accRewards = nrOfSeconds * rewardPerSecond * pool.allocPoint / totalAllocPoint;

        pool.accRewardsPerShare += accRewards * 1e36 / lpSupply;
        pool.lastRewardTimestamp = block.timestamp;
    }

    // Deposit LP tokens to Farm for ERC20 allocation.
    function deposit(uint256 _pid, uint256 _amount) external {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        updatePool(_pid);

        if (user.amount > 0) {
            uint256 pendingRewards = user.amount * pool.accRewardsPerShare / 1e36 - user.rewardDebt;
            rewardToken.safeTransfer(msg.sender, pendingRewards);
            rewardsPaidOut += pendingRewards;
            emit Payout(msg.sender, pendingRewards);
        }

        pool.pooledToken.safeTransferFrom(address(msg.sender), address(this), _amount);
        pool.totalDeposits += _amount;

        user.amount += _amount;
        user.rewardDebt = user.amount * pool.accRewardsPerShare / 1e36;
        emit Deposit(msg.sender, _pid, _amount);
    }

    function claim(uint256 _pid) external {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        uint256 pendingRewards = user.amount * pool.accRewardsPerShare / 1e36 - user.rewardDebt;
        rewardToken.safeTransfer(msg.sender, pendingRewards);
        rewardsPaidOut += pendingRewards;
        user.rewardDebt = user.amount * pool.accRewardsPerShare / 1e36;
        emit Payout(msg.sender, pendingRewards);
    }

    // Withdraw LP tokens from Farm.
    function withdraw(uint256 _pid, uint256 _amount) external {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        if (user.amount < _amount) revert UnauthorizedWithdrawal();

        updatePool(_pid);
        uint256 pendingRewards = user.amount * pool.accRewardsPerShare / 1e36 - user.rewardDebt;

        rewardToken.safeTransfer(msg.sender, pendingRewards);
        emit Payout(msg.sender, pendingRewards);

        rewardsPaidOut += pendingRewards;
        user.rewardDebt = user.amount * pool.accRewardsPerShare / 1e36;
        pool.totalDeposits -= _amount;

        pool.pooledToken.safeTransfer(address(msg.sender), _amount);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) external {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        pool.totalDeposits -= user.amount;
        pool.pooledToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);

        user.amount = 0;
        user.rewardDebt = 0;
    }
}
