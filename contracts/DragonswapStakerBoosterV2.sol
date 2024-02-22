// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

error farmClosed();

contract FarmingXava is Ownable {
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
    IERC20 public immutable boosterToken;

    uint256 public immutable decimalEqReward;
    uint256 public immutable decimalEqBoosted;

    uint256 public totalRewards;
    uint256 public totalBooster;
    uint256 public rewardsPaidOut;
    uint256 public boosterPaidOut;

    uint256 public rewardPerSecond;
    uint256 public totalAllocPoint;

    uint256 public startTimestamp;
    uint256 public endTimestamp;

    PoolInfo[] public poolInfo;

    mapping (uint256 => mapping (address => UserInfo)) public userInfo;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Fund(address indexed funder, uint256 rewardAmount, uint256 boosterAmount);
    event Payout(address indexed user, uint256 pendingReward, uint256 pendingBooster);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

    constructor(IERC20 _rewardToken, IERC20 _boosterToken, uint256 _rewardPerSecond, uint256 _startTimestamp) Ownable(msg.sender) {
        rewardToken = _rewardToken;
        boosterToken = _boosterToken;
        rewardPerSecond = _rewardPerSecond;
        startTimestamp = _startTimestamp;
        endTimestamp = _startTimestamp;

        uint8 rewardDecimals = _rewardToken.decimals();
        uint8 boosterDecimals = _boosterToken.decimals();

        if (rewardDecimals > boosterDecimals) {
            decimalEqReward = 10 ^ (rewardDecimals - boosterDecimals);
            decimalEqBooster = 1;
        } else {
            decimalEqReward = 1;
            decimalEqBooster = 10 ^ (boosterDecimals - rewardDecimals);
        }
    }

    function pools() external view returns (uint256) {
        return poolInfo.length;
    }

    // Fund the farm, increase the end block
    function fund(uint256 rewardAmount, uint256 boosterAmount) external {
        if (block.timestamp >= endTimestamp) revert farmClosed();
        // Transfer tokens optimistically and use allowance
        rewardToken.safeTransferFrom(msg.sender, address(this), rewardAmount);
        boosterToken.safeTransferFrom(msg.sender, address(this), boosterAmount);

        rewardAmount *= decimalEqReward;
        boosterAmount *= decimalEqBooster;

        // Compute ratio with 1e7 precision
        uint256 inputRatio = 1e7 * rewardAmount / boosterAmount;
        // Gas optimization
        uint256 appliedRatio = boostRewardRatio;
        if (appliedRatio == 0) {
            appliedRatio = inputRatio;
        } else if (inputRatio > appliedRatio) {
            uint256 rewardAmountChange = rewardAmount - boosterAmount * appliedRatio / 1e7;
            rewardToken.safeTransfer(msg.sender, rewardAmountChange / decimalEqReward);
            rewardAmount -= rewardAmountChange;
        } else if (inputRatio < appliedRatio) {
            uint256 boosterAmountChange = boosterAmount - rewardAmount * 1e7 / appliedRatio;
            boosterToken.safeTransfer(msg.sender, boosterAmountChange / decimalEqBooster );
            boosterAmount -= boosterAmountChange;
        }
        rewardAmount /= decimalsEqReward;
        boosterAmount /= decimalsEqBooster;
        // We count in that rewardsPerSecond are aligned with rewardToken decimals
        endTimestamp += rewardAmount / rewardPerSecond;
        totalRewards += rewardAmount;
        totalBooster += boosterAmount;

        emit Fund(msg.sender, rewardAmount, boosterAmount);
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
    function pending(uint256 _pid, address _user) external view returns (uint256 pendingRewards, uint256 pendingBooster) {
        PoolInfo memory pool = poolInfo[_pid];
        UserInfo memory user = userInfo[_pid][_user];
        uint256 accERC20PerShare = pool.accERC20PerShare;

        uint256 pooledTokens = pool.totalDeposits;

        if (block.timestamp > pool.lastRewardTimestamp && pooledTokens != 0) {
            uint256 lastTimestamp = block.timestamp < endTimestamp ? block.timestamp : endTimestamp;
            uint256 timestampToCompare = pool.lastRewardTimestamp < endTimestamp ? pool.lastRewardTimestamp : endTimestamp;
            uint256 timeElapsed = lastTimestamp - timestampToCompare;
            uint256 totalReward = timeElapsed * rewardPerSecond * pool.allocPoint / totalAllocPoint;
            accERC20PerShare = accERC20PerShare + totalReward * 1e36 / pooledTokens;
        }
        pendingRewards = user.amount * accERC20PerShare / 1e36 - user.rewardDebt;
        pendingBooster = pendingRewards * decimalEqReward * 1e7 / boostRewardRatio / decimalEqBooster;
    }

    // View function for total reward the farm has yet to pay out.
    function totalPending() external view returns (uint256 pendingRewards, uint256 pendingBooster) {
        if (block.timestamp <= startTimestamp) {
            return 0;
        }

        uint256 lastTimestamp = block.timestamp < endTimestamp ? block.timestamp : endTimestamp;

        pendingRewards = rewardPerSecond * (lastTimestamp - startTimestamp) - paidOut;
        pendingBooster = pendingRewards * decimalEqReward * 1e7 / boostRewardRatio / decimalEqBooster;
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
    function deposit(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        updatePool(_pid);

        if (user.amount > 0) {
            uint256 pendingRewards = user.amount * pool.accRewardsPerShare / 1e36 - user.rewardDebt;
            uint256 pendingBooster = pendingRewards * decimalsEqReward * 1e7 / boostRewardRatio / decimalEqBooster;
            rewardToken.safeTransfer(msg.sender, pendingRewards);
            boosterToken.safeTransfer(msg.sender, pendingBooster);
            rewardPaidOut += pendingRewards;
            boosterPaidOut += pendingBooster;
            emit Payout(msg.sender, pendingRewards, pendingBooster);
        }

        pool.pooledToken.safeTransferFrom(address(msg.sender), address(this), _amount);
        pool.totalDeposits += _amount;

        user.amount += _amount;
        user.rewardDebt = user.amount * pool.accRewardsPerShare / 1e36;
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from Farm.
    function withdraw(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: can't withdraw more than deposit");

        updatePool(_pid);
        uint256 pendingAmount = user.amount * pool.accERC20PerShare / 1e36 - user.rewardDebt;
        uint256 pendingBooster = pendingRewards * decimalsEqReward * 1e7 / boostRewardRatio / decimalEqBooster;

        rewardToken.safeTransfer(msg.sender, pendingAmount);
        boosterToken.safeTransfer(msg.sender, pendingAmount);
        emit Payout(msg.sender, pendingRewards, pendingBooster);

        rewardPaidOut += pendingAmount;
        boosterPaidOut += boosterAmount;
        user.rewardDebt = user.amount * pool.accERC20PerShare / 1e36;
        pool.totalDeposits -= _amount;

        pool.pooledToken.safeTransfer(address(msg.sender), _amount);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        pool.totalDeposits -= user.amount;
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);

        user.amount = 0;
        user.rewardDebt = 0;
    }
}
