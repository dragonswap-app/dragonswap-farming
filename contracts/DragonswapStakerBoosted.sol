// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

error FarmClosed();
error UnauthorizedWithdrawal();

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}

contract DragonswapStakerBoosted is OwnableUpgradeable {
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

    IERC20 public rewardToken;
    IERC20 public boosterToken;

    uint256 public decimalEqReward;
    uint256 public decimalEqBooster;

    uint256 public totalRewards;
    uint256 public totalBooster;
    uint256 public rewardsPaidOut;
    uint256 public boosterPaidOut;

    uint256 public ratio;

    uint256 public rewardPerSecond;
    uint256 public totalAllocPoint;

    uint256 public startTimestamp;
    uint256 public endTimestamp;

    PoolInfo[] public poolInfo;

    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    // Precision constant used for accumulated rewards per share
    uint256 public constant P1 = 1e18;
    // Precision constant used for reward/booster ratio
    uint256 public constant P2 = 1e7;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Fund(address indexed funder, uint256 rewardAmount, uint256 boosterAmount);
    event Payout(address indexed user, uint256 pendingReward, uint256 pendingBooster);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

    function initialize(
        address _owner,
        IERC20 _rewardToken,
        IERC20 _boosterToken,
        uint256 _rewardPerSecond,
        uint256 _startTimestamp
    ) external initializer {
        __Ownable_init(_owner);

        rewardToken = _rewardToken;
        boosterToken = _boosterToken;
        rewardPerSecond = _rewardPerSecond;
        startTimestamp = _startTimestamp;
        endTimestamp = _startTimestamp;

        uint8 rewardDecimals = IERC20Metadata(address(_rewardToken)).decimals();
        uint8 boosterDecimals = IERC20Metadata(address(_boosterToken)).decimals();

        if (rewardDecimals > boosterDecimals) {
            decimalEqReward = 1;
            decimalEqBooster = 10 ** (rewardDecimals - boosterDecimals);
        } else {
            decimalEqReward = 10 ** (boosterDecimals - rewardDecimals);
            decimalEqBooster = 1;
        }
    }

    function pools() external view returns (uint256) {
        return poolInfo.length;
    }

    function fund(uint256 rewardAmount, uint256 boosterAmount) external {
        if (block.timestamp >= endTimestamp) revert FarmClosed();
        // Transfer tokens optimistically and use allowance
        rewardToken.safeTransferFrom(msg.sender, address(this), rewardAmount);
        boosterToken.safeTransferFrom(msg.sender, address(this), boosterAmount);

        rewardAmount *= decimalEqReward;
        boosterAmount *= decimalEqBooster;

        uint256 inputRatio = (P2 * rewardAmount) / boosterAmount;
        // Gas optimization
        uint256 appliedRatio = ratio;
        if (appliedRatio == 0) {
            ratio = inputRatio;
        } else if (inputRatio > appliedRatio) {
            uint256 rewardAmountChange = rewardAmount - (boosterAmount * appliedRatio) / P2;
            rewardToken.safeTransfer(msg.sender, rewardAmountChange / decimalEqReward);
            rewardAmount -= rewardAmountChange;
        } else if (inputRatio < appliedRatio) {
            uint256 boosterAmountChange = boosterAmount - (rewardAmount * P2) / appliedRatio;
            boosterToken.safeTransfer(msg.sender, boosterAmountChange / decimalEqBooster);
            boosterAmount -= boosterAmountChange;
        }
        rewardAmount /= decimalEqReward;
        boosterAmount /= decimalEqBooster;

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
        poolInfo.push(
            PoolInfo({
                pooledToken: _pooledToken,
                allocPoint: _allocPoint,
                lastRewardTimestamp: lastRewardTimestamp,
                accRewardsPerShare: 0,
                totalDeposits: 0
            })
        );
    }

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

    function pending(
        uint256 _pid,
        address _user
    ) external view returns (uint256 pendingRewards, uint256 pendingBooster) {
        PoolInfo memory pool = poolInfo[_pid];
        UserInfo memory user = userInfo[_pid][_user];
        uint256 accRewardsPerShare = pool.accRewardsPerShare;

        uint256 pooledTokens = pool.totalDeposits;

        if (block.timestamp > pool.lastRewardTimestamp && pooledTokens != 0) {
            uint256 lastTimestamp = block.timestamp < endTimestamp ? block.timestamp : endTimestamp;
            uint256 timeElapsed = lastTimestamp - pool.lastRewardTimestamp;
            uint256 totalReward = (timeElapsed * rewardPerSecond * pool.allocPoint) / totalAllocPoint;
            accRewardsPerShare += (totalReward * P1) / pooledTokens;
        }
        pendingRewards = (user.amount * accRewardsPerShare) / P1 - user.rewardDebt;
        pendingBooster = (pendingRewards * decimalEqReward * P2) / ratio / decimalEqBooster;
    }

    function totalPending() external view returns (uint256 pendingRewards, uint256 pendingBooster) {
        if (block.timestamp <= startTimestamp) {
            return (0, 0);
        }

        uint256 lastTimestamp = block.timestamp < endTimestamp ? block.timestamp : endTimestamp;

        pendingRewards = rewardPerSecond * (lastTimestamp - startTimestamp) - rewardsPaidOut;
        pendingBooster = (pendingRewards * decimalEqReward * P2) / ratio / decimalEqBooster;
    }

    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        uint256 lastTimestamp = block.timestamp < endTimestamp ? block.timestamp : endTimestamp;

        if (lastTimestamp <= pool.lastRewardTimestamp) return;

        uint256 lpSupply = pool.totalDeposits;

        if (lpSupply == 0) {
            pool.lastRewardTimestamp = lastTimestamp;
            return;
        }

        uint256 nrOfSeconds = lastTimestamp - pool.lastRewardTimestamp;
        uint256 accRewards = (nrOfSeconds * rewardPerSecond * pool.allocPoint) / totalAllocPoint;

        pool.accRewardsPerShare += (accRewards * P1) / lpSupply;
        pool.lastRewardTimestamp = lastTimestamp;
    }

    // Deposit LP tokens to Farm for ERC20 allocation.
    function deposit(uint256 _pid, uint256 _amount) external {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        updatePool(_pid);

        if (user.amount > 0) {
            uint256 pendingRewards = (user.amount * pool.accRewardsPerShare) / P1 - user.rewardDebt;
            uint256 pendingBooster = (pendingRewards * decimalEqReward * P2) / ratio / decimalEqBooster;
            rewardToken.safeTransfer(msg.sender, pendingRewards);
            boosterToken.safeTransfer(msg.sender, pendingBooster);
            rewardsPaidOut += pendingRewards;
            boosterPaidOut += pendingBooster;
            emit Payout(msg.sender, pendingRewards, pendingBooster);
        }

        pool.pooledToken.safeTransferFrom(address(msg.sender), address(this), _amount);
        pool.totalDeposits += _amount;

        user.amount += _amount;
        user.rewardDebt = (user.amount * pool.accRewardsPerShare) / P1;
        emit Deposit(msg.sender, _pid, _amount);
    }

    function withdraw(uint256 _pid, uint256 _amount) external {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        if (user.amount < _amount) revert UnauthorizedWithdrawal();

        updatePool(_pid);
        uint256 pendingRewards = (user.amount * pool.accRewardsPerShare) / P1 - user.rewardDebt;
        uint256 pendingBooster = (pendingRewards * decimalEqReward * P2) / ratio / decimalEqBooster;

        rewardToken.safeTransfer(msg.sender, pendingRewards);
        boosterToken.safeTransfer(msg.sender, pendingBooster);
        emit Payout(msg.sender, pendingRewards, pendingBooster);

        rewardsPaidOut += pendingRewards;
        boosterPaidOut += pendingBooster;
        user.amount -= _amount;
        user.rewardDebt = (user.amount * pool.accRewardsPerShare) / P1;
        pool.totalDeposits -= _amount;

        pool.pooledToken.safeTransfer(address(msg.sender), _amount);
        emit Withdraw(msg.sender, _pid, _amount);
    }

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
