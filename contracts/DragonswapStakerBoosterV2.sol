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
        uint256 accERC20PerShare;
        uint256 totalDeposits;
    }

    IERC20 public immutable rewardToken;
    IERC20 public immutable boosterToken;

    uint256 public paidOut;
    uint256 public rewardPerSecond;
    uint256 public totalRewards;
    uint256 public totalAllocPoint;
    uint256 public startTimestamp;
    uint256 public endTimestamp;

    uint256 public immutable decimalEqReward;
    uint256 public immutable decimalEqBoosted;

    PoolInfo[] public poolInfo;
    mapping (uint256 => mapping (address => UserInfo)) public userInfo;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
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
        uint256 ratio = 10_000 * rewardAmount * decimalEqReward / (boosterAmount * decimalEqBooster);
        if (boostRewardRatio == 0) // save boost ratio with 10k precision
            boostRewardRatio = ratio;
        else
            if (ratio != boostRatio) {
                // figure out which token is a bottleneck and send back the change
            }
        rewardToken.safeTransferFrom(msg.sender, address(this), rewardAmount);
        boosterToken.safeTransferFrom(msg.sender, address(this), boosterAmount);
        // We count in that rewardsPerSecond are aligned with rewardToken decimals
        endTimestamp += rewardAmount / rewardPerSecond;
        totalRewards += rewardAmount;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(uint256 _allocPoint, IERC20 _lpToken, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardTimestamp = block.timestamp > startTimestamp ? block.timestamp : startTimestamp;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(PoolInfo({
            lpToken: _lpToken,
            allocPoint: _allocPoint,
            lastRewardTimestamp: lastRewardTimestamp,
            accERC20PerShare: 0,
            totalDeposits: 0
        }));
    }

    // Update the given pool's ERC20 allocation point. Can only be called by the owner.
    function set(uint256 _pid, uint256 _allocPoint, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint - poolInfo[_pid].allocPoint + _allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    // View function to see deposited LP for a user.
    function deposited(uint256 _pid, address _user) external view returns (uint256) {
        UserInfo storage user = userInfo[_pid][_user];
        return user.amount;
    }

    // View function to see pending ERC20s for a user.
    function pending(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accERC20PerShare = pool.accERC20PerShare;

        uint256 lpSupply = pool.totalDeposits;

        if (block.timestamp > pool.lastRewardTimestamp && lpSupply != 0) {
            uint256 lastTimestamp = block.timestamp < endTimestamp ? block.timestamp : endTimestamp;
            uint256 timestampToCompare = pool.lastRewardTimestamp < endTimestamp ? pool.lastRewardTimestamp : endTimestamp;
            uint256 nrOfSeconds = lastTimestamp - timestampToCompare;
            uint256 erc20Reward = nrOfSeconds * rewardPerSecond * pool.allocPoint / totalAllocPoint;
            accERC20PerShare = accERC20PerShare + erc20Reward * 1e36 / lpSupply;
        }
        return user.amount * accERC20PerShare / 1e36 - user.rewardDebt;
    }

    // View function for total reward the farm has yet to pay out.
    function totalPending() external view returns (uint256) {
        if (block.timestamp <= startTimestamp) {
            return 0;
        }

        uint256 lastTimestamp = block.timestamp < endTimestamp ? block.timestamp : endTimestamp;
        return rewardPerSecond * lastTimestamp - startTimestamp - paidOut;
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
        uint256 erc20Reward = nrOfSeconds * rewardPerSecond * pool.allocPoint / totalAllocPoint;

        pool.accERC20PerShare += erc20Reward * 1e36 / lpSupply;
        pool.lastRewardTimestamp = block.timestamp;
    }

    // Deposit LP tokens to Farm for ERC20 allocation.
    function deposit(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        updatePool(_pid);

        if (user.amount > 0) {
            uint256 pendingAmount = user.amount * pool.accERC20PerShare / 1e36 - user.rewardDebt;
            erc20Transfer(msg.sender, pendingAmount);
        }

        pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
        pool.totalDeposits += _amount;

        user.amount += _amount;
        user.rewardDebt = user.amount * pool.accERC20PerShare / 1e36;
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from Farm.
    function withdraw(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: can't withdraw more than deposit");
        updatePool(_pid);

        uint256 pendingAmount = user.amount * pool.accERC20PerShare / 1e36 - user.rewardDebt;

        erc20Transfer(msg.sender, pendingAmount);
        user.amount -= _amount;
        user.rewardDebt = user.amount * pool.accERC20PerShare / 1e36;
        pool.lpToken.safeTransfer(address(msg.sender), _amount);
        pool.totalDeposits -= _amount;

        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        pool.totalDeposits -= user.amount;
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Transfer ERC20 and update the required ERC20 to payout all rewards
    function erc20Transfer(address _to, uint256 _amount) internal {
        erc20.transfer(_to, _amount);
        paidOut += _amount;
    }
}
