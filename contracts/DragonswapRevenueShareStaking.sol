// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract DragonswapRevenueShareStaking is Ownable {
    using SafeERC20 for IERC20;

    /// @notice Info of each user
    struct UserInfo {
        uint256 amount;
        mapping(IERC20 => uint256) rewardDebt;
    }

    /// @notice The address of the Dragonswap token
    IERC20 public immutable dragon;

    /// @notice The address where deposit fees will be sent
    address public treasury;
    /// @notice Accumulated fees
    uint256 public fees;
    /// @notice Total Dragon deposited
    uint256 public totalDeposits;
    /// @notice The deposit fee, scaled to 10k
    uint256 public depositFeePercent;
    /// @notice Array of tokens that users can be distributed as rewards to the stakers
    IERC20[] public rewardTokens;
    /// @notice Mapping to check if a token is a reward token
    mapping(IERC20 => bool) public isRewardToken;
    /// @notice Last reward balance of `token`
    mapping(IERC20 => uint256) public lastRewardBalance;
    /// @notice Accumulated `token` rewards per share, scaled to `P`
    mapping(IERC20 => uint256) public accRewardsPerShare;
    /// @dev Info of each user that stakes Dragon
    mapping(address => UserInfo) private userInfo;

    /// @notice The precision of `accRewardsPerShare`
    uint256 public constant P = 1e36;

    /// Events
    event Deposit(address indexed user, uint256 amount, uint256 fee);
    event DepositFeeSet(uint256 indexed fee);
    event TreasurySet(address indexed treasury);
    event Withdraw(address indexed user, uint256 amount);
    event WithdrawFees(uint256 fees);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event Payout(address indexed user, IERC20 indexed rewardToken, uint256 amount);
    event RewardTokenAdded(IERC20 indexed token);
    event RewardTokenRemoved(IERC20 indexed token);
    event Unstuck(address indexed token, address indexed to, uint256 amount);

    /// Errors
    error InvalidAddress();
    error InvalidValue();
    error AlreadyAdded();
    error NoBalance();
    error NotPresent();

    constructor(
        address _dragon,
        address _rewardToken,
        address _treasury,
        uint256 _depositFeePercent
    ) Ownable(msg.sender) {
        if (_dragon == address(0)) revert InvalidAddress();
        if (_rewardToken == address(0)) revert InvalidAddress();
        if (_treasury == address(0)) revert InvalidAddress();
        if (_depositFeePercent > 2_000) revert InvalidValue();

        dragon = IERC20(_dragon);

        depositFeePercent = _depositFeePercent;
        emit DepositFeeSet(_depositFeePercent);

        treasury = _treasury;
        emit TreasurySet(_treasury);

        isRewardToken[IERC20(_rewardToken)] = true;
        rewardTokens.push(IERC20(_rewardToken));
        emit RewardTokenAdded(IERC20(_rewardToken));
    }

    /**
     * @notice Deposit Dragon in order to receive the reward tokens
     * @param amount The amount of Dragon to deposit
     */
    function deposit(uint256 amount) external {
        if (amount == 0) revert InvalidValue();

        UserInfo storage user = userInfo[msg.sender];

        // Compute the fee and deduct it from amount
        uint256 fee = amount * depositFeePercent / 10_000;
        uint256 amountWithoutFee = amount - fee;

        uint256 previousAmount = user.amount;
        uint256 currentAmount = previousAmount + amountWithoutFee;
        user.amount = currentAmount;

        uint256 numberOfRewardTokens = rewardTokens.length;
        for (uint256 i; i < numberOfRewardTokens; i++) {
            IERC20 token = rewardTokens[i];
            _updateAccumulated(token);

            uint256 previousRewardDebt = user.rewardDebt[token];
            uint256 _accRewardsPerShare = accRewardsPerShare[token];
            user.rewardDebt[token] = currentAmount * _accRewardsPerShare / P;

            if (previousAmount != 0) {
                uint256 pending = previousAmount * _accRewardsPerShare / P - previousRewardDebt;
                _payout(token, pending);
            }
        }

        totalDeposits += amountWithoutFee;
        fees += fee;
        dragon.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, amountWithoutFee, fee);
    }

    function getUserInfo(address _user, IERC20 _rewardToken) external view returns (uint256, uint256) {
        UserInfo storage user = userInfo[_user];
        return (user.amount, user.rewardDebt[_rewardToken]);
    }

    /**
     * @notice Get the number of reward tokens
     * @return The length of the array
     */
    function rewardTokensCounter() external view returns (uint256) {
        return rewardTokens.length;
    }

    /**
     * @notice Add a reward token
     * @dev Cannot re-add reward tokens once removed
     * @param _rewardToken The address of the reward token
     */
    function addRewardToken(IERC20 _rewardToken) external onlyOwner {
        if (isRewardToken[_rewardToken] || accRewardsPerShare[_rewardToken] != 0) revert AlreadyAdded();
        if (address(_rewardToken) == address(0)) revert InvalidAddress();

        rewardTokens.push(_rewardToken);
        isRewardToken[_rewardToken] = true;
        emit RewardTokenAdded(_rewardToken);
    }

    /**
     * @notice Remove a reward token
     * @param _rewardToken The address of the reward token
     */
    function removeRewardToken(IERC20 _rewardToken) external onlyOwner {
        if (!isRewardToken[_rewardToken]) revert NotPresent();
        delete isRewardToken[_rewardToken];
        uint256 numberOfRewardTokens = rewardTokens.length;
        for (uint256 i; i < numberOfRewardTokens; i++) {
            if (rewardTokens[i] == _rewardToken) {
                rewardTokens[i] = rewardTokens[numberOfRewardTokens - 1];
                rewardTokens.pop();
                break;
            }
        }
        emit RewardTokenRemoved(_rewardToken);
    }

    /**
     * @notice Set the deposit fee percent
     * @param _depositFeePercent The new deposit fee percent
     */
    function setDepositFeePercent(uint256 _depositFeePercent) external onlyOwner {
        if (_depositFeePercent > 2_000) revert InvalidValue();
        depositFeePercent = _depositFeePercent;
        emit DepositFeeSet(_depositFeePercent);
    }

    /**
     * @notice Set the treasury address
     * @param _treasury The new treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidAddress();
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    /**
     * @notice View function to see pending reward token on frontend
     * @param _user The address of the user
     * @param token The address of the token
     * @return `_user`'s pending reward token
     */
    function pendingRewards(address _user, IERC20 token) external view returns (uint256) {
        if (!isRewardToken[token]) revert InvalidValue();
        UserInfo storage user = userInfo[_user];
        uint256 _totalDeposits = totalDeposits;
        uint256 _accRewardTokenPerShare = accRewardsPerShare[token];

        uint256 currRewardBalance = token.balanceOf(address(this));
        uint256 rewardBalance = token == dragon ? currRewardBalance - _totalDeposits - fees : currRewardBalance;

        if (rewardBalance != lastRewardBalance[token] && _totalDeposits != 0) {
            uint256 accruedReward = rewardBalance - lastRewardBalance[token];
            _accRewardTokenPerShare += accruedReward * P / _totalDeposits;
        }
        return user.amount * _accRewardTokenPerShare / P - user.rewardDebt[token];
    }

    function withdrawFees() external onlyOwner {
        uint256 _fees = fees;
        dragon.safeTransfer(treasury, _fees);
        fees = 0;
        emit WithdrawFees(_fees);
    }

    /**
     * @notice Withdraw Dragon and harvest the rewards
     * @param amount The amount of Dragon to withdraw
     */
    function withdraw(uint256 amount) external {
        UserInfo storage user = userInfo[msg.sender];
        uint256 previousAmount = user.amount;
        if (amount > previousAmount) revert InvalidValue();
        uint256 newAmount = user.amount - amount;
        user.amount = newAmount;

        uint256 numberOfRewardTokens = rewardTokens.length;
        if (previousAmount != 0) {
            for (uint256 i; i < numberOfRewardTokens; i++) {
                IERC20 token = rewardTokens[i];
                _updateAccumulated(token);

                uint256 _accRewardsPerShare = accRewardsPerShare[token];
                uint256 pending = previousAmount * _accRewardsPerShare / P - user.rewardDebt[token];
                user.rewardDebt[token] = newAmount * _accRewardsPerShare / P;

                if (pending != 0) {
                    _payout(token, pending);
                }
            }
        }

        totalDeposits -= amount;
        dragon.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount);
    }

    /**
     * @notice Withdraw without caring about rewards. EMERGENCY ONLY
     */
    function emergencyWithdraw() external {
        UserInfo storage user = userInfo[msg.sender];
        uint256 amount = user.amount;

        if (amount == 0) revert NoBalance();
        user.amount = 0;

        uint256 numberOfRewardTokens = rewardTokens.length;
        for (uint256 i; i < numberOfRewardTokens; i++) {
            IERC20 _token = rewardTokens[i];
            user.rewardDebt[_token] = 0;
        }
        totalDeposits -= amount;
        dragon.safeTransfer(msg.sender, amount);
        emit EmergencyWithdraw(msg.sender, amount);
    }

    /**
     * @dev Update reward variables
     * Needs to be called before any deposit or withdrawal
     * @param token The address of the reward token
     */
    function _updateAccumulated(IERC20 token) private {
        if (!isRewardToken[token]) revert InvalidValue();

        // Gas optimizations
        uint256 _totalDeposits = totalDeposits;
        uint256 _lastRewardBalance = lastRewardBalance[token];

        uint256 balance = token.balanceOf(address(this));
        uint256 rewardBalance = token == dragon ? balance - _totalDeposits - fees : balance;

        if (rewardBalance == _lastRewardBalance || _totalDeposits == 0) return;

        accRewardsPerShare[token] += (rewardBalance - _lastRewardBalance) * P / _totalDeposits;
        lastRewardBalance[token] = rewardBalance;
    }

    function _payout(IERC20 token, uint256 pending) private {
        uint256 currRewardBalance = token.balanceOf(address(this));
        uint256 rewardBalance = token == dragon ? currRewardBalance - totalDeposits - fees : currRewardBalance;
        uint256 amount = pending > rewardBalance ? rewardBalance : pending;
        lastRewardBalance[token] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Payout(msg.sender, token, pending);
    }

    /**
     * @notice Unstuck tokens sent by accident to the `to` address
     * @param token The address of the token to sweep
     * @param to The address that will receive the `token` balance
     */
    function sweep(IERC20 token, address to) external onlyOwner {
        if (isRewardToken[token] || address(token) == address(dragon)) revert InvalidValue();
        uint256 balance = token.balanceOf(address(this));
        if (balance == 0) revert NoBalance();
        token.safeTransfer(to, balance);
        emit Unstuck(address(token), to, balance);
    }
}
